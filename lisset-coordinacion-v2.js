/* ============================================================
   BETTER CONTROL · LISSET COORDINACIÓN V2
   Permite a Lisset, aun con rol GLOBAL, registrar y crear tareas.
   ============================================================ */
(() => {
  const LISSET_EMAIL = 'lisset.co@bettergroup.mx';

  function isLissetCoord() {
    try {
      return String(currentAnalyst?.email || '').toLowerCase() === LISSET_EMAIL;
    } catch {
      return false;
    }
  }

  function showLissetActivityUI() {
    if (!isLissetCoord()) return;

    const activityTab = document.querySelector('.tab[data-view="actividad"]');
    if (activityTab) {
      activityTab.classList.remove('admin-hidden', 'hidden');
      activityTab.style.display = '';
    }

    const finishBtn = document.querySelector('#finishMine');
    if (finishBtn) finishBtn.classList.remove('hidden');

    const quickWrap = document.querySelector('#quickActivityCreateWrap');
    if (quickWrap) quickWrap.classList.remove('hidden');

    const owner = document.querySelector('#activityOwner');
    if (owner) owner.value = 'LISSET · COORDINACIÓN';

    const subtitle = document.querySelector('#welcomeSubtitle');
    if (subtitle && typeof activeAreaName !== 'undefined') {
      subtitle.textContent = `Vista global · revisando ${activeAreaName || 'área'} · puedes registrar actividades`;
    }
  }

  async function createActivityForLisset(rawName) {
    if (!isLissetCoord()) return null;

    const name = normalize(rawName || '');
    if (!name) {
      toast('Escribe el nombre de la actividad');
      return null;
    }

    if (!activeAreaId) {
      toast('No pude identificar el área');
      return null;
    }

    const existing = await sb
      .from('tipos_actividad')
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
      ({ data, error } = await sb
        .from('tipos_actividad')
        .update({ activo: true })
        .eq('id', existing.data.id)
        .select()
        .single());
    } else {
      ({ data, error } = await sb
        .from('tipos_actividad')
        .insert({
          nombre: name,
          activo: true,
          area_id: activeAreaId
        })
        .select()
        .single());
    }

    if (error) {
      toast('No pude crear la actividad: ' + error.message);
      return null;
    }

    await loadCatalogs();

    const created =
      activityTypes.find(x => x.id === data.id) || data;

    selectedActivityType = created;

    if (document.querySelector('#activityType')) {
      document.querySelector('#activityType').value = created.id;
    }

    if (document.querySelector('#activitySearch')) {
      document.querySelector('#activitySearch').value = created.nombre;
    }

    if (document.querySelector('#activitySelectedLabel')) {
      document.querySelector('#activitySelectedLabel').textContent =
        `Seleccionada: ${created.nombre}`;
    }

    toast('Actividad creada para ' + (activeAreaName || 'el área'));
    return created;
  }

  async function startActivityForLisset() {
    if (!isLissetCoord()) return;

    const btn = document.querySelector('#startActivity');
    const typeVal =
      selectedActivityType?.id ||
      document.querySelector('#activityType')?.value;

    if (!typeVal || typeVal === '__manual') {
      return toast('Busca y selecciona una actividad');
    }

    const scope = document.querySelector('#activityScope')?.value || 'GENERAL';
    const det =
      scope === 'TIENDA'
        ? detFromText(document.querySelector('#activityStore')?.value || '')
        : null;

    const region =
      scope === 'REGION'
        ? document.querySelector('#activityRegion')?.value
        : null;

    if (scope === 'TIENDA' && !det) {
      return toast('Selecciona una tienda válida');
    }

    if (scope === 'REGION' && !region) {
      return toast('Selecciona una región');
    }

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

    const { data, error } = await sb
      .from('actividades')
      .insert(payload)
      .select()
      .single();

    if (error) {
      setBusy(btn, false);
      return toast(
        'No pude iniciar actividad de coordinación: ' + error.message
      );
    }

    if (selectedAssistants.length) {
      const r = await sb
        .from('actividad_asistentes')
        .insert(
          selectedAssistants.map(p => ({
            actividad_id: data.id,
            persona_id: p.id
          }))
        );

      if (r.error) {
        toast('Actividad creada, pero faltaron asistentes: ' + r.error.message);
      }
    }

    selectedAssistants = [];
    renderAssistantChips();

    const note = document.querySelector('#activityNote');
    if (note) note.value = '';

    setBusy(btn, false);
    toast('Actividad iniciada por LISSET · COORDINACIÓN ♡');

    await renderAll();
    if (typeof renderDailyKpis === 'function') {
      await renderDailyKpis();
    }
  }

  function bindLissetControls() {
    if (!isLissetCoord()) return;

    showLissetActivityUI();

    const startBtn = document.querySelector('#startActivity');
    if (startBtn) {
      startBtn.onclick = startActivityForLisset;
    }

    const quickBtn = document.querySelector('#quickAddActivityCatalog');
    const quickInput = document.querySelector('#quickNewActivityCatalog');

    if (quickBtn) {
      quickBtn.onclick = async () => {
        const value = quickInput?.value || '';
        const created = await createActivityForLisset(value);
        if (created && quickInput) quickInput.value = '';
      };
    }

    if (quickInput) {
      quickInput.onkeydown = async (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();

        const created = await createActivityForLisset(quickInput.value);
        if (created) quickInput.value = '';
      };
    }
  }

  const watcher = setInterval(() => {
    try {
      if (
        typeof currentAnalyst !== 'undefined' &&
        currentAnalyst
      ) {
        if (isLissetCoord()) {
          bindLissetControls();
        }
      }
    } catch {}

    // Keep checking because app.js can hide the tab again after area changes.
  }, 700);

  // Also re-apply after user switches area.
  document.addEventListener('change', (e) => {
    if (e.target?.id === 'globalAreaSelect') {
      setTimeout(bindLissetControls, 300);
    }
  });

  // Safety stop after 30 minutes; normal page reload reinitializes it.
  setTimeout(() => clearInterval(watcher), 30 * 60 * 1000);
})();
