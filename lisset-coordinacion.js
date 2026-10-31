/* ==========================================================
   BETTER CONTROL · EXCEPCIÓN LISSET COORDINACIÓN
   Cargar DESPUÉS de app.js
   - LISSET conserva rol GLOBAL
   - Puede abrir Nueva actividad
   - Puede registrar y finalizar sus propias actividades
   - Ingrid / Paloma continúan como GLOBAL de consulta
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
    box.innerHTML = '<b>🌐 Modo Coordinación</b><br><span>Esta actividad quedará registrada a nombre de LISSET dentro del área que estés revisando.</span>';
    view.prepend(box);
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

  function applyLissetPatch() {
    if (!isLisset()) return;
    const userKey = currentAnalyst?.id || currentAnalyst?.email;
    if (patchedForUser === userKey) {
      // applyRoleUI puede volver a ocultar la pestaña; la mantenemos visible.
      document.querySelector('.tab[data-view="actividad"]')?.classList.remove('admin-hidden');
      document.querySelector('#finishMine')?.classList.remove('hidden');
      return;
    }
    patchedForUser = userKey;

    const activityTab = document.querySelector('.tab[data-view="actividad"]');
    activityTab?.classList.remove('admin-hidden');
    document.querySelector('#finishMine')?.classList.remove('hidden');

    // No abrimos el catálogo rápido a GLOBAL para evitar modificar catálogos de otras áreas por accidente.
    document.querySelector('#quickActivityCreateWrap')?.classList.add('hidden');

    const owner = document.querySelector('#activityOwner');
    if (owner) owner.value = 'LISSET · COORDINACIÓN';

    const startBtn = document.querySelector('#startActivity');
    if (startBtn) startBtn.onclick = startLissetCoordinationActivity;

    ensureCoordinationBanner();
  }

  // El perfil se carga después del login; revisamos suavemente y aplicamos la excepción.
  setInterval(() => {
    try { applyLissetPatch(); } catch (e) { console.warn('Lisset coordinación:', e); }
  }, 500);
})();
