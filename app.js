const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const cfg = window.CRM_CONFIG || {};
const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

let currentUser = null;
let currentAnalyst = null;
let people = [];
let stores = [];
let activityTypes = [];
let followupTypes = [];
let selectedAssistants = [];
let selectedFuPerson = null;
let selectedPromoter = null;
let chart = null;
let realtimeChannel = null;
let pendingFinishActivity = null;

const toast = (t) => {
  const x = $('#toast');
  if (!x) return;
  x.textContent = t;
  x.classList.add('show');
  setTimeout(() => x.classList.remove('show'), 2400);
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '';
const mins = (a,b) => Math.max(1, Math.round((new Date(b)-new Date(a))/60000));
const normalize = (s) => String(s ?? '').trim().toUpperCase();
const detFromText = (v) => ((String(v||'').match(/^\s*([0-9]+)/)||[])[1] || '').replace(/^0+(?=\d)/,'');
const ANALYST_PALETTES = [
  { bg:'#fff0f7', border:'#e979ad', strong:'#bf4f87', soft:'#ffd6e9' },
  { bg:'#eef3ff', border:'#6687ef', strong:'#3f60c8', soft:'#dce6ff' },
  { bg:'#effcf5', border:'#58b98a', strong:'#2e8d64', soft:'#d4f5e4' },
  { bg:'#fff7e8', border:'#e8a84f', strong:'#b87924', soft:'#ffe8bb' },
  { bg:'#f5efff', border:'#9b73dc', strong:'#7045b7', soft:'#e6d7ff' },
  { bg:'#eefbff', border:'#52a9c8', strong:'#2b7f9e', soft:'#d2f2fd' },
  { bg:'#fff1ee', border:'#e77f6f', strong:'#b95043', soft:'#ffd9d2' },
  { bg:'#f7f8e9', border:'#9aaa4f', strong:'#6d7d2b', soft:'#edf1c8' },
  { bg:'#fff0fb', border:'#ce6fc1', strong:'#9d4492', soft:'#f6d4f0' },
  { bg:'#f0f4f8', border:'#71859b', strong:'#4c6076', soft:'#dce5ed' }
];

function analystPalette(name='') {
  const key = normalize(name);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  return ANALYST_PALETTES[Math.abs(hash) % ANALYST_PALETTES.length];
}

function analystVars(name='') {
  const p = analystPalette(name);
  return `--analyst-bg:${p.bg};--analyst-border:${p.border};--analyst-strong:${p.strong};--analyst-soft:${p.soft}`;
}

const personKey = (p) => {
  const user = normalize(p.user || p.usuario_fico);
  const name = normalize(p.name || p.nombre_completo);
  const det = String(p.store || p.determinante || '').replace(/\.0$/,'').trim();
  if (user && user !== 'PENDIENTE') return `FICO:${user}`;
  return `NOMBRE:${name}|DET:${det || 'SIN_TIENDA'}`;
};

function setBusy(btn, busy, text='Procesando...') {
  if (!btn) return;
  if (busy) {
    btn.dataset.original = btn.textContent;
    btn.disabled = true;
    btn.textContent = text;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.original || btn.textContent;
  }
}

async function init() {
  bindTabs();
  bindStaticEvents();
  $('#clock').textContent = new Date().toLocaleString('es-MX');
  setInterval(() => $('#clock').textContent = new Date().toLocaleString('es-MX'), 1000);

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    await enterApp(session.user);
  } else {
    showLogin();
  }

  sb.auth.onAuthStateChange(async (_event, session2) => {
    if (session2?.user && (!currentUser || currentUser.id !== session2.user.id)) {
      await enterApp(session2.user);
    }
    if (!session2?.user) {
      showLogin();
    }
  });
}

function showLogin() {
  currentUser = null;
  currentAnalyst = null;
  $('#loginScreen').classList.remove('hidden');
  $('#appShell').classList.add('hidden');
}

async function enterApp(user) {
  currentUser = user;
  const { data, error } = await sb.from('analistas').select('*').eq('user_id', user.id).maybeSingle();
  if (error) {
    $('#loginError').textContent = 'No pude leer tu perfil: ' + error.message;
    return;
  }
  if (!data) {
    $('#loginError').textContent = 'Tu cuenta existe, pero todavía no está vinculada a la tabla ANALISTAS.';
    await sb.auth.signOut();
    return;
  }
  currentAnalyst = data;
  $('#loginScreen').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  $('#whoAmI').textContent = `👤 ${currentAnalyst.nombre}`;
  $('#announcementComposer').classList.toggle('hidden', normalize(currentAnalyst.nombre) !== 'MARIELA');
  $('#activityOwner').value = currentAnalyst.nombre;
  $('#fuOwner').value = currentAnalyst.nombre;
  await loadCatalogs();
  await renderAll();
  subscribeRealtime();
}

