/* =========================================================
   Feira de Ciências · SENAI — interações da landing page
   Nada de eventos de scroll: tudo usa IntersectionObserver,
   e o 3D só existe na página enquanto alguém está olhando.
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

  /* =========================================================
     Rocket SENAI: modelo 3D do Sketchfab
     ========================================================= */
  const garage = document.querySelector('.garage');
  if (!garage) return;

  // Opções do player do Sketchfab. As de desempenho foram medidas com os contadores de GPU do Windows
  // (Intel Iris Xe, girando o carro com o mouse): o embed padrão usava ~42% da GPU (picos de 64%);
  // com estas opções fica em ~28% (picos de 36%). Parado, o player não redesenha nada (~1%),
  // e fora da tela o navegador também para de desenhar.
  const VIEWER_OPTIONS = {
    autostart: 1,
    preload: 1,                 // baixa as texturas antes de mostrar (sem "pipocar" de qualidade)
    transparent: 1,             // o fundo da garagem aparece atrás do carro
    ui_theme: 'dark',
    ui_stop: 0,                 // esconde o "X" do Sketchfab (o botão "Desligar 3D" faz isso)
    dnt: 1,                     // sem cookies/rastreamento do Sketchfab
    max_device_pixel_ratio: 1,  // renderiza em 1x mesmo com zoom do Windows (125%) ou tela retina
    max_texture_size: 2048,     // texturas de no máximo 2048 px (menos memória de vídeo)
    post_process: 0,            // sem efeitos de pós-processamento: ~30% menos GPU e o fundo fica 100% transparente
    // force_ms: 33,            // PC fraco? Descomente: limita a 30 fps (~13% da GPU girando, mas menos suave)
  };
  const START_ON_SCROLL = false; // true = liga o 3D sozinho ao chegar na seção (usa a GPU sem ninguém pedir)
  const UNLOAD_AFTER_MS = 20000; // fora da tela (ou aba escondida) por 20 s → desliga o 3D e libera a GPU
  const LIGHTS_MS = 2300;        // duração da sequência das 5 luzes de largada
  const WIDE_ASPECT = 1.6;       // abaixo desta proporção (largura/altura), a câmera do autor corta o carro
  const API_URL = 'https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js';

  const modelId = garage.dataset.model;
  const stage = garage.querySelector('.garage-stage');
  const status = garage.querySelector('.garage-status');
  const startButton = garage.querySelector('[data-action="start"]');
  const stopButton = document.querySelector('[data-action="stop"]');
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);

  let iframe = null;
  let run = 0;          // muda a cada liga/desliga, para ignorar respostas de um carregamento antigo
  let inView = false;
  let unloadTimer = 0;
  let wanted = START_ON_SCROLL && !saveData; // a pessoa quer ver o 3D? (o clique em "Ligar" vira true)
  let viewerApi = null;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // A API do Sketchfab avisa quando o carro está pronto ("viewerready").
  // Só é baixada no primeiro clique, nunca no carregamento da página.
  const loadViewerApi = () => {
    if (!viewerApi) {
      viewerApi = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = API_URL;
        script.onload = () => (window.Sketchfab ? resolve(window.Sketchfab) : reject(new Error('API indisponível')));
        script.onerror = () => {
          viewerApi = null;
          reject(new Error('API não carregou'));
        };
        document.head.append(script);
      });
    }
    return viewerApi;
  };

  const setState = (state, message = '') => {
    garage.dataset.state = state;
    status.textContent = message;
    stopButton.hidden = state === 'idle';
  };

  const start = async () => {
    clearTimeout(unloadTimer);
    if (iframe) return;
    if (!navigator.onLine) {
      setState('idle', 'Sem internet: o modelo 3D precisa de conexão.');
      return;
    }

    const thisRun = ++run;
    iframe = document.createElement('iframe');
    iframe.title = 'Modelo 3D: F1 2025 Ferrari SF-25';
    iframe.allow = 'autoplay; fullscreen; xr-spatial-tracking; web-share';
    iframe.allowFullscreen = true;
    stage.append(iframe);
    setState('loading', 'Aquecendo os pneus…');

    const frame = iframe;
    // Tela estreita (celular em pé): a câmera do autor corta o carro. Pulamos a animação
    // de entrada (camera: 0) e enquadramos o modelo inteiro antes de mostrar.
    const narrow = frame.clientWidth / frame.clientHeight < WIDE_ASPECT;
    const options = narrow ? { ...VIEWER_OPTIONS, camera: 0 } : VIEWER_OPTIONS;

    const ready = new Promise((resolve) => {
      setTimeout(resolve, 30000); // se algo travar, mostra o player mesmo assim
      loadViewerApi()
        .then((Sketchfab) => {
          new Sketchfab('1.12.1', frame).init(modelId, {
            ...options,
            success: (api) => api.addEventListener('viewerready', () => {
              if (narrow) api.recenterCamera(resolve);
              else resolve();
            }),
            error: resolve,
          });
        })
        .catch(() => {
          // Sem a API: usa o embed comum e mostra quando o iframe terminar de carregar
          frame.addEventListener('load', resolve, { once: true });
          frame.src = `https://sketchfab.com/models/${modelId}/embed?${new URLSearchParams(VIEWER_OPTIONS)}`;
        });
    });

    await Promise.all([ready, wait(LIGHTS_MS)]);
    if (thisRun === run) setState('running'); // apagam as luzes: largada!
  };

  const stop = (message) => {
    clearTimeout(unloadTimer);
    run++;
    if (!iframe) return;
    iframe.remove(); // remover o iframe destrói o contexto WebGL e devolve a memória de vídeo
    iframe = null;
    setState('idle', message);
  };

  const scheduleStop = () => {
    clearTimeout(unloadTimer);
    unloadTimer = setTimeout(() => stop('3D desligado para poupar a placa de vídeo.'), UNLOAD_AFTER_MS);
  };

  startButton.addEventListener('click', () => {
    wanted = true;
    start();
  });
  stopButton.addEventListener('click', () => {
    wanted = false;
    stop('3D desligado.');
    startButton.focus();
  });

  new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    inView = entry.intersectionRatio >= 0.35;
    if (entry.isIntersecting) clearTimeout(unloadTimer);
    else if (iframe) scheduleStop();
    if (inView && wanted) start(); // quem já ligou o 3D e voltou para a seção vê o carro de novo
  }, { threshold: [0, 0.35] }).observe(garage);

  // Aba escondida: o navegador já para de desenhar; depois de 20 s também liberamos a memória
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (iframe) scheduleStop();
    } else if (inView) {
      clearTimeout(unloadTimer);
      if (wanted) start();
    }
  });

  addEventListener('online', () => {
    if (inView && wanted) start();
    else if (!iframe) status.textContent = '';
  });
})();
