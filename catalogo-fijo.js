/* BETTER CONTROL · CATÁLOGO FIJO POR ÁREA */
(() => {
  const fixedAreas = new Set(['MESA_CONTROL','RH','CPRO','IKEA']);

  function areaIsFixed(){
    try { return fixedAreas.has(String(activeAreaKey || currentAnalyst?.area_clave || '').toUpperCase()); }
    catch { return false; }
  }

  function lockCatalogUI(){
    if (!areaIsFixed()) return;

    ['#quickActivityCreateWrap','#newActivityCatalog','#addActivityCatalog','#quickNewActivityCatalog','#quickAddActivityCatalog']
      .forEach(sel => {
        const el = document.querySelector(sel);
        if (el) {
          el.style.display = 'none';
          if ('disabled' in el) el.disabled = true;
        }
      });

    const catalogBody = document.querySelector('#view-catalogos .window-body');
    if (catalogBody && !catalogBody.querySelector('.catalog-fixed-note')) {
      const note = document.createElement('div');
      note.className = 'catalog-fixed-note';
      note.textContent = 'Catálogo fijo por área · solo se pueden usar las actividades autorizadas por Coordinación.';
      catalogBody.prepend(note);
    }

    const activitySelectedLabel = document.querySelector('#activitySelectedLabel');
    if (activitySelectedLabel && !activitySelectedLabel.dataset.fixedCatalog) {
      activitySelectedLabel.dataset.fixedCatalog = '1';
      activitySelectedLabel.textContent = 'Selecciona una actividad autorizada para esta área.';
    }
  }

  const timer = setInterval(() => {
    try { if (typeof currentAnalyst !== 'undefined' && currentAnalyst) lockCatalogUI(); } catch {}
  }, 600);

  document.addEventListener('change', e => {
    if (e.target?.id === 'globalAreaSelect') setTimeout(lockCatalogUI, 350);
  });

  setTimeout(() => clearInterval(timer), 30*60*1000);
})();
