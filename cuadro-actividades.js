/* ============================================================
   BETTER CONTROL · CUADRO DE ACTIVIDADES POR ÁREA
   Disponible para perfiles GLOBAL / COORDINACIÓN, incluida LISSET.
   ============================================================ */
(() => {
  const $c = (s) => document.querySelector(s);
  const normalizeC = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

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
    // Mexico City is UTC-06 in October 2026.
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

    const byName = new Map();
    const notes = [];

    for (const r of rows) {
      const name = normalizeC(activityName(r)) || 'ACTIVIDAD';
      byName.set(name, (byName.get(name) || 0) + 1);

      const cierre = String(r.cierre || '').trim();
      const nota = String(r.notas || '').trim();
      if (cierre) notes.push(cierre);
      else if (nota) notes.push(nota);
    }

    const acts = [...byName.entries()]
      .map(([name,count]) => count > 1 ? `${name} (${count})` : name)
      .join(', ');

    const uniqueNotes = [...new Set(notes.map(x => x.replace(/\s+/g,' ').trim()))]
      .filter(Boolean)
      .slice(0,4);

    return uniqueNotes.length
      ? `${acts}. OBS: ${uniqueNotes.join(' | ')}`
      : acts;
  }

  async function fetchAreaData(dateStr, areaId) {
    const {start,end} = mexicoDateRange(dateStr);

    const [areaRes, peopleRes, activitiesRes] = await Promise.all([
      sb.from('areas')
        .select('id,clave,nombre')
        .eq('id',areaId)
        .maybeSingle(),

      sb.from('analistas')
        .select('id,nombre,email,rol,area_id,activo')
        .eq('area_id',areaId)
        .eq('activo',true)
        .order('nombre')
        .range(0,4999),

      sb.from('actividades')
        .select('id,analista_id,area_id,inicio,fin,estatus,actividad_manual,notas,cierre,tipos_actividad(nombre)')
        .eq('area_id',areaId)
        .gte('inicio',start)
        .lt('inicio',end)
        .order('inicio',{ascending:true})
        .range(0,4999)
    ]);

    if (areaRes.error) throw areaRes.error;
    if (peopleRes.error) throw peopleRes.error;
    if (activitiesRes.error) throw activitiesRes.error;

    return {
      area: areaRes.data,
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
      const minutes = done.reduce((sum,x) => sum + minutesBetween(x.inicio,x.fin), 0);

      return {
        AREA: area?.nombre || 'SIN ÁREA',
        'NOMBRE DEL COLABORADOR': person.nombre || '',
        PUESTO: roleLabel(person.rol),
        'ACTIVIDADES REALIZADAS': rows.length,
        'ACTIVIDADES FINALIZADAS': done.length,
        'ACTIVIDADES EN CURSO': live.length,
        'TIEMPO (MIN)': minutes,
        OBSERVACIONES: buildObservations(rows)
      };
    });
  }

  function styleWorkbook(ws, rowCount) {
    const headers = [
      'AREA',
      'NOMBRE DEL COLABORADOR',
      'PUESTO',
      'ACTIVIDADES REALIZADAS',
      'ACTIVIDADES FINALIZADAS',
      'ACTIVIDADES EN CURSO',
      'TIEMPO (MIN)',
      'OBSERVACIONES'
    ];

    headers.forEach((_,i) => {
      const addr = XLSX.utils.encode_cell({r:0,c:i});
      if (!ws[addr]) return;
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
    });

    for (let r=1; r<=rowCount; r++) {
      for (let c=0; c<8; c++) {
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
      {wch:18},
      {wch:34},
      {wch:18},
      {wch:24},
      {wch:25},
      {wch:22},
      {wch:16},
      {wch:60}
    ];

    ws['!rows'] = [{hpt:28}];
    for (let i=1; i<=rowCount; i++) ws['!rows'][i] = {hpt:34};
    ws['!autofilter'] = {ref:`A1:H${Math.max(2,rowCount+1)}`};
    ws['!freeze'] = {xSplit:0,ySplit:1};
  }

  function safeFilePart(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9_-]+/g,'_')
      .replace(/^_+|_+$/g,'')
      .slice(0,60);
  }

  async function downloadActivityTable() {
    if (!isCoordinatorReportUser()) {
      alert('Este cuadro está disponible para Coordinación.');
      return;
    }

    const date = $c('#reportDate')?.value || mexicoToday();
    const areaSelect = $c('#reportArea');
    const areaId = areaSelect?.value;

    if (!areaId) {
      alert('Selecciona un área.');
      return;
    }

    const btn = $c('#downloadActivityTableBtn');
    const original = btn?.textContent || '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generando cuadro...';
    }

    try {
      const {area,people,activities} = await fetchAreaData(date,areaId);
      const rows = summarizeRows(area,people,activities);

      const headers = [
        'AREA',
        'NOMBRE DEL COLABORADOR',
        'PUESTO',
        'ACTIVIDADES REALIZADAS',
        'ACTIVIDADES FINALIZADAS',
        'ACTIVIDADES EN CURSO',
        'TIEMPO (MIN)',
        'OBSERVACIONES'
      ];

      const data = [
        headers,
        ...rows.map(r => headers.map(h => r[h]))
      ];

      const ws = XLSX.utils.aoa_to_sheet(data);
      styleWorkbook(ws, rows.length);

      const wb = XLSX.utils.book_new();
      const sheetName = safeFilePart(area?.nombre || 'AREA').slice(0,31) || 'CUADRO';
      XLSX.utils.book_append_sheet(wb,ws,sheetName);

      // Metadata sheet kept hidden-like by naming convention; no personal secrets.
      const meta = XLSX.utils.aoa_to_sheet([
        ['CUADRO DE ACTIVIDADES'],
        ['FECHA',date],
        ['AREA',area?.nombre || ''],
        ['COLABORADORES',rows.length],
        ['REGISTROS DE ACTIVIDAD',activities.length],
        ['GENERADO POR',currentAnalyst?.nombre || 'COORDINACION']
      ]);
      XLSX.utils.book_append_sheet(wb,meta,'Resumen');

      const filename = `CUADRO_DE_ACTIVIDADES_${safeFilePart(area?.nombre)}_${date}.xlsx`;
      XLSX.writeFile(wb,filename);

      const status = $c('#reportStatus');
      if (status) {
        status.className = 'report-status ok';
        status.textContent = `Cuadro descargado: ${area?.nombre || 'Área'} · ${rows.length} colaboradores · ${activities.length} actividades.`;
      }
    } catch (e) {
      console.error(e);
      const msg = 'No pude generar el cuadro: ' + (e?.message || e);
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
        btn.textContent = original || '🟨 Descargar cuadro por área';
      }
    }
  }

  function injectButton() {
    if (!isCoordinatorReportUser()) return false;

    const actions = $c('.report-actions');
    if (!actions) return false;

    if (!$c('#downloadActivityTableBtn')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'downloadActivityTableBtn';
      btn.textContent = '🟨 Descargar cuadro por área';
      btn.title = 'Descarga el CUADRO DE ACTIVIDADES para el área seleccionada';
      btn.addEventListener('click',downloadActivityTable);
      actions.appendChild(btn);
    }

    // Make Area selector available even if the user is currently in ALL/PERSON mode.
    const areaWrap = $c('#reportAreaWrap');
    if (areaWrap) {
      areaWrap.classList.remove('hidden');
      const lbl = areaWrap.querySelector('select');
      if (lbl) lbl.title = 'Área utilizada para el Cuadro de Actividades';
    }

    return true;
  }

  function boot() {
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      try {
        if (typeof currentAnalyst !== 'undefined' && currentAnalyst && injectButton()) {
          clearInterval(timer);
        }
      } catch {}
      if (tries > 60) clearInterval(timer);
    },500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded',boot);
  } else {
    boot();
  }
})();
