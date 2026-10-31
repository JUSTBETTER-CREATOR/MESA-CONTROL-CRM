/* ==========================================================
   BETTER CONTROL · LISSET COORDINACIÓN V2
   Cargar DESPUÉS de app.js
   - LISSET conserva rol GLOBAL y área base CPRO
   - Puede revisar todas las áreas
   - Puede crear actividades nuevas en el área seleccionada
   - Puede iniciar y finalizar sus propias actividades
   - Ingrid / Paloma siguen como GLOBAL de consulta
   ========================================================== */
(() => {
  const LISSET_EMAIL = 'LISSET.CO@BETTERGROUP.MX';
  let patchedForUser = null;

  const norm = (v) => String(v ?? '').trim().toUpperCase();
  const isLisset = () => {
    try { return norm(currentAnalyst?.email) === LISSET_EMAIL; }
    catch { return false; }
  };

  function ensureCoordinationBanner() {
    const view = document.querySelector('#view-actividad .window-body');
    if (!view || document.getElementById('lissetCoordinationBanner')) return;
    const box = document.createElement('div');
    box.id = 'lissetCoordinationBanner';
    box.style.cssText = 'grid-column:1/-1;padding:10px 12px;border:1px solid #9fc9c1;border-radius:10px;background:#eefaf7;color:#355f58;font-size:13px;margin-bottom:4px';
    box.innerHTML = '<b>🌐 Modo Coordinación</b><br><span>Las actividades y tareas nuevas quedarán dentro del área que estés revisando.</span>';
    view.prepend(box);
  }

  async function createLissetActivityForArea(rawName) {
    if (!isLisset()) return null;
    const name = norm(rawName || '');
    if (!name) { toast('Escribe el nombre de la actividad'); return null; }
    if (!activeAreaId) { toast('Selecciona un área'); return null; }

    const existing = await sb.from('tipos_actividad')
      .select('*')
      .eq('area_id', activeAreaId)
      .ilike('nombre', name)
      .limit(1)
      .maybeSingle();

    if (existing.error) {
      toast('No pude revisar el catálogo: ' + existing.error.message);
      return null;
    }

    let data, error;
    if (existing.data) {
      ({ data, error } = await sb.from('tipos_actividad')
        .update({ activo: true })
        .eq('id', existing.data.id)
        .select()
        .single());
    } else {
      ({ data, error } = await sb.from('tipos_actividad')
        .insert({ nombre: name, activo: true, area_id: activeAreaId })
        .select()
        .single());
    }

    if (error) {
      toast('No pude crear la actividad: ' + error.message);
      return null;
    }

    if (typeof loadCatalogs === 'function') await loadCatalogs();
    const created = activityTypes?.find(x => x.id === data.id) || data;
    selectedActivityType = created;

    const type = document.querySelector('#activityType');
    const search = document.querySelector('#activitySearch');
    const label = document.querySelector('#activitySelectedLabel');
    if (type) type.value = created.id;
    if (search) search.value = created.nombre;
    if (label) label.textContent = `Seleccionada: ${created.nombre}`;

    toast(`Actividad creada en ${activeAreaName || 'el área seleccionada'} ♡`);
    return created;
  }

  async function addQuickLissetActivity() {
    const input = document.querySelector('#quickNewActivityCatalog');
    if (!input) return;
    const created = await createLissetActivityForArea(input.value);
    if (created) {
      input.value = '';
      document.querySelector('#activityResults')?.classList.remove('show');
    }
  }

  async function addLissetCatalogActivity() {
    const input = document.querySelector('#newActivityCatalog');
    if (!input) return;
    const created = await createLissetActivityForArea(input.value);
    if (created) input.value = '';
  }

  async function startLissetCoordinationActivity() {
    if (!isLisset()) return;
    const btn = document.querySelector('#startActivity');
    const typeVal = selectedActivityType?.id || document.querySelector('#activityType')?.value;
    if (!typeVal || typeVal === '__manual') return toast('Busca y selecciona una actividad');

    const scope = document.querySelector('#activityScope')?.value || 'GENERAL';
    const det = scope === 'TIENDA' ? detFromText(document.querySelector('#activityStore')?.value || '') : null;
    const region = scope === 'REGION' ? (document.querySelector('#activityRegion')?.value || null) : null;
    if (scope === 'TIENDA' && !det) return toast('Selecciona una tienda válida');
    if (scope === 'REGION' && !region) return toast('Selecciona una región');

    setBusy(btn, true, 'Iniciando...');
    const payload = {
      analista_id: currentAnalyst.id,
      tipo_actividad_id: typeVal,
      actividad_manual: null,
      alcance: scope,
      determinante: det || null,
      region: region || null,
      notas: document.querySelector('#activityNote')?.value.trim() || null,
      estatus: 'EN_CURSO',
      inicio: new Date().toISOString(),
      area_id: activeAreaId
    };

    const { data, error } = await sb.from('actividades').insert(payload).select().single();
    if (error) {
      setBusy(btn, false);
      return toast('No pude iniciar actividad de coordinación: ' + error.message);
    }

    if (selectedAssistants?.length) {
      const r = await sb.from('actividad_asistentes').insert(
        selectedAssistants.map(p => ({ actividad_id: data.id, persona_id: p.id }))
      );
      if (r.error) toast('Actividad creada, pero faltaron asistentes: ' + r.error.message);
    }

    selectedAssistants = [];
    if (typeof renderAssistantChips === 'function') renderAssistantChips();
    const note = document.querySelector('#activityNote');
    if (note) note.value = '';
    setBusy(btn, false);
    toast('🌐 Actividad de coordinación iniciada ♡');
    if (typeof renderAll === 'function') await renderAll();
    if (typeof renderDailyKpis === 'function') await renderDailyKpis();
  }

  function bindLissetCatalogControls() {
    const quickWrap = document.querySelector('#quickActivityCreateWrap');
    quickWrap?.classList.remove('hidden');

    const quickBtn = document.querySelector('#quickAddActivityCatalog');
    if (quickBtn) quickBtn.onclick = addQuickLissetActivity;

    const quickInput = document.querySelector('#quickNewActivityCatalog');
    if (quickInput) quickInput.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addQuickLissetActivity(); }
    };

    const catalogBtn = document.querySelector('#addActivityCatalog');
    if (catalogBtn) catalogBtn.onclick = addLissetCatalogActivity;
  }

  function applyLissetPatch() {
    if (!isLisset()) return;
    const userKey = currentAnalyst?.id || currentAnalyst?.email;

    document.querySelector('.tab[data-view="actividad"]')?.classList.remove('admin-hidden');
    document.querySelector('#finishMine')?.classList.remove('hidden');
    document.querySelector('#quickActivityCreateWrap')?.classList.remove('hidden');

    const owner = document.querySelector('#activityOwner');
    if (owner) owner.value = 'LISSET · COORDINACIÓN';

    const startBtn = document.querySelector('#startActivity');
    if (startBtn) startBtn.onclick = startLissetCoordinationActivity;

    bindLissetCatalogControls();
    ensureCoordinationBanner();
    patchedForUser = userKey;
  }

  setInterval(() => {
    try { applyLissetPatch(); }
    catch (e) { console.warn('Lisset coordinación V2:', e); }
  }, 500);
})();
