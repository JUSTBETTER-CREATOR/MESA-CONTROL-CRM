/* ============================================================
   BETTER CONTROL · CUADRO DE ACTIVIDADES · V4
   Un solo Excel con una hoja por cada área.
   Disponible para Coordinación / GLOBAL, incluida LISSET.
   ============================================================ */
(() => {
  const $c = (s) => document.querySelector(s);
  const normalizeC = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  let allAreas = [];

  function isCoordinatorReportUser() {
    try {
      const email = String(currentAnalyst?.email || '').toLowerCase();
      const role = normalizeC(currentAnalyst?.rol);
      return role === 'GLOBAL' || email === 'lisset.co@bettergroup.mx';
    } catch {
      return false;
    }
  }

  function mexicoToday() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone:'America/Mexico_City',
        year:'numeric', month:'2-digit', day:'2-digit'
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0,10);
    }
  }

  function mexicoDateRange(dateStr) {
    const start = new Date(`${dateStr}T00:00:00-06:00`);
    const end = new Date(start.getTime() + 24*60*60*1000);
    return { start:start.toISOString(), end:end.toISOString() };
  }

  function minutesBetween(start, end) {
    if (!start || !end) return 0;
    const value = Math.round((new Date(end) - new Date(start))/60000);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function roleLabel(role) {
    const r = normalizeC(role);
    if (r === 'GLOBAL') return 'COORDINADORA';
    if (r === 'SUPERVISOR' || r === 'ADMIN_AREA') return 'SUPERVISORA';
    return 'USUARIO';
  }

  function activityName(row) {
    return row?.tipos_actividad?.nombre || row?.actividad_manual || 'ACTIVIDAD';
  }

  function buildObservations(rows) {
    if (!rows.length) return 'SIN ACTIVIDADES REGISTRADAS';

    const grouped = new Map();
    const notes = [];

    for (const r of rows) {
      const name = normalizeC(activityName(r)) || 'ACTIVIDAD';
      grouped.set(name, (grouped.get(name) || 0) + 1);

      const cierre = String(r.cierre || '').trim();
      const nota = String(r.notas || '').trim();
      if (cierre) notes.push(cierre);
      else if (nota) notes.push(nota);
    }

    const acts = [...grouped.entries()]
      .map(([name,count]) => count > 1 ? `${name} (${count})` : name)
      .join(', ');

    const uniqueNotes = [...new Set(
      notes.map(x => x.replace(/\s+/g,' ').trim()).filter(Boolean)
    )].slice(0,4);

    return uniqueNotes.length
      ? `${acts}. OBS: ${uniqueNotes.join(' | ')}`
      : acts;
  }

  async function loadAllAreas() {
    try {
      if (Array.isArray(crmAreas) && crmAreas.length) {
        allAreas = crmAreas
          .filter(a => a.activo !== false)
          .map(a => ({
            id:a.id,
            clave:a.clave,
            nombre:a.nombre,
            orden:a.orden ?? 999
          }))
          .sort((a,b) =>
            (a.orden-b.orden) ||
            String(a.nombre).localeCompare(String(b.nombre),'es')
          );
        return allAreas;
      }
    } catch {}

    const {data,error} = await sb.from('areas')
      .select('id,clave,nombre,activo,orden')
      .eq('activo',true)
      .order('orden')
      .range(0,999);

    if (error) throw error;

    allAreas = (data || []).sort((a,b) =>
      ((a.orden ?? 999)-(b.orden ?? 999)) ||
      String(a.nombre).localeCompare(String(b.nombre),'es')
    );

    return allAreas;
  }

  async function fetchAreaData(dateStr, area) {
    const {start,end} = mexicoDateRange(dateStr);

    const [peopleRes, activitiesRes] = await Promise.all([
      sb.from('analistas')
        .select('id,nombre,email,rol,area_id,activo')
        .eq('area_id',area.id)
        .eq('activo',true)
        .order('nombre')
        .range(0,4999),

      sb.from('actividades')
        .select('id,analista_id,area_id,inicio,fin,estatus,actividad_manual,notas,cierre,tipos_actividad(nombre)')
        .eq('area_id',area.id)
        .gte('inicio',start)
        .lt('inicio',end)
        .order('inicio',{ascending:true})
        .range(0,4999)
    ]);

    if (peopleRes.error) throw peopleRes.error;
    if (activitiesRes.error) throw activitiesRes.error;

    return {
      area,
      people: peopleRes.data || [],
      activities: activitiesRes.data || []
    };
  }

  function summarizeRows(area, people, activities) {
    const byPerson = new Map();

    for (const a of activities) {
      if (!byPerson.has(a.analista_id)) byPerson.set(a.analista_id, []);
      byPerson.get(a.analista_id).push(a);
    }

    return people.map(person => {
      const rows = byPerson.get(person.id) || [];
      const done = rows.filter(x => normalizeC(x.estatus) === 'FINALIZADA');
      const live = rows.filter(x => normalizeC(x.estatus) === 'EN_CURSO');
      const totalMinutes = done.reduce(
        (sum,x) => sum + minutesBetween(x.inicio,x.fin), 0
      );
      const averageMinutes = done.length
        ? Math.round(totalMinutes / done.length)
        : 0;

      return {
        AREA: area?.nombre || 'SIN ÁREA',
        'NOMBRE DEL COLABORADOR': person.nombre || '',
        PUESTO: roleLabel(person.rol),
        'ACTIVIDADES REALIZADAS': rows.length,
        'ACTIVIDADES FINALIZADAS': done.length,
        'ACTIVIDADES EN CURSO': live.length,
        'TIEMPO (MIN)': averageMinutes,
        OBSERVACIONES: buildObservations(rows)
      };
    });
  }

  const HEADERS = [
    'AREA',
    'NOMBRE DEL COLABORADOR',
    'PUESTO',
    'ACTIVIDADES REALIZADAS',
    'ACTIVIDADES FINALIZADAS',
    'ACTIVIDADES EN CURSO',
    'TIEMPO (MIN)',
    'OBSERVACIONES'
  ];

  function styleSheet(ws, rowCount) {
    // Yellow header like user's CUADRO DE ACTIVIDADES.
    for (let c=0; c<HEADERS.length; c++) {
      const addr = XLSX.utils.encode_cell({r:0,c});
      if (!ws[addr]) continue;

      ws[addr].s = {
        fill:{fgColor:{rgb:'FFF200'}},
        font:{bold:true,color:{rgb:'000000'},sz:11},
        alignment:{horizontal:'center',vertical:'center',wrapText:true},
        border:{
          top:{style:'thin',color:{rgb:'000000'}},
          bottom:{style:'thin',color:{rgb:'000000'}},
          left:{style:'thin',color:{rgb:'000000'}},
          right:{style:'thin',color:{rgb:'000000'}}
        }
      };
    }

    for (let r=1; r<=rowCount; r++) {
      for (let c=0; c<HEADERS.length; c++) {
        const addr = XLSX.utils.encode_cell({r,c});
        if (!ws[addr]) ws[addr] = {t:'s',v:''};

        ws[addr].s = {
          alignment:{
            vertical:'top',
            horizontal: c >= 3 && c <= 6 ? 'center' : 'left',
            wrapText:true
          },
          border:{
            top:{style:'thin',color:{rgb:'000000'}},
            bottom:{style:'thin',color:{rgb:'000000'}},
            left:{style:'thin',color:{rgb:'000000'}},
            right:{style:'thin',color:{rgb:'000000'}}
          }
        };
      }
    }

    ws['!cols'] = [
      {wch:20},
      {wch:34},
      {wch:18},
      {wch:24},
      {wch:25},
      {wch:22},
      {wch:16},
      {wch:65}
    ];

    ws['!rows'] = [{hpt:28}];
    for (let i=1; i<=rowCount; i++) ws['!rows'][i] = {hpt:34};

    ws['!autofilter'] = {
      ref:`A1:H${Math.max(2,rowCount+1)}`
    };
  }

  function makeSheet(rows) {
    const data = [
      HEADERS,
      ...rows.map(r => HEADERS.map(h => r[h]))
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    styleSheet(ws,rows.length);
    return ws;
  }

  function safeSheetName(text, usedNames) {
    let base = String(text || 'AREA')
      .replace(/[\\\/\?\*\[\]\:]/g,' ')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,31) || 'AREA';

    let name = base;
    let n = 2;

    while (usedNames.has(name.toUpperCase())) {
      const suffix = ` ${n++}`;
      name = (base.slice(0,31-suffix.length) + suffix).trim();
    }

    usedNames.add(name.toUpperCase());
    return name;
  }

  async function downloadAllAreasWorkbook() {
    if (!isCoordinatorReportUser()) {
      alert('Este cuadro está disponible para Coordinación.');
      return;
    }

    const date = $c('#reportDate')?.value || mexicoToday();
    const btn = $c('#downloadAllActivityTablesBtn');
    const original = btn?.textContent || '';

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generando todas las áreas...';
    }

    try {
      const areas = await loadAllAreas();

      if (!areas.length) {
        throw new Error('No encontré áreas activas en el CRM.');
      }

      const wb = XLSX.utils.book_new();
      const usedNames = new Set();

      let totalPeople = 0;
      let totalActivities = 0;

      for (const area of areas) {
        const {people,activities} = await fetchAreaData(date,area);
        const rows = summarizeRows(area,people,activities);

        totalPeople += people.length;
        totalActivities += activities.length;

        const ws = makeSheet(rows);
        const sheetName = safeSheetName(area.nombre,usedNames);

        XLSX.utils.book_append_sheet(wb,ws,sheetName);
      }

      XLSX.writeFile(
        wb,
        `CUADRO_DE_ACTIVIDADES_TODAS_LAS_AREAS_${date}.xlsx`
      );

      const status = $c('#reportStatus');
      if (status) {
        status.className = 'report-status ok';
        status.textContent =
          `Excel listo: ${areas.length} hojas · ${totalPeople} colaboradores · ${totalActivities} actividades.`;
      }
    } catch (e) {
      console.error(e);

      const msg = 'No pude generar el Excel: ' + (e?.message || e);
      const status = $c('#reportStatus');

      if (status) {
        status.className = 'report-status error';
        status.textContent = msg;
      } else {
        alert(msg);
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = original || '🟨 Descargar todas las áreas en un Excel';
      }
    }
  }

  function injectButton() {
    if (!isCoordinatorReportUser()) return false;

    const actions = $c('.report-actions');
    if (!actions) return false;

    // Remove old V1/V2 controls if present.
    $c('#activityTableAreaWrap')?.remove();
    $c('#downloadActivityTableBtn')?.remove();

    if (!$c('#downloadAllActivityTablesBtn')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'downloadAllActivityTablesBtn';
      btn.textContent = '🟨 Descargar todas las áreas en un Excel';
      btn.title = 'Genera un solo Excel con una hoja por cada área';
      btn.addEventListener('click',downloadAllAreasWorkbook);
      actions.appendChild(btn);
    }

    return true;
  }

  function boot() {
    let tries = 0;

    const timer = setInterval(() => {
      tries++;

      try {
        if (
          typeof currentAnalyst !== 'undefined' &&
          currentAnalyst &&
          injectButton()
        ) {
          clearInterval(timer);
        }
      } catch (e) {
        console.warn('Cuadro actividades V3:',e);
      }

      if (tries > 60) clearInterval(timer);
    },500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded',boot);
  } else {
    boot();
  }
})();
