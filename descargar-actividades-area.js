/* ============================================================
   BETTER CONTROL · EXPORTAR ACTIVIDADES POR ÁREA
   Supervisoras: únicamente su área.
   Coordinación GLOBAL: área seleccionada.
   Usa la fecha y área del módulo Metas y cumplimiento.
   ============================================================ */
(() => {
  const $d = (s) => document.querySelector(s);

  function allowed() {
    try { return typeof isSupervisor === 'function' && isSupervisor(); }
    catch { return false; }
  }

  function areaSelected() {
    const sel = $d('#metasArea');
    if (sel?.value) {
      return {
        id: sel.value,
        name: sel.selectedOptions?.[0]?.textContent?.trim() || 'AREA'
      };
    }
    try {
      return {
        id: currentAnalyst?.area_id || activeAreaId || '',
        name: currentAnalyst?.area_nombre || activeAreaName || 'AREA'
      };
    } catch {
      return { id:'', name:'AREA' };
    }
  }

  function dateSelected() {
    const input = $d('#metasFecha');
    if (input?.value) return input.value;
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone:'America/Mexico_City',
        year:'numeric', month:'2-digit', day:'2-digit'
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0,10);
    }
  }

  function rangeMX(dateStr) {
    const start = new Date(`${dateStr}T00:00:00-06:00`);
    const end = new Date(start.getTime() + 86400000);
    return { start:start.toISOString(), end:end.toISOString() };
  }

  function formatDateTime(v) {
    if (!v) return '';
    try {
      return new Intl.DateTimeFormat('es-MX', {
        timeZone:'America/Mexico_City',
        day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit', hour12:false
      }).format(new Date(v));
    } catch { return v; }
  }

  function formatDate(v) {
    if (!v) return '';
    try {
      return new Intl.DateTimeFormat('es-MX', {
        timeZone:'America/Mexico_City',
        day:'2-digit', month:'2-digit', year:'numeric'
      }).format(new Date(v));
    } catch { return v; }
  }

  function formatTime(v) {
    if (!v) return '';
    try {
      return new Intl.DateTimeFormat('es-MX', {
        timeZone:'America/Mexico_City',
        hour:'2-digit', minute:'2-digit', hour12:false
      }).format(new Date(v));
    } catch { return v; }
  }

  function durationMinutes(start, end) {
    if (!start || !end) return '';
    const ms = new Date(end) - new Date(start);
    return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60000)) : '';
  }

  function roleLabel(role) {
    const r = String(role || '').toUpperCase();
    if (r === 'GLOBAL') return 'COORDINADORA';
    if (r === 'SUPERVISOR' || r === 'ADMIN_AREA') return 'SUPERVISORA';
    return 'USUARIO';
  }

  function safeSheetName(name) {
    return String(name || 'AREA').replace(/[\\/\?\*\[\]\:]/g,' ').trim().slice(0,31) || 'AREA';
  }

  function fileSafe(name) {
    return String(name || 'AREA')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^A-Za-z0-9_-]+/g,'_')
      .replace(/^_+|_+$/g,'');
  }

  function setStatus(msg, type='') {
    const el = $d('#metasStatus');
    if (!el) return;
    el.className = 'metas-status' + (type ? ` ${type}` : '');
    el.textContent = msg;
  }

  function styleHeader(ws, row, cols) {
    for (let c=0; c<cols; c++) {
      const a = XLSX.utils.encode_cell({r:row,c});
      if (!ws[a]) continue;
      ws[a].s = {
        fill:{fgColor:{rgb:'F2EEE4'}},
        font:{bold:true,color:{rgb:'064C45'},sz:11},
        alignment:{horizontal:'center',vertical:'center',wrapText:true},
        border:{bottom:{style:'medium',color:{rgb:'064C45'}}}
      };
    }
  }

  async function fetchRows(areaId, dateStr) {
    const {start,end} = rangeMX(dateStr);
    const {data,error} = await sb
      .from('actividades')
      .select(`
        id,inicio,fin,estatus,alcance,determinante,region,
        actividad_manual,notas,cierre,finalizada_por_supervisor,
        analistas!actividades_analista_id_fkey(nombre,rol),
        tipos_actividad(nombre),
        tiendas(nombre_tienda)
      `)
      .eq('area_id', areaId)
      .gte('inicio', start)
      .lt('inicio', end)
      .order('inicio',{ascending:true})
      .range(0,9999);

    if (error) throw error;
    return data || [];
  }

  function buildWorkbook(rows, areaName, dateStr) {
    const detailHeader = [
      'AREA','COLABORADOR','PUESTO','ACTIVIDAD','ESTATUS','FECHA',
      'HORA INICIO','HORA FIN','DURACION (MIN)','ALCANCE','DETERMINANTE',
      'TIENDA','REGION','NOTA INICIAL','CIERRE / RESULTADO',
      'FINALIZADA POR SUPERVISORA'
    ];

    const detailRows = rows.map(x => [
      areaName,
      x.analistas?.nombre || 'SIN COLABORADOR',
      roleLabel(x.analistas?.rol),
      x.tipos_actividad?.nombre || x.actividad_manual || 'ACTIVIDAD',
      x.estatus || '',
      formatDate(x.inicio),
      formatTime(x.inicio),
      formatTime(x.fin),
      durationMinutes(x.inicio,x.fin),
      x.alcance || 'GENERAL',
      x.determinante || '',
      x.tiendas?.nombre_tienda || '',
      x.region || '',
      x.notas || '',
      x.cierre || '',
      x.finalizada_por_supervisor ? 'SI' : 'NO'
    ]);

    const byPerson = new Map();
    for (const x of rows) {
      const name = x.analistas?.nombre || 'SIN COLABORADOR';
      if (!byPerson.has(name)) {
        byPerson.set(name, {
          name,
          role:roleLabel(x.analistas?.rol),
          total:0, done:0, live:0, minutes:0
        });
      }
      const p = byPerson.get(name);
      p.total++;
      if (x.estatus === 'FINALIZADA') {
        p.done++;
        p.minutes += Number(durationMinutes(x.inicio,x.fin)) || 0;
      } else if (x.estatus === 'EN_CURSO') {
        p.live++;
      }
    }

    const summaryHeader = [
      'AREA','COLABORADOR','PUESTO','ACTIVIDADES REALIZADAS',
      'FINALIZADAS','EN CURSO','TIEMPO TOTAL FINALIZADAS (MIN)',
      'PROMEDIO POR ACTIVIDAD FINALIZADA (MIN)'
    ];

    const summaryRows = [...byPerson.values()]
      .sort((a,b)=>b.total-a.total || a.name.localeCompare(b.name))
      .map(p => [
        areaName,p.name,p.role,p.total,p.done,p.live,p.minutes,
        p.done ? Math.round(p.minutes/p.done) : 0
      ]);

    const wb = XLSX.utils.book_new();

    // Sheet 1: Activities
    const title = [
      [`ACTIVIDADES DEL AREA · ${areaName}`],
      [`Fecha: ${dateStr} · Exportado: ${formatDateTime(new Date().toISOString())}`],
      [],
      detailHeader,
      ...detailRows
    ];
    const ws = XLSX.utils.aoa_to_sheet(title);
    ws['!merges'] = [
      {s:{r:0,c:0},e:{r:0,c:15}},
      {s:{r:1,c:0},e:{r:1,c:15}}
    ];
    ws['!cols'] = [
      {wch:20},{wch:24},{wch:15},{wch:38},{wch:14},{wch:13},
      {wch:12},{wch:12},{wch:16},{wch:16},{wch:15},{wch:28},
      {wch:18},{wch:45},{wch:48},{wch:22}
    ];
    if (ws['A1']) ws['A1'].s = {
      fill:{fgColor:{rgb:'F2EEE4'}},
      font:{bold:true,color:{rgb:'064C45'},sz:18},
      alignment:{horizontal:'left',vertical:'center'}
    };
    if (ws['A2']) ws['A2'].s = {
      fill:{fgColor:{rgb:'F2EEE4'}},
      font:{color:{rgb:'68736E'},sz:10},
      alignment:{horizontal:'left',vertical:'center'}
    };
    styleHeader(ws,3,detailHeader.length);
    for (let r=4; r<4+detailRows.length; r++) {
      for (let c=0; c<detailHeader.length; c++) {
        const a=XLSX.utils.encode_cell({r,c});
        if(!ws[a]) ws[a]={t:'s',v:''};
        ws[a].s={
          alignment:{vertical:'top',horizontal:c>=4&&c<=12?'center':'left',wrapText:true},
          border:{bottom:{style:'thin',color:{rgb:'D7D3C8'}}}
        };
      }
    }
    ws['!autofilter'] = {ref:`A4:P${Math.max(4,4+detailRows.length)}`};
    XLSX.utils.book_append_sheet(wb,ws,'ACTIVIDADES');

    // Sheet 2: Summary
    const sdata = [
      [`RESUMEN DEL AREA · ${areaName}`],
      [`Fecha: ${dateStr}`],
      [],
      summaryHeader,
      ...summaryRows
    ];
    const sws = XLSX.utils.aoa_to_sheet(sdata);
    sws['!merges'] = [
      {s:{r:0,c:0},e:{r:0,c:7}},
      {s:{r:1,c:0},e:{r:1,c:7}}
    ];
    sws['!cols'] = [
      {wch:20},{wch:25},{wch:16},{wch:23},{wch:15},{wch:15},{wch:27},{wch:31}
    ];
    if (sws['A1']) sws['A1'].s = {
      fill:{fgColor:{rgb:'F2EEE4'}},
      font:{bold:true,color:{rgb:'064C45'},sz:18},
      alignment:{horizontal:'left'}
    };
    if (sws['A2']) sws['A2'].s = {
      fill:{fgColor:{rgb:'F2EEE4'}},
      font:{color:{rgb:'68736E'},sz:10}
    };
    styleHeader(sws,3,summaryHeader.length);
    for (let r=4;r<4+summaryRows.length;r++) {
      for(let c=0;c<summaryHeader.length;c++) {
        const a=XLSX.utils.encode_cell({r,c});
        if(!sws[a]) sws[a]={t:'s',v:''};
        sws[a].s={
          alignment:{vertical:'center',horizontal:c>=3?'center':'left',wrapText:true},
          border:{bottom:{style:'thin',color:{rgb:'D7D3C8'}}}
        };
      }
    }
    XLSX.utils.book_append_sheet(wb,sws,safeSheetName('RESUMEN'));

    return wb;
  }

  async function downloadAreaActivities() {
    if (!allowed()) return;
    const area = areaSelected();
    const dateStr = dateSelected();
    if (!area.id) return setStatus('No pude identificar el área para la descarga.','error');

    const btn = $d('#downloadAreaActivitiesBtn');
    const old = btn?.textContent;
    if (btn) { btn.disabled=true; btn.textContent='Preparando Excel...'; }
    setStatus(`Consultando actividades de ${area.name}...`);

    try {
      const rows = await fetchRows(area.id,dateStr);
      if (!rows.length) {
        setStatus(`No hay actividades registradas en ${area.name} para ${dateStr}.`,'error');
        return;
      }
      const wb = buildWorkbook(rows,area.name,dateStr);
      const filename = `ACTIVIDADES_${fileSafe(area.name)}_${dateStr}.xlsx`;
      XLSX.writeFile(wb,filename);
      setStatus(`Excel descargado · ${rows.length} actividades de ${area.name}.`,'ok');
    } catch (e) {
      console.error('Exportar actividades del área:',e);
      setStatus('No pude generar el Excel: '+(e?.message || e),'error');
    } finally {
      if (btn) { btn.disabled=false; btn.textContent=old || '📥 Actividades del área'; }
    }
  }

  function injectButton() {
    if (!allowed()) return;
    const actions = $d('#view-metas .metas-toolbar-actions');
    if (!actions || $d('#downloadAreaActivitiesBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'downloadAreaActivitiesBtn';
    btn.type = 'button';
    btn.textContent = '📥 Actividades del área';
    btn.title = 'Descargar todas las actividades registradas del área en la fecha seleccionada';
    btn.addEventListener('click',downloadAreaActivities);
    actions.appendChild(btn);
  }

  function boot() {
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      try {
        if (typeof currentAnalyst !== 'undefined' && currentAnalyst) {
          injectButton();
          if ($d('#downloadAreaActivitiesBtn')) clearInterval(timer);
        }
      } catch(e) {}
      if (tries>80) clearInterval(timer);
    },400);

    document.addEventListener('click',(e)=>{
      if (e.target?.id === 'metasTab') setTimeout(injectButton,100);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
