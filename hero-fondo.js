(() => {
  const MAX_BYTES = 3.5 * 1024 * 1024;

  const normalizeKey = (value) =>
    String(value || 'usuario')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '_');

  function currentUserKey() {
    try {
      const email =
        window.currentAnalyst?.email ||
        window.currentUser?.email ||
        window.currentAnalyst?.nombre ||
        'usuario';
      return `better_control_hero_bg_${normalizeKey(email)}`;
    } catch {
      return 'better_control_hero_bg_usuario';
    }
  }

  function getHero() {
    return document.querySelector('.cute-hero');
  }

  function setCloudsVisible(show) {
    document.querySelectorAll('.cute-hero .cloud').forEach(el => {
      el.style.display = show ? '' : 'none';
    });
  }

  function applyBackground(dataUrl) {
    const hero = getHero();
    if (!hero) return;

    hero.classList.add('hero-custom-bg');
    hero.style.backgroundImage =
      `linear-gradient(rgba(223,245,241,.58), rgba(223,245,241,.58)), url("${dataUrl}")`;
    hero.style.backgroundSize = 'cover';
    hero.style.backgroundPosition = 'center';
    hero.style.backgroundRepeat = 'no-repeat';
    setCloudsVisible(false);
  }

  function restoreDefaultBackground() {
    const hero = getHero();
    if (!hero) return;

    hero.classList.remove('hero-custom-bg');
    hero.style.backgroundImage = '';
    hero.style.backgroundSize = '';
    hero.style.backgroundPosition = '';
    hero.style.backgroundRepeat = '';
    setCloudsVisible(true);

    try {
      localStorage.removeItem(currentUserKey());
    } catch {}
  }

  function restoreSavedBackground() {
    try {
      const saved = localStorage.getItem(currentUserKey());
      if (saved) applyBackground(saved);
    } catch {}
  }

  function injectStyles() {
    if (document.getElementById('heroBgCustomizerStyles')) return;

    const style = document.createElement('style');
    style.id = 'heroBgCustomizerStyles';
    style.textContent = `
      .hero-bg-customizer{
        display:flex;
        align-items:center;
        flex-wrap:wrap;
        gap:8px;
        margin-top:14px;
        position:relative;
        z-index:4;
      }
      .hero-bg-customizer button{
        border:1px solid #8fbab2;
        background:rgba(255,255,255,.88);
        color:#355951;
        border-radius:10px;
        padding:8px 12px;
        cursor:pointer;
        font-weight:700;
        font-size:12px;
        box-shadow:0 2px 0 rgba(56,86,80,.08);
      }
      .hero-bg-customizer button:hover{
        background:#ffffff;
      }
      .hero-bg-customizer small{
        color:#5f7772;
        font-size:10px;
      }
      .cute-hero.hero-custom-bg{
        position:relative;
        overflow:hidden;
      }
      .cute-hero.hero-custom-bg::after{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:linear-gradient(90deg,rgba(255,255,255,.10),rgba(255,255,255,0));
        z-index:0;
      }
      .cute-hero.hero-custom-bg > *{
        position:relative;
        z-index:1;
      }
    `;
    document.head.appendChild(style);
  }

  function injectControls() {
    const hero = getHero();
    if (!hero || document.getElementById('heroBgCustomizer')) return false;

    const copy = hero.querySelector('.cute-copy');
    if (!copy) return false;

    const wrap = document.createElement('div');
    wrap.id = 'heroBgCustomizer';
    wrap.className = 'hero-bg-customizer';
    wrap.innerHTML = `
      <input id="heroBgInput" type="file"
        accept="image/png,image/jpeg,image/webp,image/gif" hidden />
      <button type="button" id="heroBgBtn">🖼️ Cambiar fondo</button>
      <button type="button" id="heroBgReset">☁️ Restaurar nubes</button>
      <small>El fondo se guarda solo en este navegador.</small>
    `;
    copy.appendChild(wrap);

    const input = wrap.querySelector('#heroBgInput');
    const changeBtn = wrap.querySelector('#heroBgBtn');
    const resetBtn = wrap.querySelector('#heroBgReset');

    changeBtn.addEventListener('click', () => input.click());

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        alert('Selecciona una imagen.');
        input.value = '';
        return;
      }

      if (file.size > MAX_BYTES) {
        alert('La imagen es muy pesada. Usa una imagen menor a 3.5 MB.');
        input.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (!dataUrl) return;

        try {
          localStorage.setItem(currentUserKey(), dataUrl);
          applyBackground(dataUrl);
        } catch {
          alert('No pude guardar el fondo. Prueba con una imagen más ligera.');
        }

        input.value = '';
      };
      reader.readAsDataURL(file);
    });

    resetBtn.addEventListener('click', restoreDefaultBackground);

    restoreSavedBackground();
    return true;
  }

  function boot() {
    injectStyles();

    if (injectControls()) return;

    const observer = new MutationObserver(() => {
      if (injectControls()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });

    setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
