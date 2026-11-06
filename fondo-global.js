/* BETTER CONTROL · FONDO GLOBAL PERSONALIZABLE */
(() => {
  const DB_NAME = 'better_control_preferences';
  const STORE = 'backgrounds';
  const VERSION = 1;

  const $ = (s) => document.querySelector(s);

  function userKey(){
    try {
      const id = currentAnalyst?.id || currentAnalyst?.email || 'anon';
      return `crm-global-bg:${String(id).toLowerCase()}`;
    } catch {
      return 'crm-global-bg:anon';
    }
  }

  function openDb(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)) return reject(new Error('IndexedDB no disponible'));
      const req=indexedDB.open(DB_NAME,VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  async function dbGet(key){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly');
      const req=tx.objectStore(STORE).get(key);
      req.onsuccess=()=>resolve(req.result || null);
      req.onerror=()=>reject(req.error);
    });
  }

  async function dbSet(key,value){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(value,key);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });
  }

  async function dbDelete(key){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });
  }

  function applyBackground(dataUrl){
    if(dataUrl){
      document.documentElement.style.setProperty('--crm-user-bg', `url("${dataUrl.replace(/"/g,'\\"')}")`);
      document.body.classList.add('crm-custom-background');
    }else{
      document.documentElement.style.setProperty('--crm-user-bg','none');
      document.body.classList.remove('crm-custom-background');
    }
  }

  function setStatus(msg){
    const el=$('#crmGlobalBgStatus');
    if(el) el.textContent=msg || '';
  }

  async function restoreSaved(){
    const key=userKey();
    try{
      const saved=await dbGet(key);
      if(saved?.dataUrl){
        applyBackground(saved.dataUrl);
        setStatus('Fondo personalizado activo');
        return;
      }
    }catch{}
    // Compatibilidad con versiones antiguas guardadas en localStorage.
    try{
      const legacy=localStorage.getItem(key) || localStorage.getItem('betterControlHeroBackground');
      if(legacy){
        applyBackground(legacy);
        setStatus('Fondo personalizado activo');
      }
    }catch{}
  }

  function installControls(){
    if($('#crmGlobalBgControls')) return;
    const host=$('.cute-copy') || $('#view-inicio .window-body') || $('#view-inicio');
    if(!host) return;

    const wrap=document.createElement('div');
    wrap.id='crmGlobalBgControls';
    wrap.className='crm-global-bg-controls';
    wrap.innerHTML=`
      <input id="crmGlobalBgInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
      <button type="button" id="crmGlobalBgBtn">🖼️ Cambiar fondo completo</button>
      <button type="button" id="crmGlobalBgReset">↺ Restaurar fondo</button>
      <span id="crmGlobalBgStatus" class="bg-status"></span>
      <small>La imagen cubre todo el CRM y queda guardada únicamente en este navegador.</small>`;
    host.appendChild(wrap);

    const input=$('#crmGlobalBgInput');
    $('#crmGlobalBgBtn')?.addEventListener('click',()=>input?.click());

    input?.addEventListener('change',()=>{
      const file=input.files?.[0];
      if(!file) return;
      if(!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)){
        setStatus('Selecciona PNG, JPG, WEBP o GIF');
        input.value='';
        return;
      }
      // 12 MB: IndexedDB tolera imágenes mucho mejor que localStorage.
      if(file.size > 12*1024*1024){
        setStatus('La imagen es muy pesada. Usa una menor a 12 MB.');
        input.value='';
        return;
      }
      const reader=new FileReader();
      reader.onload=async()=>{
        const dataUrl=String(reader.result||'');
        applyBackground(dataUrl);
        setStatus('Fondo actualizado ✓');
        try{ await dbSet(userKey(),{dataUrl,updatedAt:new Date().toISOString()}); }
        catch{
          try{ localStorage.setItem(userKey(),dataUrl); }catch{}
        }
        input.value='';
      };
      reader.onerror=()=>setStatus('No pude leer esa imagen');
      reader.readAsDataURL(file);
    });

    $('#crmGlobalBgReset')?.addEventListener('click',async()=>{
      applyBackground(null);
      setStatus('Fondo original restaurado');
      try{ await dbDelete(userKey()); }catch{}
      try{
        localStorage.removeItem(userKey());
        localStorage.removeItem('betterControlHeroBackground');
      }catch{}
    });
  }

  function removeOldHeroControls(){
    ['.hero-bg-customizer','#heroBgCustomizer','#heroBgInput','#heroBgBtn','#heroBgReset']
      .forEach(sel=>document.querySelectorAll(sel).forEach(el=>el.remove()));
  }

  function boot(){
    let tries=0;
    const timer=setInterval(async()=>{
      tries++;
      const shell=$('#appShell');
      const analystReady=(()=>{try{return typeof currentAnalyst!=='undefined' && !!currentAnalyst;}catch{return false;}})();
      if(shell && analystReady){
        clearInterval(timer);
        removeOldHeroControls();
        installControls();
        await restoreSaved();
        // Old scripts may inject their controls later; remove them once more.
        setTimeout(removeOldHeroControls,1200);
      }
      if(tries>90) clearInterval(timer);
    },350);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