function bindTabs() {
  $$('.tab').forEach(b => b.onclick = async () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $$('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + b.dataset.view).classList.add('active');
    if (b.dataset.view === 'estadisticas') await renderStats();
    if (b.dataset.view === 'ranking') await renderRanking();
  });
}

function bindStaticEvents() {
  $('#loginBtn').onclick = login;
  $('#loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  $('#logoutBtn').onclick = async () => { await sb.auth.signOut(); if (realtimeChannel) sb.removeChannel(realtimeChannel); };

  $('#activityType').onchange = e => $('#manualActivityWrap').classList.toggle('hidden', e.target.value !== '__manual');
  $('#activityScope').onchange = e => {
    const v = e.target.value;
    $('#storeWrap').classList.toggle('hidden', v !== 'TIENDA');
    $('#regionWrap').classList.toggle('hidden', v !== 'REGION');
    selectedAssistants = [];
    renderAssistantChips();
  };

  bindPersonSearch($('#assistantSearch'), $('#assistantResults'), p => {
    if (!selectedAssistants.some(x => x.id === p.id)) selectedAssistants.push(p);
    renderAssistantChips();
  }, q => searchPeople(q, $('#activityScope').value, $('#activityStore').value, $('#activityRegion').value));

  bindPersonSearch($('#fuPerson'), $('#fuPersonResults'), p => {
    selectedFuPerson = p;
    $('#fuPerson').value = p.nombre_completo;
    if (!$('#fuStore').value && p.determinante) {
      const s = stores.find(x => x.determinante === p.determinante);
      $('#fuStore').value = s ? storeLabel(s) : p.determinante;
    }
    if (p.region) $('#fuRegion').value = p.region;
  });

  bindPersonSearch($('#promoterSearch'), $('#promoterResults'), async p => {
    selectedPromoter = p;
    $('#promoterSearch').value = p.nombre_completo;
    await renderPromoter();
  });

  $('#startActivity').onclick = startActivity;
  $('#finishMine').onclick = finishMine;
  $('#finishCancel').onclick = closeFinishModal;
  $('#finishConfirm').onclick = confirmFinishActivity;
  $('#finishModal').addEventListener('click', e => { if (e.target.id === 'finishModal') closeFinishModal(); });
  $('#saveFollowup').onclick = saveFollowup;
  $('#loadAttendance').onclick = uploadAttendance;
  $('#loadStores').onclick = uploadStores;
  $('#addActivityCatalog').onclick = addActivityCatalog;
  if ($('#rankingPeriod')) $('#rankingPeriod').onchange = renderRanking;
  $('#publishAnnouncement').onclick = publishAnnouncement;
}


async function login() {
  const btn = $('#loginBtn');
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  $('#loginError').textContent = '';
  if (!email || !password) return $('#loginError').textContent = 'Escribe correo y contraseña.';
  setBusy(btn, true, 'Entrando...');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  setBusy(btn, false);
  if (error) $('#loginError').textContent = error.message;
}

async function loadCatalogs() {
  const [pRes, sRes, aRes, fRes] = await Promise.all([
    sb.from('personas').select('*').order('nombre_completo'),
    sb.from('tiendas').select('*').order('determinante'),
    sb.from('tipos_actividad').select('*').eq('activo', true).order('nombre'),
    sb.from('tipos_seguimiento').select('*').eq('activo', true).order('nombre')
  ]);
  if (pRes.error) toast('Personas: ' + pRes.error.message);
  if (sRes.error) toast('Tiendas: ' + sRes.error.message);
  people = pRes.data || [];
  stores = sRes.data || [];
  activityTypes = aRes.data || [];
  followupTypes = fRes.data || [];
  refreshCatalogUI();
}

function storeLabel(s) {
  return `${s.determinante} — ${s.socio ? s.socio + ' ' : ''}${s.nombre_tienda || ''}${s.region ? ' — ' + s.region : ''}`;
}

function refreshCatalogUI() {
  $('#activityType').innerHTML = activityTypes.map(x => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('') + '<option value="__manual">+ AGREGAR ACTIVIDAD MANUAL</option>';
  $('#fuType').innerHTML = followupTypes.map(x => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('');

  const regs = [...new Set(stores.map(s => s.region).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  ['#activityRegion','#fuRegion'].forEach(id => {
    $(id).innerHTML = '<option value="">Selecciona...</option>' + regs.map(r => `<option>${esc(r)}</option>`).join('');
  });
  $('#storesList').innerHTML = stores.map(s => `<option value="${esc(storeLabel(s))}"></option>`).join('');
  $('#activityCatalogChips').innerHTML = activityTypes.map(a => `<span class="chip">${esc(a.nombre)}</span>`).join('');
}

function searchPeople(q, scope='GENERAL', store='', region='') {
  q = normalize(q);
  let arr = people.filter(p => !q || normalize(p.nombre_completo).includes(q) || normalize(p.usuario_fico).includes(q));
  if (scope === 'TIENDA') {
    const d = detFromText(store);
    if (d) arr = arr.filter(p => String(p.determinante||'') === d);
  }
  if (scope === 'REGION' && region) arr = arr.filter(p => p.region === region);
  return arr.sort((a,b) => ((b.activo?1:0)-(a.activo?1:0)) || normalize(a.nombre_completo).localeCompare(normalize(b.nombre_completo))).slice(0,15);
}

function bindPersonSearch(input, res, callback, filterFn) {
  input.oninput = () => {
    const arr = filterFn ? filterFn(input.value) : searchPeople(input.value);
    const manualLabel = input.value.trim() ? esc(input.value.trim().toUpperCase()) : 'PERSONA';
    res.innerHTML = arr.map((p,i) => `<div class="result" data-i="${i}"><b>${esc(p.nombre_completo)}</b><small>${esc(p.estatus||'')} · ${esc(p.determinante||'SIN TIENDA')} · ${esc(p.region||'')}</small></div>`).join('') +
      `<div class="result" data-manual="1"><b>+ Agregar manualmente “${manualLabel}”</b><small>No está en el catálogo actual</small></div>`;
    res.classList.add('show');
    [...res.querySelectorAll('[data-i]')].forEach(el => el.onclick = () => {
      callback(arr[+el.dataset.i]);
      res.classList.remove('show');
      if (input !== $('#fuPerson') && input !== $('#promoterSearch')) input.value = '';
    });
    const m = res.querySelector('[data-manual]');
    if (m) m.onclick = async () => {
      const n = normalize(input.value || prompt('Nombre completo:') || '');
      if (!n) return;
      const p = await createManualPerson(n);
      if (!p) return;
      callback(p);
      res.classList.remove('show');
      if (input !== $('#fuPerson') && input !== $('#promoterSearch')) input.value = '';
    };
  };
  input.onfocus = () => { if (input.value) input.oninput(); };
}

async function createManualPerson(name) {
  const det = detFromText($('#activityStore')?.value || $('#fuStore')?.value || '');
  const region = $('#activityRegion')?.value || $('#fuRegion')?.value || '';
  const payload = {
    clave: personKey({ name, store: det }),
    nombre_completo: name,
    usuario_fico: null,
    perfil: 'MANUAL',
    estatus: 'MANUAL',
    determinante: det || null,
    region: region || null,
    origen: 'MANUAL',
    activo: true
  };
  const { data, error } = await sb.from('personas').upsert(payload, { onConflict: 'clave' }).select().single();
  if (error) { toast('No pude agregar persona: ' + error.message); return null; }
  const idx = people.findIndex(x => x.id === data.id);
  if (idx >= 0) people[idx] = data; else people.unshift(data);
  toast('Persona manual agregada');
  return data;
}

function renderAssistantChips() {
  $('#selectedAssistants').innerHTML = selectedAssistants.map((p,i) => `<span class="chip">${esc(p.nombre_completo)} <button data-rm="${i}">×</button></span>`).join('');
  $$('[data-rm]').forEach(b => b.onclick = () => { selectedAssistants.splice(+b.dataset.rm,1); renderAssistantChips(); });
}

async function startActivity() {
  const btn = $('#startActivity');
  const typeVal = $('#activityType').value;
  let typeId = typeVal;
  let manual = null;

  if (typeVal === '__manual') {
    const name = normalize($('#manualActivity').value);
    if (!name) return toast('Escribe la actividad manual');
    const { data, error } = await sb.from('tipos_actividad').upsert({ nombre: name, activo: true }, { onConflict: 'nombre' }).select().single();
    if (error) return toast('No pude crear actividad: ' + error.message);
    typeId = data.id;
    manual = name;
    if (!activityTypes.some(x => x.id === data.id)) activityTypes.push(data);
    refreshCatalogUI();
  }

  const scope = $('#activityScope').value;
  const det = scope === 'TIENDA' ? detFromText($('#activityStore').value) : null;
  const region = scope === 'REGION' ? $('#activityRegion').value : null;
  if (scope === 'TIENDA' && !det) return toast('Selecciona una tienda válida');
  if (scope === 'REGION' && !region) return toast('Selecciona una región');

  setBusy(btn, true, 'Iniciando...');
  // V5: se permiten varias actividades EN_CURSO para la misma analista.
  // Cada actividad se finaliza de forma independiente desde su tarjeta en el tablero.

  const payload = {
    analista_id: currentAnalyst.id,
    tipo_actividad_id: typeId,
    actividad_manual: manual,
    alcance: scope,
    determinante: det || null,
    region: region || null,
    notas: $('#activityNote').value.trim() || null,
    estatus: 'EN_CURSO',
    inicio: new Date().toISOString()
  };
  const { data, error } = await sb.from('actividades').insert(payload).select().single();
  if (error) { setBusy(btn,false); return toast('No pude iniciar: ' + error.message); }

  if (selectedAssistants.length) {
    const rows = selectedAssistants.map(p => ({ actividad_id: data.id, persona_id: p.id }));
    const r = await sb.from('actividad_asistentes').insert(rows);
    if (r.error) toast('Actividad creada, pero faltaron asistentes: ' + r.error.message);
  }

  selectedAssistants = [];
  renderAssistantChips();
  $('#activityNote').value = '';
  $('#manualActivity').value = '';
  setBusy(btn,false);
  toast('Actividad iniciada · puedes tener varias en curso');
  await renderAll();
}

async function finishMine(activityId = null) {
  let act = null;
  let error = null;

  if (activityId) {
    const res = await sb.from('actividades')
      .select('id,inicio,determinante,region,actividad_manual,notas,analista_id,tipos_actividad(nombre)')
      .eq('id', activityId)
      .eq('analista_id', currentAnalyst.id)
      .eq('estatus','EN_CURSO')
      .maybeSingle();
    act = res.data; error = res.error;
  } else {
    const res = await sb.from('actividades')
      .select('id,inicio,determinante,region,actividad_manual,notas,analista_id,tipos_actividad(nombre)')
      .eq('analista_id', currentAnalyst.id)
      .eq('estatus','EN_CURSO')
      .order('inicio',{ascending:false})
      .limit(1)
      .maybeSingle();
    act = res.data; error = res.error;
  }

  if (error) return toast(error.message);
  if (!act) return toast('No tienes una actividad activa');

  pendingFinishActivity = act;
  const type = act.tipos_actividad?.nombre || act.actividad_manual || 'ACTIVIDAD';
  const place = act.determinante ? `Tienda ${act.determinante}` : (act.region || 'General');
  $('#finishSummary').innerHTML = `<b>${esc(type)}</b><br><span>${esc(place)} · iniciada ${fmt(act.inicio)}</span>`;
  $('#finishResult').value = '';
  $('#finishModal').classList.remove('hidden');
  setTimeout(() => $('#finishResult').focus(), 50);
}

function closeFinishModal() {
  pendingFinishActivity = null;
  $('#finishModal').classList.add('hidden');
}

async function confirmFinishActivity() {
  if (!pendingFinishActivity) return;
  const btn = $('#finishConfirm');
  setBusy(btn,true,'Finalizando...');
  const fin = new Date().toISOString();
  const cierre = $('#finishResult').value.trim() || null;
  const r = await sb.from('actividades')
    .update({ estatus:'FINALIZADA', fin, cierre })
    .eq('id', pendingFinishActivity.id)
    .eq('analista_id', currentAnalyst.id)
    .eq('estatus','EN_CURSO');
  setBusy(btn,false);
  if (r.error) return toast('No pude finalizar: ' + r.error.message);
  closeFinishModal();
  toast('✅ Actividad finalizada');
  await renderAll();
}

async function renderAll() {
  await Promise.all([renderAnnouncements(), renderLive(), renderRecentActivities(), renderRecentFollowups()]);
}

async function renderAnnouncements() {
  const { data, error } = await sb.from('anuncios')
    .select('id,mensaje,created_at,activo,analistas(nombre)')
    .eq('activo', true)
    .order('created_at', { ascending:false });
  if (error) {
    $('#announcementsList').innerHTML = '';
    $('#announcementsEmpty').textContent = 'No pude cargar anuncios: ' + error.message;
    $('#announcementsEmpty').style.display = 'block';
    return;
  }
  const rows = data || [];
  $('#announcementsEmpty').style.display = rows.length ? 'none' : 'block';
  $('#announcementsList').innerHTML = rows.map(x => {
    const canClose = normalize(currentAnalyst?.nombre) === 'MARIELA';
    return `<div class="announcement-card"><div class="announcement-pin">📌</div><div class="announcement-content"><div class="announcement-message">${esc(x.mensaje)}</div><div class="announcement-meta">Publicado por ${esc(x.analistas?.nombre || 'MARIELA')} · ${fmt(x.created_at)}</div></div>${canClose ? `<button class="announcement-close" data-close-announcement="${x.id}" title="Cerrar anuncio">×</button>` : ''}</div>`;
  }).join('');
  $('#announcementsList').querySelectorAll('[data-close-announcement]').forEach(btn => {
    btn.onclick = () => closeAnnouncement(btn.dataset.closeAnnouncement);
  });
}

async function publishAnnouncement() {
  if (normalize(currentAnalyst?.nombre) !== 'MARIELA') return toast('Solo MARIELA puede publicar anuncios');
  const txt = $('#announcementText').value.trim();
  if (!txt) return toast('Escribe el anuncio');
  const btn = $('#publishAnnouncement');
  setBusy(btn,true,'Publicando...');
  const { error } = await sb.from('anuncios').insert({
    mensaje: txt,
    autor_id: currentAnalyst.id,
    activo: true
  });
  setBusy(btn,false);
  if (error) return toast('No pude publicar: ' + error.message);
  $('#announcementText').value = '';
  toast('📣 Anuncio publicado');
  await renderAnnouncements();
}

async function closeAnnouncement(id) {
  if (normalize(currentAnalyst?.nombre) !== 'MARIELA') return;
  const { error } = await sb.from('anuncios').update({ activo:false }).eq('id', id);
  if (error) return toast('No pude cerrar el anuncio: ' + error.message);
  toast('Anuncio cerrado');
  await renderAnnouncements();
}

async function renderLive() {
  const { data, error } = await sb.from('actividades')
    .select('id,inicio,notas,alcance,region,determinante,actividad_manual,analistas(nombre),tipos_actividad(nombre),tiendas(nombre_tienda,socio),actividad_asistentes(personas(nombre_completo))')
    .eq('estatus','EN_CURSO').order('inicio',{ascending:false});
  if (error) return toast('En vivo: ' + error.message);
  const c = $('#liveCards');
  c.innerHTML = (data||[]).map(x => {
    const attendees = (x.actividad_asistentes||[]).map(a=>a.personas?.nombre_completo).filter(Boolean);
    const type = x.tipos_actividad?.nombre || x.actividad_manual || 'ACTIVIDAD';
    const place = x.determinante ? `🏪 ${esc(x.determinante)}${x.tiendas?.nombre_tienda ? ' — '+esc(x.tiendas.nombre_tienda):''}` : (x.region ? `📍 ${esc(x.region)}` : '');
    const analystName = x.analistas?.nombre || '';
    const mine = analystName === currentAnalyst?.nombre;
    return `<div class="card analyst-card" style="${analystVars(analystName)}"><span class="badge analyst-badge">🟢 EN CURSO</span><h3><span class="analyst-dot"></span>${esc(analystName)}</h3><b>${esc(type)}</b>${place?`<div class="meta">${place}</div>`:''}${attendees.length?`<div class="meta">👥 ${attendees.length} asistentes</div>`:''}<div class="meta">Desde ${fmt(x.inicio)}</div>${x.notas?`<div class="meta">📝 ${esc(x.notas)}</div>`:''}${mine?`<button class="finish-card-btn" data-finish-id="${x.id}">✅ Finalizar actividad</button>`:''}</div>`;
  }).join('');
  c.querySelectorAll('[data-finish-id]').forEach(btn => {
    btn.onclick = () => finishMine(btn.dataset.finishId);
  });
  $('#liveEmpty').style.display = data?.length ? 'none' : 'block';
}

async function renderRecentActivities() {
  const { data, error } = await sb.from('actividades')
    .select('inicio,fin,region,determinante,actividad_manual,cierre,analistas(nombre),tipos_actividad(nombre),tiendas(nombre_tienda)')
    .eq('estatus','FINALIZADA').order('fin',{ascending:false}).limit(10);
  if (error) return;
  $('#recentActivities').innerHTML = (data||[]).map(x => {
    const analystName = x.analistas?.nombre || '';
    return `<div class="event finished-event analyst-event" style="${analystVars(analystName)}"><div class="row"><b><span class="analyst-dot"></span>✅ ${esc(analystName)} · ${esc(x.tipos_actividad?.nombre||x.actividad_manual||'ACTIVIDAD')}</b><span class="badge badge-done">FINALIZADA</span></div><div class="meta">${fmt(x.inicio)} → ${fmt(x.fin)} · <b>${x.fin?mins(x.inicio,x.fin)+' min':''}</b> · ${esc(x.determinante||x.region||'GENERAL')}</div>${x.cierre?`<div class="close-note">📝 ${esc(x.cierre)}</div>`:''}</div>`;
  }).join('') || '<div class="empty">Sin actividades finalizadas todavía.</div>';
}

async function renderRecentFollowups() {
  const { data, error } = await sb.from('seguimientos')
    .select('id,fecha,determinante,region,motivo,analistas(nombre),tipos_seguimiento(nombre),seguimiento_personas(personas(nombre_completo))')
    .order('fecha',{ascending:false}).limit(10);
  if (error) return;
  $('#recentFollowups').innerHTML = (data||[]).map(x => {
    const names=(x.seguimiento_personas||[]).map(p=>p.personas?.nombre_completo).filter(Boolean).join(', ');
    const analystName = x.analistas?.nombre || '';
    return `<div class="event analyst-event" style="${analystVars(analystName)}"><div class="row"><b>${esc(names||'Promotor')} · ${esc(x.tipos_seguimiento?.nombre||'SEGUIMIENTO')}</b><small>${fmt(x.fecha)}</small></div><small><span class="analyst-dot"></span>${esc(analystName)} · ${esc(x.determinante||x.region||'')}</small></div>`;
  }).join('') || '<div class="empty">Sin seguimientos todavía.</div>';
}

async function saveFollowup() {
  if (!selectedFuPerson) return toast('Selecciona un promotor');
  const btn = $('#saveFollowup');
  setBusy(btn,true,'Guardando...');
  const det = detFromText($('#fuStore').value) || selectedFuPerson.determinante || null;
  const region = $('#fuRegion').value || selectedFuPerson.region || null;
  const payload = {
    analista_id: currentAnalyst.id,
    tipo_seguimiento_id: $('#fuType').value || null,
    determinante: det || null,
    region: region || null,
    motivo: $('#fuReason').value.trim() || null,
    comentario: $('#fuComment').value.trim() || null,
    fecha: new Date().toISOString()
  };
  const { data: seg, error } = await sb.from('seguimientos').insert(payload).select().single();
  if (error) { setBusy(btn,false); return toast('No pude guardar: ' + error.message); }

  const link = await sb.from('seguimiento_personas').insert({ seguimiento_id: seg.id, persona_id: selectedFuPerson.id });
  if (link.error) toast('Seguimiento creado, pero falló vínculo de promotor');

  const files = [...$('#fuEvidence').files];
  for (const file of files) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path = `${seg.id}/${crypto.randomUUID()}-${safe}`;
    const up = await sb.storage.from('evidencias').upload(path, file, { upsert:false, contentType:file.type || undefined });
    if (up.error) { toast('No pude subir ' + file.name); continue; }
    await sb.from('evidencias').insert({ seguimiento_id: seg.id, nombre_archivo:file.name, ruta_archivo:path, tipo_archivo:file.type || null });
  }

  setBusy(btn,false);
  toast('Seguimiento guardado');
  $('#fuReason').value=''; $('#fuComment').value=''; $('#fuEvidence').value=''; $('#fuPerson').value='';
  selectedFuPerson = null;
  await renderAll();
  if (selectedPromoter) await renderPromoter();
}

async function renderPromoter() {
  if (!selectedPromoter) return;
  const p = selectedPromoter;
  const profile = $('#promoterProfile');
  profile.classList.remove('hidden');
  profile.innerHTML = `<h2>${esc(p.nombre_completo)}</h2><div><b>Usuario FICO:</b> ${esc(p.usuario_fico||'SIN DATO')}</div><div><b>Estatus actual:</b> ${esc(p.estatus||'')}</div><div><b>Tienda actual:</b> ${esc(p.determinante||'SIN TIENDA')}</div><div><b>Región:</b> ${esc(p.region||'')}</div><div><b>Origen:</b> ${esc(p.origen||'')}</div>`;

  const { data, error } = await sb.from('seguimiento_personas')
    .select('seguimientos(id,fecha,determinante,region,motivo,comentario,analistas(nombre),tipos_seguimiento(nombre),evidencias(id,nombre_archivo,ruta_archivo,tipo_archivo))')
    .eq('persona_id', p.id);
  if (error) return toast('No pude cargar historial: ' + error.message);
  const rows = (data||[]).map(x=>x.seguimientos).filter(Boolean).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const html = [];
  for (const x of rows) {
    const ev = [];
    for (const f of (x.evidencias||[])) {
      const signed = await sb.storage.from('evidencias').createSignedUrl(f.ruta_archivo, 3600);
      const url = signed.data?.signedUrl || '#';
      if ((f.tipo_archivo||'').startsWith('image/')) ev.push(`<a href="${esc(url)}" target="_blank"><img src="${esc(url)}" alt="${esc(f.nombre_archivo)}"></a>`);
      else ev.push(`<a class="file-link" href="${esc(url)}" target="_blank">📎 ${esc(f.nombre_archivo)}</a>`);
    }
    html.push(`<div class="event"><div class="row"><b>${esc(x.analistas?.nombre)} · ${esc(x.tipos_seguimiento?.nombre||'SEGUIMIENTO')}</b><small>${fmt(x.fecha)}</small></div><div class="meta">${x.determinante?`🏪 ${esc(x.determinante)}`:''}${x.region?` · 📍 ${esc(x.region)}`:''}</div>${x.motivo?`<p><b>Motivo:</b> ${esc(x.motivo)}</p>`:''}${x.comentario?`<p>${esc(x.comentario)}</p>`:''}${ev.length?`<div class="evidence">${ev.join('')}</div>`:''}</div>`);
  }
  $('#promoterTimeline').innerHTML = html.join('') || '<div class="empty">Este promotor todavía no tiene seguimientos.</div>';
}

function rankingStart(period) {
  const now = new Date();
  if (period === 'today') {
    const d = new Date(now); d.setHours(0,0,0,0); return d;
  }
  if (period === 'week') {
    const d = new Date(now); d.setHours(0,0,0,0);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff); return d;
  }
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null;
}

async function renderRanking() {
  const box = $('#activityRanking');
  if (!box) return;
  const period = $('#rankingPeriod')?.value || 'week';
  box.innerHTML = '<div class="empty">Calculando ranking...</div>';
  let q = sb.from('actividades')
    .select('id,inicio,fin,analista_id,analistas(nombre)')
    .eq('estatus','FINALIZADA')
    .not('fin','is',null)
    .order('fin',{ascending:false})
    .limit(10000);
  const start = rankingStart(period);
  if (start) q = q.gte('fin', start.toISOString());
  const { data, error } = await q;
  if (error) {
    box.innerHTML = `<div class="empty">No pude calcular el ranking: ${esc(error.message)}</div>`;
    return;
  }

  const by = {};
  for (const x of (data || [])) {
    const name = x.analistas?.nombre || 'SIN ANALISTA';
    if (!by[name]) by[name] = { name, count:0, minutes:0, last:null };
    by[name].count++;
    if (x.inicio && x.fin) by[name].minutes += mins(x.inicio, x.fin);
    if (!by[name].last || new Date(x.fin) > new Date(by[name].last)) by[name].last = x.fin;
  }
  const rows = Object.values(by).sort((a,b) => b.count-a.count || a.minutes-b.minutes || a.name.localeCompare(b.name));
  const total = rows.reduce((s,x)=>s+x.count,0);
  const label = period === 'today' ? 'hoy' : period === 'week' ? 'esta semana' : period === 'month' ? 'este mes' : 'en todo el historial';
  if ($('#rankingSummary')) $('#rankingSummary').innerHTML = `<b>${total}</b> actividades finalizadas ${label} · <b>${rows.length}</b> analistas con cierres`;
  if (!rows.length) {
    box.innerHTML = '<div class="empty">Todavía no hay actividades finalizadas en este periodo.</div>';
    return;
  }
  const max = rows[0].count || 1;
  box.innerHTML = rows.map((x,i) => {
    const medal = i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : `#${i+1}`;
    const avg = x.count ? Math.round(x.minutes/x.count) : 0;
    return `<div class="ranking-row" style="${analystVars(x.name)}">
      <div class="ranking-place">${medal}</div>
      <div class="ranking-person"><span class="analyst-dot"></span><b>${esc(x.name)}</b><small>Última finalizada: ${fmt(x.last)}</small></div>
      <div class="ranking-progress"><div class="ranking-bar"><span style="width:${Math.max(6,Math.round(x.count/max*100))}%"></span></div></div>
      <div class="ranking-count"><strong>${x.count}</strong><small>finalizadas</small></div>
      <div class="ranking-time"><strong>${(x.minutes/60).toFixed(1)} h</strong><small>${avg} min prom.</small></div>
    </div>`;
  }).join('');
}

async function renderStats() {
  const { data, error } = await sb.from('actividades')
    .select('inicio,fin,determinante,region,actividad_manual,tipos_actividad(nombre)')
    .eq('estatus','FINALIZADA').not('fin','is',null).order('fin',{ascending:false}).limit(3000);
  if (error) return toast('Estadísticas: ' + error.message);
  const byAct = {}, byScope = {};
  for (const x of (data||[])) {
    const m = mins(x.inicio,x.fin);
    const name = x.tipos_actividad?.nombre || x.actividad_manual || 'OTRA';
    byAct[name] = (byAct[name]||0)+m;
    const scope = x.determinante ? `Tienda ${x.determinante}` : (x.region || 'General');
    byScope[scope] = (byScope[scope]||0)+m;
  }
  const labels = Object.keys(byAct).sort((a,b)=>byAct[b]-byAct[a]);
  const values = labels.map(x=>byAct[x]);
  if (chart) chart.destroy();
  chart = new Chart($('#activityChart'), { type:'pie', data:{ labels, datasets:[{ data:values }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{tooltip:{callbacks:{label:(ctx)=>`${ctx.label}: ${(ctx.raw/60).toFixed(1)} h`}}} } });
  const top = Object.entries(byScope).sort((a,b)=>b[1]-a[1]).slice(0,20);
  const max = top[0]?.[1] || 1;
  $('#scopeStats').innerHTML = top.map(([k,v])=>`<div class="barrow"><span>${esc(k)}</span><div class="bar"><span style="width:${Math.round(v/max*100)}%"></span></div><b>${(v/60).toFixed(1)} h</b></div>`).join('') || '<div class="empty">Aún no hay actividades finalizadas.</div>';
}

async function addActivityCatalog() {
  const input = $('#newActivityCatalog');
  const name = normalize(input.value);
  if (!name) return;
  const { data, error } = await sb.from('tipos_actividad').upsert({ nombre:name, activo:true }, { onConflict:'nombre' }).select().single();
  if (error) return toast(error.message);
  input.value='';
  if (!activityTypes.some(x=>x.id===data.id)) activityTypes.push(data);
  activityTypes.sort((a,b)=>a.nombre.localeCompare(b.nombre));
  refreshCatalogUI();
  toast('Actividad agregada');
}

function readWorkbook(file) {
  return new Promise((ok,no) => {
    const r = new FileReader();
    r.onload = e => { try { ok(XLSX.read(e.target.result,{type:'array'})); } catch(err){ no(err); } };
    r.onerror = () => no(r.error);
    r.readAsArrayBuffer(file);
  });
}
function rowObjects(ws) { return XLSX.utils.sheet_to_json(ws,{defval:'',raw:false}); }
function chunks(arr,n=300){ const out=[]; for(let i=0;i<arr.length;i+=n)out.push(arr.slice(i,i+n)); return out; }

async function uploadStores() {
  const f = $('#storesFile').files[0];
  if (!f) return toast('Selecciona un archivo');
  const btn = $('#loadStores'); setBusy(btn,true,'Actualizando...');
  try {
    const wb = await readWorkbook(f);
    const ws = wb.Sheets[wb.SheetNames.find(n=>normalize(n).includes('BASE DE TIENDAS')) || wb.SheetNames[0]];
    const rows = rowObjects(ws), next=[];
    for (const r of rows) {
      const m = Object.fromEntries(Object.keys(r).map(k=>[normalize(k),r[k]]));
      const det = String(m['NUMERO DE TIENDA/DETERMINANTE'] || m['DETERMINANTE'] || '').replace(/\.0$/,'').trim();
      if (!det) continue;
      next.push({
        determinante:det,
        nombre_tienda:normalize(m['TIENDA'] || m['NOMBRE DE LA TIENDA']),
        region:normalize(m['REGION']), socio:normalize(m['SOCIO']), estado:normalize(m['ESTADO']),
        estatus:normalize(m['ESTATUS']), team_lider:normalize(m['TEAM LIDER']), updated_at:new Date().toISOString()
      });
    }
    if (!next.length) throw new Error('No encontré determinantes');
    for (const part of chunks(next)) {
      const r = await sb.from('tiendas').upsert(part,{onConflict:'determinante'});
      if (r.error) throw r.error;
    }
    await sb.from('importaciones').insert({tipo:'BASE_TIENDAS',nombre_archivo:f.name,registros:next.length});
    $('#storesStatus').textContent = `${next.length} tiendas compartidas · ${new Date().toLocaleString('es-MX')}`;
    toast('BASE DE TIENDAS actualizada');
    await loadCatalogs();
  } catch(e) { toast('No pude leer tiendas: '+e.message); }
  finally { setBusy(btn,false); }
}

async function uploadAttendance() {
  const f = $('#attendanceFile').files[0];
  if (!f) return toast('Selecciona un archivo');
  const btn = $('#loadAttendance'); setBusy(btn,true,'Actualizando...');
  try {
    const wb = await readWorkbook(f);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = rowObjects(ws), next=[];
    for (const r of rows) {
      const m = Object.fromEntries(Object.keys(r).map(k=>[normalize(k),r[k]]));
      const name = normalize(m['NOMBRE COMPLETO']);
      if (!name) continue;
      const det = String(m['DETERMINANTE']||'').replace(/\.0$/,'').trim();
      const user = normalize(m['USUARIO'] || m['USUARIO FICO']);
      const item = {
        nombre_completo:name,
        usuario_fico:user && user !== 'PENDIENTE' ? user : null,
        perfil:normalize(m['PERFIL DE PUESTO'] || m['PERFIL DE PUESTO BANCO']),
        estatus:normalize(m['ESTATUS']) || 'ACTIVO',
        determinante:det || null,
        region:normalize(m['REGION']) || null,
        origen:'ASISTENCIA', activo:true,
        updated_at:new Date().toISOString()
      };
      item.clave = personKey({name:item.nombre_completo,user:item.usuario_fico,store:item.determinante});
      next.push(item);
    }
    if (!next.length) throw new Error('No encontré NOMBRE COMPLETO');
    const off = await sb.from('personas').update({activo:false,updated_at:new Date().toISOString()}).eq('origen','ASISTENCIA');
    if (off.error) throw off.error;
    for (const part of chunks(next)) {
      const r = await sb.from('personas').upsert(part,{onConflict:'clave'});
      if (r.error) throw r.error;
    }
    await sb.from('importaciones').insert({tipo:'ASISTENCIA',nombre_archivo:f.name,registros:next.length});
    $('#attendanceStatus').textContent = `${next.length} personas compartidas · ${new Date().toLocaleString('es-MX')}`;
    toast('ASISTENCIA actualizada');
    await loadCatalogs();
  } catch(e) { toast('No pude leer ASISTENCIA: '+e.message); }
  finally { setBusy(btn,false); }
}

function subscribeRealtime() {
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb.channel('mesa-control-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'actividades'},async()=>{ await renderLive(); await renderRecentActivities(); if ($('#view-ranking')?.classList.contains('active')) await renderRanking(); })
    .on('postgres_changes',{event:'*',schema:'public',table:'seguimientos'},async()=>{ await renderRecentFollowups(); if(selectedPromoter) await renderPromoter(); })
    .on('postgres_changes',{event:'*',schema:'public',table:'anuncios'},async()=>{ await renderAnnouncements(); })
    .subscribe();
  setInterval(() => { if (currentUser) renderLive(); }, 20000);
}

init();
