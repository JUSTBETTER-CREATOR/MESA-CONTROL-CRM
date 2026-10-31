(() => {
  let reportRows = [];
  let reportAreas = [];
  let reportAnalysts = [];
  let reportBooted = false;

  const $r = (s) => document.querySelector(s);
  const escR = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));

  const normalizeR = (v) => String(v ?? "")
    .trim().toUpperCase().replace(/\s+/g, " ");

  function isReportGlobal() {
    try { return typeof isGlobal === "function" ? isGlobal() : currentAnalyst?.rol === "GLOBAL"; }
    catch { return false; }
  }

  function mexicoDateISO() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Mexico_City",
        year:"numeric", month:"2-digit", day:"2-digit"
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0,10);
    }
  }

  function formatDateLong(dateStr) {
    const [y,m,d] = dateStr.split("-").map(Number);
    return new Intl.DateTimeFormat("es-MX", {
      timeZone:"America/Mexico_City",
      weekday:"long", day:"numeric", month:"long", year:"numeric"
    }).format(new Date(Date.UTC(y,m-1,d,12)));
  }

  function rangeForMexicoDate(dateStr) {
    const start = new Date(`${dateStr}T00:00:00-06:00`);
    const next = new Date(start.getTime() + 24*60*60*1000);
    return { start:start.toISOString(), end:next.toISOString() };
  }

  function minutesBetween(a,b) {
    if (!a || !b) return null;
    const v = Math.round((new Date(b)-new Date(a))/60000);
    return Number.isFinite(v) && v >= 0 ? v : null;
  }

  async function bootReports() {
    if (reportBooted) return;
    if (typeof currentAnalyst === "undefined" || !currentAnalyst) return;
    reportBooted = true;

    const tab = $r("#reportsTab");
    if (!isReportGlobal()) {
      tab?.classList.add("hidden");
      return;
    }
    tab?.classList.remove("hidden");

    const dateEl = $r("#reportDate");
    if (dateEl && !dateEl.value) dateEl.value = mexicoDateISO();

    await loadReportCatalogs();
    bindReportEvents();
  }

  async function loadReportCatalogs() {
    const [areasRes, analystsRes] = await Promise.all([
      sb.from("areas").select("id,clave,nombre,activo,orden").eq("activo",true).order("orden"),
      sb.from("analistas").select("id,nombre,email,area_id,rol,activo,areas(nombre,clave)").eq("activo",true).order("nombre")
    ]);

    if (areasRes.error) return setReportStatus("No pude cargar áreas: "+areasRes.error.message, "error");
    if (analystsRes.error) return setReportStatus("No pude cargar personas: "+analystsRes.error.message, "error");

    reportAreas = areasRes.data || [];
    reportAnalysts = (analystsRes.data || []).filter(a => a.rol !== "GLOBAL");

    const area = $r("#reportArea");
    if (area) area.innerHTML = reportAreas.map(a => `<option value="${a.id}">${escR(a.nombre)}</option>`).join("");

    const person = $r("#reportPerson");
    if (person) person.innerHTML = reportAnalysts.map(a =>
      `<option value="${a.id}">${escR(a.nombre)} · ${escR(a.areas?.nombre || "SIN ÁREA")}</option>`
    ).join("");
  }

  function bindReportEvents() {
    const scope = $r("#reportScope");
    if (scope) scope.onchange = updateScopeControls;
    updateScopeControls();

    $r("#previewReportBtn")?.addEventListener("click", () => buildReportPreview(false));
    $r("#downloadReportPdfBtn")?.addEventListener("click", async () => {
      const ok = await buildReportPreview(true);
      if (ok) downloadPdf();
    });
    $r("#downloadReportExcelBtn")?.addEventListener("click", async () => {
      const ok = await buildReportPreview(true);
      if (ok) downloadExcel();
    });
  }

  function updateScopeControls() {
    const v = $r("#reportScope")?.value || "ALL";
    $r("#reportAreaWrap")?.classList.toggle("hidden", v !== "AREA");
    $r("#reportPersonWrap")?.classList.toggle("hidden", v !== "PERSON");
  }

  function setReportStatus(msg, type="") {
    const el = $r("#reportStatus");
    if (!el) return;
    el.className = "report-status" + (type ? " "+type : "");
    el.textContent = msg;
  }

  async function fetchReportRows() {
    const date = $r("#reportDate")?.value;
    if (!date) throw new Error("Selecciona una fecha.");

    const {start,end} = rangeForMexicoDate(date);

    let q = sb.from("actividades").select(
      "id,inicio,fin,estatus,region,determinante,actividad_manual,notas,cierre,analista_id,area_id,"+
      "analistas!actividades_analista_id_fkey(id,nombre,email),"+
      "areas(id,nombre,clave),tipos_actividad(id,nombre)"
    ).gte("inicio", start).lt("inicio", end).order("inicio",{ascending:true}).range(0,9999);

    const scope = $r("#reportScope")?.value || "ALL";
    if (scope === "AREA") {
      const areaId = $r("#reportArea")?.value;
      if (areaId) q = q.eq("area_id", areaId);
    }
    if (scope === "PERSON") {
      const analystId = $r("#reportPerson")?.value;
      if (analystId) q = q.eq("analista_id", analystId);
    }

    const {data,error} = await q;
    if (error) throw error;

    return (data || []).map(x => ({
      id:x.id,
      area:x.areas?.nombre || "SIN ÁREA",
      area_id:x.area_id,
      persona:x.analistas?.nombre || "SIN PERSONA",
      analista_id:x.analista_id,
      actividad:x.tipos_actividad?.nombre || x.actividad_manual || "ACTIVIDAD",
      estatus:x.estatus || "",
      inicio:x.inicio,
      fin:x.fin,
      minutos:minutesBetween(x.inicio,x.fin),
      cierre:x.cierre || "",
      notas:x.notas || "",
      determinante:x.determinante || "",
      region:x.region || ""
    }));
  }

  function consolidateRows(rows) {
    if (!$r("#reportDeduplicate")?.checked) {
      return rows.map(r => ({...r, veces:1}));
    }

    const map = new Map();
    for (const r of rows) {
      const key = [r.area_id,r.analista_id,normalizeR(r.actividad)].join("|");
      if (!map.has(key)) {
        map.set(key,{...r,veces:1,minutos_total:Number.isFinite(r.minutos)?r.minutos:0});
      } else {
        const a = map.get(key);
        a.veces++;
        if (Number.isFinite(r.minutos)) a.minutos_total += r.minutos;
        if (r.estatus === "EN_CURSO") a.estatus = "EN_CURSO";
        if (!a.cierre && r.cierre) a.cierre = r.cierre;
        if (!a.notas && r.notas) a.notas = r.notas;
      }
    }
    return [...map.values()].map(r => ({
      ...r,
      minutos: r.minutos_total ?? r.minutos
    }));
  }

  function summarizePeople(rows) {
    const by = new Map();
    for (const r of rows) {
      const key = `${r.area}|${r.persona}`;
      if (!by.has(key)) by.set(key,{area:r.area,persona:r.persona,actividades:0,finalizadas:0,en_curso:0});
      const x = by.get(key);
      x.actividades++;
      if (r.estatus === "FINALIZADA") x.finalizadas++;
      if (r.estatus === "EN_CURSO") x.en_curso++;
    }
    return [...by.values()].sort((a,b) =>
      a.area.localeCompare(b.area,"es") ||
      b.actividades-a.actividades ||
      a.persona.localeCompare(b.persona,"es")
    );
  }

  function summarizeAreas(rows) {
    const by = new Map();
    for (const r of rows) {
      if (!by.has(r.area)) by.set(r.area,{area:r.area,actividades:0,personas:new Set(),finalizadas:0,en_curso:0});
      const x = by.get(r.area);
      x.actividades++;
      x.personas.add(r.persona);
      if (r.estatus === "FINALIZADA") x.finalizadas++;
      if (r.estatus === "EN_CURSO") x.en_curso++;
    }
    return [...by.values()]
      .map(x => ({...x,personas:x.personas.size}))
      .sort((a,b)=>b.actividades-a.actividades);
  }

  // NUEVO: promedio de duración por tipo de tarea, separado por área.
  function summarizeTaskTimes(rows) {
    const by = new Map();

    for (const r of rows) {
      if (normalizeR(r.estatus) !== "FINALIZADA") continue;
      if (!Number.isFinite(r.minutos)) continue;

      const key = `${r.area_id}|${normalizeR(r.actividad)}`;
      if (!by.has(key)) {
        by.set(key,{
          area:r.area,
          actividad:r.actividad,
          ejecuciones:0,
          minutos_total:0,
          minimo:null,
          maximo:null
        });
      }

      const x = by.get(key);
      x.ejecuciones++;
      x.minutos_total += r.minutos;
      x.minimo = x.minimo === null ? r.minutos : Math.min(x.minimo,r.minutos);
      x.maximo = x.maximo === null ? r.minutos : Math.max(x.maximo,r.minutos);
    }

    return [...by.values()]
      .map(x => ({
        ...x,
        promedio_minutos: x.ejecuciones ? Math.round(x.minutos_total/x.ejecuciones) : 0
      }))
      .sort((a,b) =>
        a.area.localeCompare(b.area,"es") ||
        b.ejecuciones-a.ejecuciones ||
        a.actividad.localeCompare(b.actividad,"es")
      );
  }

  function getReportLabel() {
    const scope = $r("#reportScope")?.value || "ALL";
    if (scope === "AREA") return $r("#reportArea")?.selectedOptions?.[0]?.textContent || "Área";
    if (scope === "PERSON") return $r("#reportPerson")?.selectedOptions?.[0]?.textContent || "Persona";
    return "Todas las áreas";
  }

  async function buildReportPreview(silent=false) {
    if (!isReportGlobal()) {
      setReportStatus("Esta función es exclusiva para Coordinación / rol GLOBAL.", "error");
      return false;
    }

    const btn = $r("#previewReportBtn");
    if (!silent && btn) { btn.disabled=true; btn.textContent="Generando..."; }

    try {
      setReportStatus("Consultando actividades y preparando informe...");
      const raw = await fetchReportRows();
      reportRows = consolidateRows(raw);
      renderReportPreview(raw.length, reportRows);
      setReportStatus(`Informe listo: ${reportRows.length} actividades visibles (${raw.length} registros originales).`,"ok");
      return true;
    } catch (e) {
      console.error(e);
      setReportStatus("No pude generar el informe: "+(e?.message || e),"error");
      return false;
    } finally {
      if (!silent && btn) { btn.disabled=false; btn.textContent="👁 Generar vista previa"; }
    }
  }

  function ensureTaskTimeSection() {
    if ($r("#reportTaskTimesWindow")) return;

    const preview = $r("#reportPreview");
    if (!preview) return;

    const detailWin = $r("#reportDetailBody")?.closest(".window");
    const win = document.createElement("div");
    win.className = "window";
    win.id = "reportTaskTimesWindow";
    win.innerHTML = `
      <div class="titlebar"><span>⏱ PROMEDIO DE TIEMPO POR TAREA</span><span>— □ ×</span></div>
      <div class="window-body report-table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Área</th>
              <th>Actividad</th>
              <th>Ejecuciones</th>
              <th>Promedio</th>
              <th>Mínimo</th>
              <th>Máximo</th>
            </tr>
          </thead>
          <tbody id="reportTaskTimesBody"></tbody>
        </table>
      </div>
    `;
    if (detailWin) preview.insertBefore(win, detailWin);
    else preview.appendChild(win);
  }

  function renderReportPreview(rawCount, rows) {
    const date = $r("#reportDate").value;
    const label = getReportLabel();
    const people = summarizePeople(rows);
    const areas = summarizeAreas(rows);
    const taskTimes = summarizeTaskTimes(rows);
    const finalizadas = rows.filter(r=>r.estatus==="FINALIZADA").length;
    const enCurso = rows.filter(r=>r.estatus==="EN_CURSO").length;
    const reps = Math.max(0, rawCount-rows.length);

    $r("#reportPreview")?.classList.remove("hidden");
    $r("#reportPreviewTitle").textContent = "Informe de actividades";
    $r("#reportPreviewSubtitle").textContent = `${formatDateLong(date)} · ${label}`;
    $r("#reportPreviewBadge").textContent = $r("#reportDeduplicate").checked ? "SIN ACTIVIDADES REPETIDAS" : "DETALLE COMPLETO";

    const kpis = [
      [rows.length,"ACTIVIDADES"],
      [people.length,"COLABORADORES"],
      [areas.length,"ÁREAS"],
      [finalizadas,"FINALIZADAS"],
      [enCurso,"EN CURSO"]
    ];
    $r("#reportKpis").innerHTML = kpis.map(([v,t])=>`<div class="report-kpi"><strong>${v}</strong><span>${t}</span></div>`).join("");

    $r("#reportExecutiveSummary").innerHTML = `
      <div class="report-summary-cards">
        ${areas.map(a=>`<div class="report-summary-card">
          <b>${escR(a.area)}</b>
          <small>${a.actividades} actividades · ${a.personas} personas · ${a.finalizadas} finalizadas</small>
        </div>`).join("") || '<div class="empty">Sin actividad en la fecha seleccionada.</div>'}
      </div>
      ${reps ? `<p class="muted" style="margin-top:12px">Se consolidaron <b>${reps}</b> registros repetidos para evitar duplicados visuales.</p>` : ""}
    `;

    $r("#reportPeopleBody").innerHTML = people.map(p=>`
      <tr><td>${escR(p.area)}</td><td><b>${escR(p.persona)}</b></td><td>${p.actividades}</td><td>${p.finalizadas}</td><td>${p.en_curso}</td></tr>
    `).join("");

    ensureTaskTimeSection();
    const taskBody = $r("#reportTaskTimesBody");
    if (taskBody) {
      taskBody.innerHTML = taskTimes.map(t=>`
        <tr>
          <td>${escR(t.area)}</td>
          <td><b>${escR(t.actividad)}</b></td>
          <td>${t.ejecuciones}</td>
          <td><b>${t.promedio_minutos} min</b></td>
          <td>${t.minimo} min</td>
          <td>${t.maximo} min</td>
        </tr>
      `).join("") || `<tr><td colspan="6">No hay actividades finalizadas con tiempo para calcular promedio.</td></tr>`;
    }

    $r("#reportDetailBody").innerHTML = rows.map(r=>`
      <tr>
        <td>${escR(r.area)}</td>
        <td>${escR(r.persona)}</td>
        <td>${escR(r.actividad)}</td>
        <td>${escR(r.estatus)}</td>
        <td>${r.veces || 1}</td>
        <td>${Number.isFinite(r.minutos)?r.minutos:""}</td>
        <td>${escR(r.cierre || r.notas || "-")}</td>
      </tr>
    `).join("");
  }

  function pdfHeader(doc, title, subtitle) {
    const w = doc.internal.pageSize.getWidth();
    doc.setFillColor(224,243,238);
    doc.rect(0,0,w,32,"F");
    doc.setTextColor(36,55,52);
    doc.setFont("helvetica","bold");
    doc.setFontSize(18);
    doc.text(title,14,14);
    doc.setFont("helvetica","normal");
    doc.setFontSize(9);
    doc.setTextColor(95,112,108);
    doc.text(subtitle,14,22);
    doc.setDrawColor(76,126,116);
    doc.setLineWidth(.7);
    doc.line(14,28,w-14,28);
  }

  function addPdfFooter(doc) {
    const pages = doc.getNumberOfPages();
    for (let i=1;i<=pages;i++) {
      doc.setPage(i);
      const w=doc.internal.pageSize.getWidth(), h=doc.internal.pageSize.getHeight();
      doc.setDrawColor(220,229,226);
      doc.line(14,h-10,w-14,h-10);
      doc.setFontSize(7);
      doc.setTextColor(110,120,117);
      doc.text("BETTER CONTROL · Informe generado desde el CRM",14,h-5);
      doc.text(`Página ${i} de ${pages}`,w-14,h-5,{align:"right"});
    }
  }

  function downloadPdf() {
    if (!reportRows.length) return setReportStatus("No hay datos para descargar.","error");
    if (!window.jspdf?.jsPDF) return setReportStatus("No cargó el generador PDF. Recarga la página.","error");

    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
    const date = $r("#reportDate").value;
    const label = getReportLabel();
    const people = summarizePeople(reportRows);
    const areas = summarizeAreas(reportRows);
    const taskTimes = summarizeTaskTimes(reportRows);
    const finalizadas = reportRows.filter(r=>r.estatus==="FINALIZADA").length;
    const enCurso = reportRows.filter(r=>r.estatus==="EN_CURSO").length;

    pdfHeader(doc,"Informe de actividades",`${formatDateLong(date)} · ${label}`);

    const kpis = [
      ["ACTIVIDADES",reportRows.length],
      ["COLABORADORES",people.length],
      ["ÁREAS",areas.length],
      ["FINALIZADAS",finalizadas],
      ["EN CURSO",enCurso]
    ];
    const cardW = 48, gap=4, y=38;
    kpis.forEach(([t,v],i)=>{
      const x=14+i*(cardW+gap);
      const fills=[[231,247,242],[255,248,237],[251,235,240],[231,247,242],[255,248,237]];
      doc.setFillColor(...fills[i]); doc.roundedRect(x,y,cardW,18,3,3,"F");
      doc.setTextColor(190,78,109); doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.text(String(v),x+5,y+8);
      doc.setTextColor(95,108,105); doc.setFontSize(6.7); doc.text(t,x+5,y+14);
    });

    doc.setTextColor(36,55,52); doc.setFont("helvetica","bold"); doc.setFontSize(11);
    doc.text("Resumen por área",14,66);

    doc.autoTable({
      startY:70,
      head:[["Área","Actividades","Personas","Finalizadas","En curso"]],
      body:areas.map(a=>[a.area,a.actividades,a.personas,a.finalizadas,a.en_curso]),
      theme:"grid",
      styles:{fontSize:8,cellPadding:3,textColor:[45,62,59],lineColor:[220,230,227]},
      headStyles:{fillColor:[65,111,103],textColor:255,fontStyle:"bold"},
      alternateRowStyles:{fillColor:[246,251,249]}
    });

    let y2 = doc.lastAutoTable.finalY + 8;
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(36,55,52);
    doc.text("Resumen por colaborador",14,y2);

    doc.autoTable({
      startY:y2+4,
      head:[["Área","Persona","Actividades","Finalizadas","En curso"]],
      body:people.map(p=>[p.area,p.persona,p.actividades,p.finalizadas,p.en_curso]),
      theme:"grid",
      styles:{fontSize:7.5,cellPadding:2.5,textColor:[45,62,59],lineColor:[220,230,227]},
      headStyles:{fillColor:[36,55,52],textColor:255,fontStyle:"bold"},
      alternateRowStyles:{fillColor:[246,251,249]},
      pageBreak:"auto"
    });

    doc.addPage();
    pdfHeader(doc,"Promedio de tiempo por tarea",`${formatDateLong(date)} · ${label}`);

    doc.autoTable({
      startY:36,
      head:[["Área","Actividad","Ejecuciones","Promedio","Mínimo","Máximo"]],
      body:taskTimes.map(t=>[
        t.area,
        t.actividad,
        t.ejecuciones,
        `${t.promedio_minutos} min`,
        `${t.minimo} min`,
        `${t.maximo} min`
      ]),
      theme:"grid",
      styles:{fontSize:7.2,cellPadding:2.5,textColor:[43,58,55],lineColor:[224,232,230]},
      headStyles:{fillColor:[190,78,109],textColor:255,fontStyle:"bold"},
      alternateRowStyles:{fillColor:[250,245,247]},
      columnStyles:{1:{cellWidth:95}}
    });

    doc.addPage();
    pdfHeader(doc,"Detalle de actividades",`${formatDateLong(date)} · ${label}`);
    doc.autoTable({
      startY:36,
      head:[["Área","Persona","Actividad","Estatus","Veces","Min.","Cierre / nota"]],
      body:reportRows.map(r=>[
        r.area,r.persona,r.actividad,r.estatus,String(r.veces||1),
        Number.isFinite(r.minutos)?String(r.minutos):"",
        r.cierre || r.notas || "-"
      ]),
      theme:"grid",
      styles:{fontSize:6.7,cellPadding:2.1,valign:"top",textColor:[43,58,55],lineColor:[224,232,230]},
      headStyles:{fillColor:[65,111,103],textColor:255,fontStyle:"bold"},
      alternateRowStyles:{fillColor:[247,251,250]},
      columnStyles:{2:{cellWidth:62},6:{cellWidth:72}}
    });

    addPdfFooter(doc);

    const safeLabel = label.replace(/[^a-zA-Z0-9ÁÉÍÓÚÑáéíóúñ_-]+/g,"_").slice(0,45);
    doc.save(`BETTER_CONTROL_Informe_${date}_${safeLabel}.pdf`);
    setReportStatus("PDF descargado correctamente ♡","ok");
  }

  function downloadExcel() {
    if (!reportRows.length) return setReportStatus("No hay datos para descargar.","error");
    if (!window.XLSX) return setReportStatus("No cargó XLSX. Recarga la página.","error");

    const people = summarizePeople(reportRows);
    const areas = summarizeAreas(reportRows);
    const taskTimes = summarizeTaskTimes(reportRows);

    const detail = reportRows.map(r=>({
      AREA:r.area,
      PERSONA:r.persona,
      ACTIVIDAD:r.actividad,
      ESTATUS:r.estatus,
      VECES_REGISTRADA:r.veces||1,
      MINUTOS:r.minutos ?? "",
      CIERRE:r.cierre,
      NOTAS:r.notas,
      DETERMINANTE:r.determinante,
      REGION:r.region
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(areas),"Resumen Areas");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(people),"Resumen Personas");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(taskTimes),"Promedio por Tarea");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(detail),"Detalle");

    const date = $r("#reportDate").value;
    XLSX.writeFile(wb,`BETTER_CONTROL_Informe_${date}.xlsx`);
    setReportStatus("Excel descargado correctamente ♡","ok");
  }

  const watcher = setInterval(() => {
    try {
      if (typeof currentAnalyst !== "undefined" && currentAnalyst) {
        bootReports();
        if (reportBooted) clearInterval(watcher);
      }
    } catch {}
  }, 400);
})();
