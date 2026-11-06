/* BETTER CONTROL · METAS Y CUMPLIMIENTO */
(() => {
  const $m = (s) => document.querySelector(s);
  let metaAreas = [];
  let currentMetaRows = [];

  function isAllowed() {
    try { return typeof isSupervisor === 'function' && isSupervisor(); }
    catch { return false; }
  }

  function isCoord() {
    try { return typeof isGlobal === 'function' && isGlobal(); }
    catch { return false; }
  }

  function todayMX() {
    try {
      return new Intl.DateTimeFormat('en-CA',{
        timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'
      }).format(new Date());
    } catch { return new Date().toISOString().slice(0,10); }
  }

  function rangeMX(dateStr) {
    const start = new Date(`${dateStr}T00:00:00-06:00`);
    const end = new Date(start.getTime()+86400000);
    return {start:start.toISOString(),end:end.toISOString()};
  }

  function escM(v) {
    return String(v ?? '').replace(/[&<>"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[c]));
  }

  function setStatus(msg,type='') {
    const el=$m('#metasStatus'); if(!el)return;
    el.className='metas-status'+(type?' '+type:'');
    el.textContent=msg;
  }

  function setTabVisibility() {
    const tab=$m('#metasTab');
    if(!tab)return;
    tab.classList.toggle('hidden',!isAllowed());
  }

  async function loadAreas() {
    if(!isAllowed()) return;
    const sel=$m('#metasArea'); if(!sel)return;

    if(isCoord()) {
      let areas=[];
      try { if(Array.isArray(crmAreas)&&crmAreas.length) areas=crmAreas.filter(a=>a.activo!==false); } catch {}
      if(!areas.length){
        const {data,error}=await sb.from('areas').select('id,clave,nombre,orden,activo').eq('activo',true).order('orden');
        if(error) throw error;
        areas=data||[];
      }
      metaAreas=areas;
      sel.innerHTML=areas.map(a=>`<option value="${a.id}">${escM(a.nombre)}</option>`).join('');
      const preferred = (typeof activeAreaId!=='undefined' && activeAreaId) ? activeAreaId : areas[0]?.id;
      if(preferred && [...sel.options].some(o=>o.value===preferred)) sel.value=preferred;
      sel.disabled=false;
      $m('#metasPermissionBadge').textContent='COORDINACIÓN · TODAS LAS ÁREAS';
    } else {
      const id=currentAnalyst?.area_id;
      const name=currentAnalyst?.area_nombre || (typeof activeAreaName!=='undefined'?activeAreaName:'MI ÁREA');
      metaAreas=[{id,nombre:name}];
      sel.innerHTML=`<option value="${id||''}">${escM(name)}</option>`;
      sel.disabled=true;
      $m('#metasPermissionBadge').textContent='SUPERVISIÓN · '+String(name||'').toUpperCase();
    }
  }

  async function loadTable() {
    if(!isAllowed()) return;
    const date=$m('#metasFecha')?.value;
    const areaId=$m('#metasArea')?.value;
    if(!date||!areaId) return;

    setStatus('Calculando resultados...');

    const {start,end}=rangeMX(date);
    const [typesRes, metasRes, actsRes]=await Promise.all([
      sb.from('tipos_actividad')
        .select('id,nombre,area_id,activo')
        .eq('area_id',areaId)
        .eq('activo',true)
        .order('nombre')
        .range(0,999),
      sb.from('metas_actividad')
        .select('id,tipo_actividad_id,meta')
        .eq('area_id',areaId)
        .eq('fecha',date)
        .range(0,999),
      sb.from('actividades')
        .select('id,tipo_actividad_id,actividad_manual,inicio')
        .eq('area_id',areaId)
        .gte('inicio',start)
        .lt('inicio',end)
        .range(0,9999)
    ]);

    if(typesRes.error) return setStatus('Actividades: '+typesRes.error.message,'error');
    if(metasRes.error) return setStatus('Metas: '+metasRes.error.message,'error');
    if(actsRes.error) return setStatus('Resultados: '+actsRes.error.message,'error');

    const metas=new Map((metasRes.data||[]).map(x=>[x.tipo_actividad_id,Number(x.meta)||0]));
    const counts=new Map();
    for(const a of (actsRes.data||[])){
      if(!a.tipo_actividad_id) continue;
      counts.set(a.tipo_actividad_id,(counts.get(a.tipo_actividad_id)||0)+1);
    }

    currentMetaRows=(typesRes.data||[]).map(t=>{
      const meta=metas.get(t.id)||0;
      const result=counts.get(t.id)||0;
      const pct=meta>0 ? Math.round((result/meta)*1000)/10 : null;
      return {id:t.id,nombre:t.nombre,meta,result,pct};
    });

    renderTable();
    setStatus(`Actualizado · ${currentMetaRows.length} actividades autorizadas.`,'ok');
  }

  function renderTable() {
    const body=$m('#metasBody'); if(!body)return;
    body.innerHTML=currentMetaRows.map(r=>{
      const pctText=r.pct===null?'—':`${r.pct}%`;
      const width=r.pct===null?0:Math.min(100,Math.max(0,r.pct));
      return `<tr data-meta-row="${r.id}">
        <td>${escM(r.nombre)}</td>
        <td><input class="metas-meta-input" type="number" min="0" step="1" value="${r.meta||''}" data-meta-input="${r.id}" placeholder="0"></td>
        <td><span class="metas-result">${r.result}</span></td>
        <td>
          <div class="metas-compliance">
            <div class="metas-compliance-top"><strong>${pctText}</strong><span class="metas-zero">${r.meta?`${r.result} / ${r.meta}`:'Sin meta'}</span></div>
            <div class="metas-progress ${r.pct>100?'over':''}"><span style="width:${width}%"></span></div>
          </div>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="4">No hay actividades activas para esta área.</td></tr>';

    body.querySelectorAll('[data-meta-input]').forEach(inp=>{
      inp.addEventListener('input',()=>{
        const row=currentMetaRows.find(x=>x.id===inp.dataset.metaInput);
        if(!row)return;
        row.meta=Math.max(0,Number(inp.value)||0);
        row.pct=row.meta>0?Math.round((row.result/row.meta)*1000)/10:null;
        renderTable();
      });
    });
    updateSummary();
  }

  function updateSummary() {
    const metaTotal=currentMetaRows.reduce((s,x)=>s+(Number(x.meta)||0),0);
    const resultTotal=currentMetaRows.reduce((s,x)=>s+(Number(x.result)||0),0);
    const pct=metaTotal>0?Math.round((resultTotal/metaTotal)*1000)/10:null;
    if($m('#metasTotalActs')) $m('#metasTotalActs').textContent=currentMetaRows.length;
    if($m('#metasTotalMeta')) $m('#metasTotalMeta').textContent=metaTotal;
    if($m('#metasTotalResult')) $m('#metasTotalResult').textContent=resultTotal;
    if($m('#metasOverallPct')) $m('#metasOverallPct').textContent=pct===null?'—':pct+'%';
  }

  async function saveMetas() {
    if(!isAllowed()) return;
    const date=$m('#metasFecha')?.value;
    const areaId=$m('#metasArea')?.value;
    if(!date||!areaId) return;

    const btn=$m('#metasSaveBtn');
    const old=btn?.textContent;
    if(btn){btn.disabled=true;btn.textContent='Guardando...';}

    const payload=currentMetaRows.map(r=>({
      area_id:areaId,
      tipo_actividad_id:r.id,
      fecha:date,
      meta:Math.max(0,Number(r.meta)||0),
      updated_by:currentAnalyst.id,
      updated_at:new Date().toISOString()
    }));

    const {error}=await sb.from('metas_actividad')
      .upsert(payload,{onConflict:'area_id,tipo_actividad_id,fecha'});

    if(btn){btn.disabled=false;btn.textContent=old||'💾 Guardar metas';}
    if(error) return setStatus('No pude guardar metas: '+error.message,'error');
    setStatus('Metas guardadas correctamente.','ok');
    await loadTable();
  }

  function sheetName(name) {
    return String(name||'AREA').replace(/[\\\/\?\*\[\]\:]/g,' ').trim().slice(0,31)||'AREA';
  }

  function exportExcel() {
    if(!isAllowed() || !window.XLSX) return;
    const date=$m('#metasFecha')?.value;
    const areaSel=$m('#metasArea');
    const areaName=areaSel?.selectedOptions?.[0]?.textContent || 'AREA';

    const data=[
      ['Actividad','Meta','Resultado','Cumplimiento'],
      ...currentMetaRows.map(r=>[
        r.nombre,
        Number(r.meta)||0,
        Number(r.result)||0,
        r.meta>0 ? (Number(r.result)||0)/(Number(r.meta)||1) : null
      ])
    ];

    const ws=XLSX.utils.aoa_to_sheet(data);
    ws['!cols']=[{wch:52},{wch:14},{wch:14},{wch:18}];
    ws['!rows']=[{hpt:28}];

    for(let c=0;c<4;c++){
      const addr=XLSX.utils.encode_cell({r:0,c});
      if(ws[addr]) ws[addr].s={
        fill:{fgColor:{rgb:'F2EEE4'}},
        font:{bold:true,color:{rgb:'064C45'},sz:12},
        alignment:{horizontal:'center',vertical:'center'},
        border:{bottom:{style:'medium',color:{rgb:'064C45'}}}
      };
    }

    for(let r=1;r<data.length;r++){
      for(let c=0;c<4;c++){
        const addr=XLSX.utils.encode_cell({r,c});
        if(!ws[addr]) ws[addr]={t:'s',v:''};
        ws[addr].s={
          alignment:{vertical:'center',horizontal:c===0?'left':'center',wrapText:true},
          border:{bottom:{style:'thin',color:{rgb:'D7D3C8'}}}
        };
      }
      const paddr=XLSX.utils.encode_cell({r,c:3});
      if(ws[paddr] && data[r][3]!==null){
        ws[paddr].z='0.0%';
        const pct=data[r][3]*100;
        ws[paddr].s={
          ...ws[paddr].s,
          font:{bold:true,color:{rgb:pct>=100?'064C45':pct>=80?'8C5D1F':'8E2F2F'}},
          fill:{fgColor:{rgb:pct>=100?'E1ECE6':pct>=80?'F2E7D0':'F3DEDA'}}
        };
      }
    }

    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,sheetName(areaName));
    XLSX.writeFile(wb,`METAS_CUMPLIMIENTO_${areaName.replace(/\s+/g,'_')}_${date}.xlsx`);
    setStatus('Excel descargado correctamente.','ok');
  }

  function bind() {
    setTabVisibility();
    if(!isAllowed()) return;

    const date=$m('#metasFecha');
    if(date && !date.value) date.value=todayMX();

    $m('#metasTab')?.addEventListener('click',()=>setTimeout(loadTable,50));
    $m('#metasFecha')?.addEventListener('change',loadTable);
    $m('#metasArea')?.addEventListener('change',loadTable);
    $m('#metasRefreshBtn')?.addEventListener('click',loadTable);
    $m('#metasSaveBtn')?.addEventListener('click',saveMetas);
    $m('#metasExcelBtn')?.addEventListener('click',exportExcel);
  }

  async function boot() {
    let tries=0;
    const timer=setInterval(async()=>{
      tries++;
      try{
        if(typeof currentAnalyst!=='undefined' && currentAnalyst){
          clearInterval(timer);
          setTabVisibility();
          if(!isAllowed()) return;
          await loadAreas();
          bind();
          await loadTable();
        }
      }catch(e){console.warn('Metas y cumplimiento:',e);}
      if(tries>60)clearInterval(timer);
    },400);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
