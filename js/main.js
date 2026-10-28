/* =========================================================
   Feira de Ciências · SENAI — interações da landing page
   Tudo aqui usa IntersectionObserver (nada de eventos de scroll).
   O 3D do Rocket SENAI fica em js/rocket.js.
   ========================================================= */
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Barra do topo fica sólida depois do primeiro scroll ---------- */
  const topbar = document.querySelector('.topbar');
  const sentinel = document.querySelector('.top-sentinel');
  if (topbar && sentinel) {
    new IntersectionObserver(([entry]) => {
      topbar.classList.toggle('is-solid', !entry.isIntersecting);
    }).observe(sentinel);
  }

  /* ---------- Elementos que aparecem ao rolar ---------- */
  const revealer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      revealer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  document.querySelectorAll('[data-reveal]').forEach((el) => revealer.observe(el));

  /* ---------- Animações contínuas só rodam com a seção na tela ---------- */
  const live = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.classList.toggle('is-visible', entry.isIntersecting);
  });
  document.querySelectorAll('[data-live]').forEach((el) => live.observe(el));

  /* ---------- Menu destaca o projeto que está na tela ---------- */
  const links = new Map([...document.querySelectorAll('.nav a')].map((a) => [a.hash.slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((link, id) => {
        if (id === entry.target.id) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main section[id]').forEach((section) => spy.observe(section));

  /* ---------- Fotos inclinam de leve seguindo o mouse ---------- */
  if (!reduceMotion && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      let frame = 0;
      el.addEventListener('pointermove', (event) => {
        const box = el.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          el.style.setProperty('--ry', `${(x * 12).toFixed(2)}deg`);
          el.style.setProperty('--rx', `${(-y * 12).toFixed(2)}deg`);
        });
      });
      el.addEventListener('pointerleave', () => {
        cancelAnimationFrame(frame);
        el.style.removeProperty('--rx');
        el.style.removeProperty('--ry');
      });
    });
  }

  /* ---------- Rocket SENAI aberto direto do arquivo ---------- */
  // Pelo file:// o navegador bloqueia módulos ES e o download do modelo, então o js/rocket.js nem roda.
  const rocketStatus = document.querySelector('.rk-loader-status');
  if (rocketStatus && location.protocol === 'file:') {
    rocketStatus.textContent = 'Para ver o 3D, abra o site por um servidor (por exemplo, a extensão Live Server do VS Code).';
  }
})();
