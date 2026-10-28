/* =========================================================
   Rocket SENAI — o carro em 3D, guiado pela rolagem
   - O modelo (img/3d_model/sf-26-web.glb) só é baixado quando a seção se aproxima.
   - A rolagem vira um "tempo" t medido em capítulos: t = 2 quando o centro do capítulo 2
     passa pelo meio da tela. Câmera, carro, luzes e HUD são funções de t (tabelas abaixo).
   - Da largada em diante a SF-26 e o Mini Cooper correm sozinhos pela pista; a rolagem só escolhe a câmera.
   - O Mini (img/3d_model/mini-cooper-web.glb) é baixado depois da SF-26 e só aparece quando a pista surge.
   - Só desenha quando algo muda e o palco está na tela: parado, a placa de vídeo descansa.
   ========================================================= */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MODEL_URL = 'img/3d_model/sf-26-web.glb';
const MINI_URL = 'img/3d_model/mini-cooper-web.glb';
const MODEL_SIZE = '10,9 MB'; // os dois carros

/* ---------- Pista: pontos de controle (m) de uma curva Catmull-Rom fechada ---------- */
// Reta principal (o grid fica em s = 0), hairpin, "esses", curva longa, reta oposta, chicane e curva final.
const TRACK_POINTS = [
  [0, 0], [0, 200], [-12, 248], [-48, 270], [-88, 258], [-104, 222], [-98, 178], [-74, 140],
  [-82, 98], [-114, 70], [-158, 56], [-200, 30], [-218, -22], [-212, -110], [-200, -168],
  [-176, -188], [-156, -216], [-114, -242], [-62, -236], [-22, -200], [-6, -120],
];
const ROAD = 13;           // largura da pista (m)
const START_LINE = 7;      // linha de largada, metros à frente do carro no grid
const GANTRY_AT = 16;      // pórtico com as cinco luzes
// Física simplificada (m/s e m/s²): velocidade máxima, aceleração lateral nas curvas, arrancada e frenagem
const V_MAX = 92;
const A_LAT = 32;
const A_ACC = 11;
const A_BRAKE = 38;
const LIGHT_STEP = 0.6;    // segundos entre cada luz de largada
const GEARS = [0, 22, 33, 44, 55, 65, 75, 84, 93]; // velocidade máxima de cada marcha (m/s)
// Dois carros, cada um numa metade da pista: SF-26 à esquerda, Mini Cooper à direita
const LANE = 2;            // distância do meio da pista até o centro de cada carro (m)
const MINI_GRID = -1.2;    // o Mini larga ao lado da SF-26, um pouco atrás
const DUEL_GAP = 7;        // na corrida o Mini fica até 7 m à frente ou atrás...
const DUEL_WAVE = 600;     // ...e as posições se invertem a cada ~300 m

/* ---------- Linha do tempo (t em capítulos) ---------- */
// Câmera: órbita em volta de um alvo preso ao carro (x = esquerda, y = cima, z = frente do carro).
// [t, azimute°, elevação°, distância m, alvo x, alvo y, alvo z, fov°, desloc. da imagem no PC, no celular]
const SHOTS = [
  [0.00, 34, 6, 9.8, 0, 0.62, 0.3, 30, 0.3, 0.16],         // abertura: 3/4 de frente, baixo
  [1.00, 90, 2, 12.2, 0, 0.55, 0.3, 28, 0.2, 0.16],        // perfil
  [1.45, 122, 10, 11.6, 0, 0.95, 0.3, 30, 0.24, 0.16],
  [2.00, 150, 16, 11.6, 0, 1.15, 0.3, 30, 0.24, 0.16],     // eixos X, Y e Z
  [2.55, 172, 14, 10.8, 0, 1.0, 0.3, 30, 0.24, 0.16],
  [3.00, 206, 30, 5.4, 0, 1.15, -0.05, 36, 0.22, 0.12],    // ESP32-CAM de perto, em cima do carro
  [3.60, 180, 8, 17, -2, 1.4, 4, 40, 0.2, 0.08],           // atrás dos dois carros no grid, com as luzes no alto
  [4.00, 180, 11, 13, -1.8, 1, 2, 42, 0.2, 0.08],          // perseguição: os dois lado a lado
  [4.50, 180, 11, 13, -1.8, 1, 2, 42, 0.2, 0.08],
  [5.00, 180, 3.5, 30, 0, -0.51, 29.84, 66, 0, 0],         // câmera em cima do carro: ESP32-CAM no alto, a 1,32 m
  [5.45, 180, 3.5, 30, 0, -0.51, 29.84, 66, 0, 0],
  [6.00, 158, 46, 25, -2, 0, 0, 36, 0.5, 0.2],             // helicóptero, com os dois carros à direita do texto
];
// O carro no "estúdio": sobe (Y), gira (Y), inclina (X e Z) e as rodas se afastam
const LIFT = keys([[1.25, 0], [1.65, 0.85], [2.45, 0.85], [2.85, 0]]);
const YAW = keys([[1.3, 0], [2.05, 360]]);
const PITCH = keys([[1.55, 0], [1.8, -14], [2.05, 6], [2.3, 0]]);
const ROLL = keys([[1.65, 0], [1.9, 12], [2.15, -14], [2.4, 0]]);
const EXPLODE = keys([[2.0, 0], [2.2, 1], [2.45, 1], [2.65, 0]]);
const TRACK_MIX = keys([[3.2, 0], [3.65, 1]]);   // estúdio escuro → pista à noite
const MINI_IN = keys([[3.1, -46], [3.62, 0]]);   // o Mini chega por trás e para no grid ao lado da SF-26
const POV = keys([[4.55, 0], [4.98, 1], [5.47, 1], [5.9, 0]]);
const LIGHTS_AT = 3.68;    // a partir daqui as luzes acendem
const RESET_BELOW = 3.35;  // voltando para antes disto, os carros voltam ao grid

const PIVOT = new THREE.Vector3(0, 0.55, 0.27); // centro do carro (giros do "estúdio")
const CAM_SPOT = new THREE.Vector3(0, 1.27, -0.1); // onde a ESP32-CAM fica: no alto da SF-26, atrás da cabeça do piloto
const ESTUDIO = new THREE.Color(0x050506);
const NOITE = new THREE.Color(0x0a0d16);

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
const fmt = (v, digits = 1) => v.toFixed(digits).replace('.', ',').replace(/^-(0,0+)$/, '$1');

// Canal de quadros-chave: [[t, valor], ...] com transição suave entre cada par
function keys(list) {
  return (t) => {
    if (t <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) {
      if (t <= list[i][0]) {
        const [t0, v0] = list[i - 1];
        const [t1, v1] = list[i];
        return lerp(v0, v1, ease((t - t0) / (t1 - t0)));
      }
    }
    return list[list.length - 1][1];
  };
}

function sampleShot(t, out) {
  let a = SHOTS[0];
  let b = a;
  let k = 0;
  if (t >= SHOTS[SHOTS.length - 1][0]) a = b = SHOTS[SHOTS.length - 1];
  else {
    for (let i = 1; i < SHOTS.length; i++) {
      if (t <= SHOTS[i][0]) {
        a = SHOTS[i - 1];
        b = SHOTS[i];
        k = ease(clamp((t - a[0]) / (b[0] - a[0]), 0, 1));
        break;
      }
    }
  }
  for (let j = 1; j < a.length; j++) out[j - 1] = lerp(a[j], b[j], k);
  return out;
}

const supportsWebGL2 = () => {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
};

/* =========================================================
   Pista: tabela com uma amostra por metro (posição, direção, curvatura, velocidade-alvo)
   ========================================================= */
function buildTrack() {
  const curve = new THREE.CatmullRomCurve3(TRACK_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const dense = curve.getPoints(TRACK_POINTS.length * 160);
  const along = [0];
  for (let i = 1; i < dense.length; i++) along.push(along[i - 1] + dense[i].distanceTo(dense[i - 1]));
  const length = along[along.length - 1];
  const n = Math.round(length);
  const ds = length / n;
  const x = new Float32Array(n);
  const z = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++) {
    const s = i * ds;
    while (along[j + 1] < s) j++;
    const f = (s - along[j]) / (along[j + 1] - along[j] || 1);
    x[i] = lerp(dense[j].x, dense[j + 1].x, f);
    z[i] = lerp(dense[j].z, dense[j + 1].z, f);
  }
  const at = (i) => (i + n) % n;
  const heading = new Float32Array(n); // ângulo em Y: 0 = olhando para +Z
  for (let i = 0; i < n; i++) heading[i] = Math.atan2(x[at(i + 1)] - x[at(i - 1)], z[at(i + 1)] - z[at(i - 1)]);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = wrapAngle(heading[at(i + 1)] - heading[at(i - 1)]) / (2 * ds);
  const curv = new Float32Array(n); // 1/raio, positivo virando à esquerda
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -4; k <= 4; k++) sum += raw[at(i + k)];
    curv[i] = sum / 9;
  }
  // Velocidade-alvo: limite de curva, depois aceleração para frente e frenagem para trás (duas voltas fecham o laço)
  const speed = new Float32Array(n);
  for (let i = 0; i < n; i++) speed[i] = Math.min(V_MAX, Math.sqrt(A_LAT / Math.max(Math.abs(curv[i]), 1e-6)));
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 1; k <= n; k++) speed[at(k)] = Math.min(speed[at(k)], Math.sqrt(speed[at(k - 1)] ** 2 + 2 * A_ACC * ds));
    for (let k = n; k >= 1; k--) speed[at(k - 1)] = Math.min(speed[at(k - 1)], Math.sqrt(speed[at(k)] ** 2 + 2 * A_BRAKE * ds));
  }
  // Traçado: perto das curvas os carros puxam para o lado de dentro (os dois juntos, sem mudar a distância entre eles)
  const apex = new Float32Array(n);
  const reach = 45;
  const weights = [];
  for (let k = -reach; k <= reach; k++) weights.push(Math.exp(-((k * ds) ** 2) / (2 * 18 ** 2)));
  const total = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -reach; k <= reach; k++) sum += curv[at(i + k)] * weights[k + reach];
    apex[i] = clamp((sum / total) * 55, -2, 2);
  }
  return { length, n, ds, x, z, heading, curv, speed, apex };
}

function sampleTrack(track, s, out) {
  const u = ((s % track.length) + track.length) % track.length / track.ds;
  const i = Math.floor(u) % track.n;
  const j = (i + 1) % track.n;
  const f = u - Math.floor(u);
  out.x = lerp(track.x[i], track.x[j], f);
  out.z = lerp(track.z[i], track.z[j], f);
  out.heading = track.heading[i] + wrapAngle(track.heading[j] - track.heading[i]) * f;
  out.curv = lerp(track.curv[i], track.curv[j], f);
  out.speed = lerp(track.speed[i], track.speed[j], f);
  out.apex = lerp(track.apex[i], track.apex[j], f);
  out.apexSlope = (track.apex[j] - track.apex[i]) / track.ds;
  return out;
}

// Um carro na sua faixa: linha central + faixa (positivo = esquerda) + o traçado das curvas
function carPose(track, s, lane, out) {
  sampleTrack(track, s, out);
  const lateral = lane + out.apex;
  out.x += Math.cos(out.heading) * lateral;
  out.z -= Math.sin(out.heading) * lateral;
  out.heading += Math.atan(out.apexSlope);
  return out;
}

/* ---------- Texturas desenhadas em canvas (nada de arquivos extras) ---------- */
function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  draw(g, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // Para as placas com texto: redesenha quando a fonte Saira terminar de carregar
  texture.userData.redraw = () => {
    draw(g, w, h);
    texture.needsUpdate = true;
  };
  return texture;
}

function makeTextures(anisotropy) {
  const noise = (g, w, h, base, spread, count, size) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < count; i++) {
      const v = Math.random() * spread;
      g.fillStyle = `rgba(255,255,255,${v})`;
      g.fillRect(Math.random() * w, Math.random() * h, size, size);
    }
  };
  const asphalt = canvasTexture(256, 256, (g, w, h) => {
    noise(g, w, h, '#2a2a2f', 0.09, 7000, 1.5);
    g.fillStyle = 'rgba(0,0,0,0.18)'; // borracha no traçado ideal (a faixa do meio da pista)
    g.fillRect(0, h * 0.38, w, h * 0.24);
  });
  const grass = canvasTexture(128, 128, (g, w, h) => noise(g, w, h, '#0d140e', 0.05, 2500, 2));
  const kerb = canvasTexture(64, 8, (g, w, h) => {
    g.fillStyle = '#d3140c';
    g.fillRect(0, 0, w / 2, h);
    g.fillStyle = '#f1f1f1';
    g.fillRect(w / 2, 0, w / 2, h);
  });
  const checker = canvasTexture(384, 64, (g, w, h) => { // 12 quadrados de lado a lado da pista, 2 no sentido dela
    const sq = h / 2;
    for (let c = 0; c < w / sq; c++) {
      for (let r = 0; r < 2; r++) {
        g.fillStyle = (r + c) % 2 ? '#111' : '#f2f2f2';
        g.fillRect(c * sq, r * sq, sq, sq);
      }
    }
  });
  // Placas de LED em volta da pista: o grupo inteiro aparece no circuito
  const boards = [
    ['#d6130b', '#ffffff', 'ROCKET SENAI'],
    ['#1d0a3c', '#ffd21f', 'BRAWL SENAI'],
    ['#00080c', '#2ae8ff', 'TRON'],
    ['#f2f2f2', '#d6130b', 'SENAI'],
    ['#0b0b0e', '#ffffff', 'FEIRA DE CIÊNCIAS'],
    ['#d6130b', '#ffffff', 'ESP32-CAM'],
  ];
  const ads = canvasTexture(512 * boards.length, 128, (g, w, h) => {
    boards.forEach(([bg, fg, text], i) => {
      const x = i * 512;
      g.fillStyle = bg;
      g.fillRect(x, 0, 512, h);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + 508, 0, 4, h);
      g.fillStyle = fg;
      g.font = `italic 900 ${text.length > 12 ? 50 : 64}px Saira, "Arial Black", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, x + 256, h / 2 + 3, 470);
    });
  });
  const banner = canvasTexture(1024, 64, (g, w, h) => {
    g.fillStyle = '#d6130b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.font = 'italic 900 40px Saira, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('ROCKET SENAI  ·  FEIRA DE CIÊNCIAS SENAI 2026', w / 2, h / 2 + 2);
  });
  const crowd = canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#07070a';
    g.fillRect(0, 0, w, h);
    const colors = ['#e8150b', '#f4f4f7', '#ffd21f', '#2ae8ff', '#8a8a99', '#ff4f9a', '#3c3c48'];
    for (let row = 0; row < 16; row++) {
      for (let i = 0; i < 70; i++) {
        g.fillStyle = colors[(Math.random() * colors.length) | 0];
        g.globalAlpha = 0.35 + Math.random() * 0.5;
        g.fillRect(i * 7.3 + Math.random() * 3, row * 16 + 4 + Math.random() * 4, 3.5, 5);
      }
    }
    g.globalAlpha = 1;
  });
  const glow = canvasTexture(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  });
  for (const t of [asphalt, grass, kerb, checker, ads, banner, crowd]) t.anisotropy = anisotropy;
  if (document.fonts) {
    document.fonts.load('italic 900 64px Saira').then(() => {
      ads.userData.redraw();
      banner.userData.redraw();
    }, () => {});
  }
  return { asphalt, grass, kerb, checker, ads, banner, crowd, glow };
}

/* ---------- Geometria da pista ---------- */
// Faixa plana entre os deslocamentos laterais a < b (m; positivo = esquerda do carro), da amostra i0 em diante
function ribbon(track, i0, count, a, b, y, uLen, out = { pos: [], uv: [], idx: [] }) {
  const base = out.pos.length / 3;
  for (let k = 0; k <= count; k++) {
    const i = (i0 + k) % track.n;
    const h = track.heading[i];
    const lx = Math.cos(h);
    const lz = -Math.sin(h);
    out.pos.push(track.x[i] + lx * a, y, track.z[i] + lz * a, track.x[i] + lx * b, y, track.z[i] + lz * b);
    const u = (k * track.ds) / uLen;
    out.uv.push(u, 0, u, 1);
    if (k < count) {
      const v = base + k * 2;
      out.idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  }
  return out;
}

// Parede vertical a um deslocamento lateral, virada para a pista
function wall(track, offset, height, uLen) {
  const pos = [];
  const uv = [];
  const idx = [];
  const left = offset > 0;
  for (let k = 0; k <= track.n; k++) {
    const i = k % track.n;
    const h = track.heading[i];
    const px = track.x[i] + Math.cos(h) * offset;
    const pz = track.z[i] - Math.sin(h) * offset;
    pos.push(px, 0, pz, px, height, pz);
    const u = ((left ? k : -k) * track.ds) / uLen; // o texto fica legível dos dois lados
    uv.push(u, 0, u, 1);
    if (k < track.n) {
      const v = k * 2;
      if (left) idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      else idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  return toGeometry({ pos, uv, idx });
}

function toGeometry({ pos, uv, idx }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Objeto posicionado num ponto da pista (s em metros, lateral positivo = esquerda)
function placeOnTrack(track, object, s, lateral = 0, y = 0) {
  const p = sampleTrack(track, s, {});
  object.position.set(p.x + Math.cos(p.heading) * lateral, y, p.z - Math.sin(p.heading) * lateral);
  object.rotation.y = p.heading;
  return object;
}

function buildCircuit(track, tex) {
  const group = new THREE.Group();
  const loopU = (len) => track.length / Math.max(1, Math.round(track.length / len)); // repetição sem emenda
  const decal = (params) => new THREE.MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, ...params });

  const road = new THREE.Mesh(toGeometry(ribbon(track, 0, track.n, -ROAD / 2, ROAD / 2, 0, loopU(14))), new THREE.MeshLambertMaterial({ map: tex.asphalt }));
  const aprons = ribbon(track, 0, track.n, ROAD / 2 + 0.9, ROAD / 2 + 8.5, -0.01, loopU(14));
  ribbon(track, 0, track.n, -ROAD / 2 - 8.5, -ROAD / 2 - 0.9, -0.01, loopU(14), aprons);
  const apron = new THREE.Mesh(toGeometry(aprons), new THREE.MeshLambertMaterial({ map: tex.asphalt, color: 0x77777f }));

  const lines = ribbon(track, 0, track.n, ROAD / 2 - 0.5, ROAD / 2 - 0.25, 0.005, 10);
  ribbon(track, 0, track.n, -ROAD / 2 + 0.25, -ROAD / 2 + 0.5, 0.005, 10, lines);
  const edge = new THREE.Mesh(toGeometry(lines), decal({ color: 0xeeeeee, emissive: 0x222222 }));

  // Zebras só onde a pista faz curva de verdade
  const kerbs = { pos: [], uv: [], idx: [] };
  const tight = (i) => Math.abs(track.curv[(i + track.n) % track.n]) > 1 / 110;
  for (let i = 0; i < track.n; i++) {
    if (!tight(i) || tight(i - 1)) continue;
    let end = i;
    while (tight(end + 1) && end - i < track.n) end++;
    const from = (i - 10 + track.n) % track.n;
    const count = end - i + 20;
    ribbon(track, from, count, ROAD / 2 - 0.3, ROAD / 2 + 1.1, 0.012, 1.8, kerbs);
    ribbon(track, from, count, -ROAD / 2 - 1.1, -ROAD / 2 + 0.3, 0.012, 1.8, kerbs);
  }
  const kerb = new THREE.Mesh(toGeometry(kerbs), decal({ map: tex.kerb }));

  const ledMaterial = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex.ads, emissiveIntensity: 0.85 });
  const barriers = [wall(track, ROAD / 2 + 8.5, 1.1, loopU(26.4)), wall(track, -ROAD / 2 - 8.5, 1.1, loopU(26.4))]
    .map((g) => new THREE.Mesh(g, ledMaterial));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), new THREE.MeshLambertMaterial({ map: tex.grass, color: 0x9aa59a }));
  tex.grass.repeat.set(500, 500);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-110, -0.06, 15);

  group.add(road, apron, edge, kerb, ground, ...barriers);

  // Linha de largada quadriculada e as marcações dos dois boxes no grid (SF-26 à esquerda, Mini à direita)
  const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, 1.2), decal({ map: tex.checker }));
  line.geometry.rotateX(-Math.PI / 2);
  group.add(placeOnTrack(track, line, START_LINE, 0, 0.008));
  const paint = decal({ color: 0x9a9aa0 });
  for (const [s0, lane, front] of [[0, LANE, 2.75], [MINI_GRID, -LANE, 2.15]]) {
    for (const [ds, lateral, w, l] of [[front, 0, 2.4, 0.14], [front - 0.55, 1.13, 0.12, 1.2], [front - 0.55, -1.13, 0.12, 1.2]]) {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(w, l), paint);
      mark.geometry.rotateX(-Math.PI / 2);
      group.add(placeOnTrack(track, mark, s0 + ds, lane + lateral, 0.008));
    }
  }

  // Postes de luz (instanciados) com o brilho das lâmpadas em pontos
  const posts = [];
  for (let s = 23, side = 1; s < track.length - 10; s += 46, side = -side) posts.push([s, side]);
  const postMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 9, 6).translate(0, 4.5, 0), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }), posts.length);
  const headMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.28, 2.2), new THREE.MeshBasicMaterial({ color: 0xfff3dc }), posts.length);
  const glowPositions = [];
  const holder = new THREE.Object3D();
  posts.forEach(([s, side], i) => {
    placeOnTrack(track, holder, s, side * (ROAD / 2 + 11.5));
    holder.updateMatrix();
    postMesh.setMatrixAt(i, holder.matrix);
    placeOnTrack(track, holder, s, side * (ROAD / 2 + 10.4), 9);
    holder.rotation.y += Math.PI / 2;
    holder.updateMatrix();
    headMesh.setMatrixAt(i, holder.matrix);
    glowPositions.push(holder.position.x, 8.7, holder.position.z);
  });
  const glows = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(glowPositions, 3)),
    new THREE.PointsMaterial({ map: tex.glow, color: 0xffe9c4, size: 9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  group.add(postMesh, headMesh, glows);

  // Arquibancada ao lado da reta principal
  const stand = placeOnTrack(track, new THREE.Group(), 40, -(ROAD / 2 + 22));
  const crowdGeo = new THREE.BufferGeometry();
  crowdGeo.setAttribute('position', new THREE.Float32BufferAttribute([6, 0.8, -80, 6, 0.8, 80, -6, 10.5, 80, -6, 10.5, -80], 3));
  crowdGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 12, 0, 12, 1, 0, 1], 2));
  crowdGeo.setIndex([0, 1, 2, 0, 2, 3]);
  crowdGeo.computeVertexNormals();
  const dark = new THREE.MeshLambertMaterial({ color: 0x15151a });
  stand.add(
    new THREE.Mesh(crowdGeo, new THREE.MeshLambertMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex.crowd, emissiveIntensity: 0.55, side: THREE.DoubleSide })),
    new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 164), dark).translateX(-1).translateY(13.6),
    new THREE.Mesh(new THREE.BoxGeometry(0.6, 13.6, 164), dark).translateX(-7).translateY(6.8),
  );
  group.add(stand);

  // Pórtico das luzes de largada, virado para o grid
  const gantry = placeOnTrack(track, new THREE.Group(), GANTRY_AT);
  const steel = new THREE.MeshLambertMaterial({ color: 0x1b1b20 });
  for (const side of [-1, 1]) gantry.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.8, 0.6), steel).translateX(side * (ROAD / 2 + 1.6)).translateY(3.9));
  gantry.add(new THREE.Mesh(new THREE.BoxGeometry(ROAD + 4, 0.8, 0.7), steel).translateY(7.4));
  const bannerMesh = new THREE.Mesh(new THREE.PlaneGeometry(ROAD + 3.6, 0.7), new THREE.MeshBasicMaterial({ map: tex.banner }));
  bannerMesh.rotation.y = Math.PI;
  bannerMesh.position.set(0, 7.4, -0.36);
  gantry.add(bannerMesh, new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 0.5), steel).translateY(6.4));
  const lamps = [];
  for (let i = 0; i < 5; i++) {
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshBasicMaterial({ color: 0x2a0606 }));
    lamp.rotation.y = Math.PI;
    lamp.position.set((2 - i) * 0.62, 6.4, -0.26); // acendem da esquerda para a direita, vistas do grid
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: 0xff2a1a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(2.4);
    halo.position.copy(lamp.position).setZ(-0.4);
    gantry.add(lamp, halo);
    lamps.push({ lamp, halo });
  }
  group.add(gantry);

  return { group, lamps, glowMaterial: glows.material, ledMaterial, crowdMaterial: stand.children[0].material };
}

// Céu: degradê com o brilho da cidade no horizonte (some no estúdio)
function buildSky() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uMix: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uMix;
        varying vec3 vDir;
        void main() {
          float y = normalize(vDir).y;
          vec3 top = vec3(0.012, 0.016, 0.035);
          vec3 horizon = vec3(0.05, 0.045, 0.07);
          vec3 color = mix(horizon, top, smoothstep(-0.02, 0.4, y));
          color += vec3(0.16, 0.06, 0.035) * exp(-abs(y) * 22.0);
          gl_FragColor = vec4(color * uMix, 1.0);
        }`,
    }),
  );
}

/* ---------- Sombra de contato: desenhada uma vez, olhando o carro de baixo para cima ---------- */
// width x length (m) é a área do chão coberta, centrada em centerZ (no sentido do comprimento do carro)
function bakeContactShadow(renderer, model, { width: W, length: L, centerZ }) {
  const H = 0.9;
  const size = [192, 384];
  const targets = [0, 1].map(() => new THREE.WebGLRenderTarget(size[0], size[1]));
  const camera = new THREE.OrthographicCamera(-W / 2, W / 2, L / 2, -L / 2, 0, H + 0.02);
  camera.position.set(0, -0.02, centerZ); // um pouco abaixo do chão para não cortar os pneus
  camera.rotation.x = Math.PI / 2; // olha para cima; o "alto" da imagem é a frente do carro
  camera.updateMatrixWorld();

  const parent = model.parent;
  const scene = new THREE.Scene();
  scene.add(model);
  scene.overrideMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uH: { value: H } },
    vertexShader: 'varying float vH; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vH = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uH; varying float vH; void main() { float a = 1.0 - clamp(vH / uH, 0.0, 1.0); gl_FragColor = vec4(0.0, 0.0, 0.0, a * a); }',
  });
  const clearColor = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(targets[0]);
  renderer.clear();
  renderer.render(scene, camera);
  parent.add(model);

  // Desfoque gaussiano em duas direções, três vezes
  const blur = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv;
      void main() {
        vec4 s = texture2D(tMap, vUv) * 0.227027;
        s += (texture2D(tMap, vUv + uDir * 1.384615) + texture2D(tMap, vUv - uDir * 1.384615)) * 0.316216;
        s += (texture2D(tMap, vUv + uDir * 3.230769) + texture2D(tMap, vUv - uDir * 3.230769)) * 0.070270;
        gl_FragColor = s;
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blur);
  const quadScene = new THREE.Scene().add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  for (let i = 1; i <= 3; i++) {
    blur.uniforms.tMap.value = targets[0].texture;
    blur.uniforms.uDir.value.set(i / size[0], 0);
    renderer.setRenderTarget(targets[1]);
    renderer.render(quadScene, quadCamera);
    blur.uniforms.tMap.value = targets[1].texture;
    blur.uniforms.uDir.value.set(0, i / size[1]);
    renderer.setRenderTarget(targets[0]);
    renderer.render(quadScene, quadCamera);
  }
  renderer.setRenderTarget(null);
  renderer.setClearColor(clearColor, clearAlpha);
  targets[1].dispose();
  blur.dispose();
  quad.geometry.dispose();
  scene.overrideMaterial.dispose();

  const geometry = new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const shadow = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    map: targets[0].texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
  }));
  shadow.position.set(0, 0.015, centerZ);
  shadow.renderOrder = 1;
  return shadow;
}

/* =========================================================
   Montagem da seção
   ========================================================= */
const section = document.querySelector('.rocket');
const stage = section && section.querySelector('.rk-stage');
if (stage) boot();

function boot() {
  const status = stage.querySelector('.rk-loader-status');
  const loadButton = stage.querySelector('.rk-load');
  const loaderLights = [...stage.querySelectorAll('.rk-loader .lights i')];

  if (location.protocol === 'file:') return; // o js/main.js já explica o que fazer
  if (!supportsWebGL2()) {
    status.textContent = 'Este navegador não consegue mostrar o 3D (WebGL 2).';
    return;
  }

  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    loadButton.hidden = true;
    run({ status, loaderLights });
  };

  if (navigator.connection && navigator.connection.saveData) {
    status.textContent = `Economia de dados ativada: os carros em 3D têm ${MODEL_SIZE}.`;
    loadButton.textContent = `Carregar o 3D (${MODEL_SIZE})`;
    loadButton.hidden = false;
    loadButton.addEventListener('click', begin);
    return;
  }
  if (location.hash === '#rocket' || location.hash === '#rocket-equipe') begin();
  else {
    // Começa a baixar quando a seção está a até duas telas de distância
    const near = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      near.disconnect();
      begin();
    }, { rootMargin: '0px 0px 200% 0px' });
    near.observe(section);
  }
}

function run({ status, loaderLights }) {
  const canvas = stage.querySelector('.rk-canvas');
  const scrolly = section.querySelector('.rk-scrolly');
  const chapters = [...section.querySelectorAll('.rk-chapter')];
  const fade = stage.querySelector('.rk-fade');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- Renderizador, cena e luzes ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  let pixelRatio = maxPixelRatio;
  renderer.setPixelRatio(pixelRatio);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = ESTUDIO.clone();
  scene.fog = new THREE.Fog(ESTUDIO.clone(), 7, 34);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.25, 2600);

  // Reflexos do carro: um estúdio neutro gerado na hora (só o carro usa; a pista fica no escuro)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0x8fa6d6, 0x0c0a08, 0.3);
  const flood = new THREE.DirectionalLight(0xfff4e6, 0.3);
  flood.position.set(-0.45, 1, 0.3);
  const rim = new THREE.DirectionalLight(0xa9c2ff, 1.6);
  rim.position.set(0.2, 0.5, -1);
  const key = new THREE.SpotLight(0xffffff, 0, 0, 0.42, 0.85, 2);
  scene.add(hemi, flood, rim, key, key.target);

  const sky = buildSky();
  scene.add(sky);

  const track = buildTrack();
  const textures = makeTextures(anisotropy);
  const circuit = buildCircuit(track, textures);
  scene.add(circuit.group);

  // O spot de "estúdio" fica parado em cima do box da SF-26
  const grid = carPose(track, 0, LANE, {});
  placeOnTrack(track, key, 0, LANE - 3.5, 10);
  placeOnTrack(track, key.target, 0.6, LANE, 0.4);

  /* ---------- Carro: trilho na pista → giros do "estúdio" → modelo ---------- */
  const carFrame = new THREE.Group();   // posição e direção na pista
  const studio = new THREE.Group();     // giros e subida em volta do centro do carro
  studio.rotation.order = 'YXZ';
  const offset = new THREE.Group();
  offset.position.copy(PIVOT).negate();
  const camMarker = new THREE.Object3D();
  camMarker.position.copy(CAM_SPOT);
  offset.add(camMarker);
  studio.add(offset);
  carFrame.add(studio);
  scene.add(carFrame);

  let body = null;
  let wheels = [];
  let wheelRadius = 0.36;
  let wheelbase = 3.53;
  let shadow = null;
  const carMaterials = [];

  /* ---------- Mini Cooper: trilho na pista → inclinação da carroceria → modelo ---------- */
  // A câmera dele (ESP32-CAM no teto) vai presa na carroceria e aparece num quadro menor na "visão da câmera"
  const mini = {
    frame: new THREE.Group(),
    tilt: new THREE.Group(),
    holder: new THREE.Group(),
    cam: new THREE.PerspectiveCamera(58, 1.6, 0.04, 2600),
    wheels: [],
    radius: 0.31,
    wheelbase: 2.5,
    s: MINI_GRID + MINI_IN(0),
    v: 0,
    accel: 0,
    spin: 0,
    steer: 0,
    pitch: 0,
    roll: 0,
    pose: {},
    ready: false,
  };
  mini.tilt.rotation.order = 'YXZ';
  mini.tilt.position.y = 0.45; // gira em volta de um ponto na altura do meio do carro
  mini.holder.position.y = -0.45;
  mini.cam.rotation.order = 'YXZ';
  mini.cam.rotation.set(-6 * DEG, Math.PI, 0); // olha para a frente do carro, um pouco para baixo
  mini.tilt.add(mini.holder, mini.cam);
  mini.frame.add(mini.tilt);
  mini.frame.visible = false;
  scene.add(mini.frame);

  /* ---------- HUD ---------- */
  const hud = {};
  stage.querySelectorAll('[data-hud]').forEach((el) => { hud[el.dataset.hud] = el; });
  const panels = {};
  stage.querySelectorAll('[data-panel]').forEach((el) => { panels[el.dataset.panel] = el; });
  const hudLights = [...panels.lights.querySelectorAll('i')];
  const flash = stage.querySelector('.rk-flash');
  const gizmo = {
    x: stage.querySelector('.rk-gizmo line[data-axis="x"]'),
    y: stage.querySelector('.rk-gizmo line[data-axis="y"]'),
    z: stage.querySelector('.rk-gizmo line[data-axis="z"]'),
    tx: stage.querySelector('.rk-gizmo text[data-label="x"]'),
    ty: stage.querySelector('.rk-gizmo text[data-label="y"]'),
    tz: stage.querySelector('.rk-gizmo text[data-label="z"]'),
  };
  const mapCar = stage.querySelector('.rk-map-car');
  const mapRival = stage.querySelector('.rk-map-rival');
  const toMap = buildMinimap(track, stage.querySelector('.rk-map-track'), stage.querySelector('.rk-map-start'));
  const written = new Map();
  const write = (el, value) => {
    if (written.get(el) === value) return;
    written.set(el, value);
    el.textContent = value;
  };
  const panelOn = (name, on) => panels[name].classList.toggle('is-on', on);

  /* ---------- Estado ---------- */
  const freshRace = () => ({ phase: 'grid', s: 0, v: 0, accel: 0, time: 0, seq: 0, goAt: 0, goTime: -9, lights: 0, lap: 1, lapStart: 0 });
  let race = freshRace();
  let ready = false;
  let inView = false;
  let raf = 0;
  let last = 0;
  let t = 0;
  let anchors = [];
  let mobile = false;
  let aspect = 1;
  let spin = 0;
  let steer = 0;
  let dynPitch = 0;
  let dynRoll = 0;
  let camHeading = grid.heading;
  let cutting = false;
  let shownLights = -1;
  let lastMix = -1;
  const view = { w: 1, h: 1 };
  const pip = { x: 0, y: 0, w: 0, h: 0, on: false }; // quadro da câmera do Mini, em px a partir do canto de baixo
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const here = {};
  const shot = [];
  const v3 = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const camInverse = new THREE.Quaternion();
  const axisVectors = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };

  /* ---------- Rolagem → t ---------- */
  const measure = () => {
    const y = window.scrollY;
    anchors = chapters.map((el) => {
      const box = el.getBoundingClientRect();
      return box.top + y + box.height / 2;
    });
  };
  const scrollT = () => {
    const y = window.scrollY + window.innerHeight / 2;
    if (y <= anchors[0]) return 0;
    for (let i = 1; i < anchors.length; i++) {
      if (y <= anchors[i]) return i - 1 + (y - anchors[i - 1]) / (anchors[i] - anchors[i - 1]);
    }
    return anchors.length - 1;
  };

  /* ---------- Corrida ---------- */
  const startLights = () => {
    race.phase = 'lights';
    race.seq = 0;
    race.goAt = 5 * LIGHT_STEP + 0.4 + Math.random() * 0.8; // como na F1: um tempinho imprevisível com as cinco acesas
  };
  const go = (withFlash) => {
    race.phase = 'race';
    race.lights = 0;
    race.goTime = race.time;
    race.lapStart = race.time;
    if (!withFlash) return;
    flash.classList.remove('is-on');
    void flash.offsetWidth; // reinicia a animação do "Luzes apagadas!"
    flash.classList.add('is-on');
  };
  const backToGrid = () => {
    const reset = () => {
      race = freshRace();
      steer = 0;
      camHeading = grid.heading;
    };
    if (race.phase !== 'race' || race.s < 20) return reset();
    if (cutting) return;
    cutting = true;
    fade.classList.add('is-on'); // corte rápido para o carro "voltar" ao grid sem atravessar o circuito
    setTimeout(() => {
      reset();
      cutting = false;
      fade.classList.remove('is-on');
      wake();
    }, 240);
  };
  const stepRace = (dt) => {
    if (race.phase === 'grid') return;
    race.time += dt;
    if (race.phase === 'lights') {
      race.seq += dt;
      race.lights = Math.min(5, Math.floor(race.seq / LIGHT_STEP) + 1);
      if (race.seq >= race.goAt) go(t < 4.7);
      return;
    }
    const target = sampleTrack(track, race.s, here).speed;
    const before = race.v;
    race.v = Math.min(target, race.v + A_ACC * 1.15 * dt);
    race.accel = damp(race.accel, (race.v - before) / Math.max(dt, 1e-3), 6, dt);
    race.s += race.v * dt;
    if (race.s >= track.length) {
      race.s -= track.length;
      race.lap += 1;
      race.lapStart = race.time;
    }
  };

  /* ---------- Mini Cooper: chega ao grid com a pista e, na corrida, disputa posição com a SF-26 ---------- */
  const updateMini = (dt) => {
    if (!mini.ready) return;
    mini.frame.visible = t > 3.1;
    const racing = race.phase === 'race';
    const d = (race.lap - 1) * track.length + race.s; // quanto a SF-26 já andou desde a largada
    const wave = (2 * Math.PI) / DUEL_WAVE;
    const s = racing ? MINI_GRID + d + DUEL_GAP * Math.sin(d * wave) : MINI_GRID + MINI_IN(t);
    const v = racing ? race.v * (1 + DUEL_GAP * wave * Math.cos(d * wave)) : 0;
    const moved = s - mini.s;
    mini.s = s;
    if (Math.abs(moved) < 30) mini.spin = (mini.spin + moved / mini.radius) % (Math.PI * 2); // sem girar no corte de volta ao grid
    mini.accel = damp(mini.accel, (v - mini.v) / Math.max(dt, 1e-3), 6, dt);
    mini.v = v;
    const pose = carPose(track, s, -LANE, mini.pose);
    mini.frame.position.set(pose.x, 0, pose.z);
    mini.frame.rotation.y = pose.heading;
    // Carroceria mais mole que a da F1: abaixa a frente na freada e inclina mais nas curvas
    mini.pitch = damp(mini.pitch, racing ? clamp(-mini.accel * 0.0016, -0.02, 0.02) : 0, 5, dt);
    mini.roll = damp(mini.roll, racing ? clamp(v * v * pose.curv * 0.0011, -0.035, 0.035) : 0, 5, dt);
    mini.tilt.rotation.set(mini.pitch, 0, mini.roll);
    mini.steer = damp(mini.steer, racing ? clamp(Math.atan(mini.wheelbase * pose.curv), -0.4, 0.4) : 0, 8, dt);
    for (const wheel of mini.wheels) {
      wheel.rotation.x = mini.spin;
      wheel.rotation.y = wheel.userData.front ? mini.steer : 0;
    }
  };

  /* ---------- Um quadro ---------- */
  const update = (dt) => {
    const goal = scrollT();
    t = Math.abs(goal - t) < 1e-4 ? goal : damp(t, goal, reduceMotion ? 14 : 6.5, dt);
    const mix = TRACK_MIX(t);
    const pov = POV(t);

    if (t < RESET_BELOW && race.phase !== 'grid') backToGrid();
    if (t >= LIGHTS_AT && race.phase === 'grid') startLights();
    if (goal > 4.6 && race.phase === 'lights') go(false); // quem pulou direto para o fim vê o carro já correndo
    stepRace(dt);

    // SF-26 na pista (na faixa da esquerda)
    carPose(track, race.s, LANE, here);
    carFrame.position.set(here.x, 0, here.z);
    carFrame.rotation.y = here.heading;
    const racing = race.phase === 'race';
    const lateral = race.v * race.v * here.curv;
    dynPitch = damp(dynPitch, racing ? clamp(-race.accel * 0.0011, -0.014, 0.014) : 0, 5, dt);
    dynRoll = damp(dynRoll, racing ? clamp(lateral * 0.0007, -0.022, 0.022) : 0, 5, dt);
    steer = damp(steer, racing ? clamp(Math.atan(wheelbase * here.curv), -0.32, 0.32) : 0, 8, dt);
    spin = (spin + (race.v * dt) / wheelRadius) % (Math.PI * 2);

    const lift = LIFT(t);
    const explode = EXPLODE(t);
    studio.position.set(PIVOT.x, PIVOT.y + lift, PIVOT.z);
    studio.rotation.set(PITCH(t) * DEG + dynPitch * (1 - pov), YAW(t) * DEG, ROLL(t) * DEG + dynRoll * (1 - pov));
    if (body) body.position.y = explode * 0.32;
    for (const wheel of wheels) {
      const base = wheel.userData.base;
      wheel.position.set(base.x * (1 + explode * 0.75), base.y, base.z + Math.sign(base.z) * explode * 0.55);
      wheel.rotation.x = spin;
      wheel.rotation.y = wheel.userData.front ? steer : 0;
    }
    if (shadow) shadow.material.opacity = (1 - clamp(lift / 0.85, 0, 1) * 0.8) * (1 - explode * 0.55);
    updateMini(dt);

    // Câmera
    sampleShot(t, shot);
    const [az0, el0, dist0, tx, ty, tz, fov0, shiftPc, shiftPhone] = shot;
    pointer.x = damp(pointer.x, pointer.tx, 3, dt);
    pointer.y = damp(pointer.y, pointer.ty, 3, dt);
    const az = (az0 + pointer.x * 4 * (1 - pov)) * DEG;
    const el = (el0 + pointer.y * 2.5 * (1 - pov)) * DEG;
    const fit = clamp(1.6 / aspect, 1, 3.2); // tela em pé: afasta a câmera nos planos de lado
    const side = Math.sin(az) ** 2;
    const dist = dist0 * lerp(1, fit ** 0.62, side * (1 - pov));
    camHeading = dampAngle(camHeading, here.heading, lerp(3.2, 60, pov), dt);
    // Na pista, a câmera mira entre os dois carros (o Mini anda até 8 m à frente ou atrás da SF-26)
    const gap = mini.ready ? clamp(mini.s - ((race.lap - 1) * track.length + race.s), -10, 10) : 0;
    camTarget.set(tx, ty, tz + gap * 0.5 * mix * (1 - pov));
    camPos.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(dist).add(camTarget);
    camPos.applyAxisAngle(up, camHeading);
    camTarget.applyAxisAngle(up, camHeading);
    camPos.x += here.x;
    camPos.z += here.z;
    camTarget.x += here.x;
    camTarget.z += here.z;
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    const speed01 = race.v / V_MAX;
    if (!reduceMotion && racing) {
      const shake = speed01 * speed01 * lerp(0.0012, 0.0035, pov);
      camera.rotateX(Math.sin(race.time * 47) * shake);
      camera.rotateZ(Math.sin(race.time * 31 + 1.3) * shake);
    }
    camera.fov = Math.min(76, fov0 * fit ** 0.32) + (reduceMotion ? 0 : speed01 * 5 * mix);
    camera.near = lerp(0.25, 0.04, pov);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    // Desloca a imagem (sem mudar a perspectiva) para o carro não ficar atrás do texto
    camera.projectionMatrix.elements[8] = mobile ? 0 : -shiftPc;
    camera.projectionMatrix.elements[9] = mobile ? -shiftPhone : 0;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    sky.position.copy(camera.position);
    // A neblina começa logo depois do carro, onde quer que a câmera esteja (no celular ela fica mais longe)
    const carDistance = Math.hypot(camPos.x - here.x, camPos.y - (PIVOT.y + lift), camPos.z - here.z);
    scene.fog.near = carDistance + lerp(2, 50, mix);
    scene.fog.far = carDistance + lerp(26, 640, mix);

    // Estúdio escuro → pista à noite
    if (Math.abs(mix - lastMix) > 1e-4) {
      lastMix = mix;
      scene.background.copy(ESTUDIO).lerp(NOITE, mix);
      scene.fog.color.copy(scene.background);
      sky.material.uniforms.uMix.value = mix;
      hemi.intensity = lerp(0.3, 1.15, mix);
      flood.intensity = lerp(0.3, 2.4, mix);
      rim.intensity = lerp(1.6, 0.45, mix);
      key.intensity = lerp(420, 0, mix);
      circuit.glowMaterial.opacity = mix;
      circuit.ledMaterial.emissiveIntensity = lerp(0.03, 0.85, mix); // no estúdio, a pista fica apagada
      circuit.crowdMaterial.emissiveIntensity = lerp(0.05, 0.55, mix);
      for (const m of carMaterials) m.envMapIntensity = lerp(1, 0.8, mix);
    }
    if (race.lights !== shownLights) {
      shownLights = race.lights;
      circuit.lamps.forEach(({ lamp, halo }, i) => {
        lamp.material.color.setHex(i < race.lights ? 0xff2a18 : 0x2a0606);
        halo.material.opacity = i < race.lights ? 1 : 0;
      });
      hudLights.forEach((light, i) => light.classList.toggle('on', i < race.lights));
    }

    updateHud(pov);

    return Math.abs(goal - t) > 1e-4 || race.phase !== 'grid' || cutting
      || Math.abs(pointer.x - pointer.tx) > 1e-3 || Math.abs(pointer.y - pointer.ty) > 1e-3
      || Math.abs(wrapAngle(here.heading - camHeading)) > 1e-4;
  };

  let shade = '';
  const updateHud = (pov) => {
    write(hud.chapter, String(Math.min(chapters.length - 1, Math.round(t))).padStart(2, '0'));
    const nextShade = (1 - pov * 0.85).toFixed(2);
    if (nextShade !== shade) stage.style.setProperty('--shade', (shade = nextShade));

    const axesOn = t > 1.3 && t < 2.7;
    panelOn('axes', axesOn);
    if (axesOn) {
      studio.getWorldQuaternion(quat);
      camInverse.copy(camera.quaternion).invert();
      for (const axis of ['x', 'y', 'z']) {
        const v = axisVectors[axis].set(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0).applyQuaternion(quat).applyQuaternion(camInverse);
        gizmo[axis].setAttribute('x2', (v.x * 40).toFixed(1));
        gizmo[axis].setAttribute('y2', (-v.y * 40).toFixed(1));
        gizmo[axis].style.opacity = (0.45 + 0.55 * (0.5 + 0.5 * v.z)).toFixed(2);
        gizmo[`t${axis}`].setAttribute('x', (v.x * 51).toFixed(1));
        gizmo[`t${axis}`].setAttribute('y', (-v.y * 51).toFixed(1));
      }
      write(hud.rx, `${fmt(PITCH(t))}°`);
      write(hud.ry, `${fmt(YAW(t) % 360)}°`);
      write(hud.rz, `${fmt(ROLL(t))}°`);
      write(hud.lift, `${fmt(LIFT(t), 2)} m`);
      write(hud.explode, `${Math.round(EXPLODE(t) * 60)} cm`);
    }

    let spotOn = t > 2.72 && t < 3.3;
    if (spotOn) {
      camMarker.getWorldPosition(v3).project(camera);
      spotOn = v3.z < 1 && Math.abs(v3.x) < 0.95 && Math.abs(v3.y) < 0.95;
      if (spotOn) {
        const x = (v3.x * 0.5 + 0.5) * stage.clientWidth;
        const y = (0.5 - v3.y * 0.5) * stage.clientHeight;
        panels.hotspot.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        panels.hotspot.classList.toggle('is-flipped', x > stage.clientWidth - 240); // rótulo para a esquerda perto da borda
      }
    }
    panelOn('hotspot', spotOn);

    // No grid o pórtico 3D já aparece; as luzes do HUD só entram quando a câmera sai de trás do carro
    panelOn('lights', t > 3.85 && t < 4.7 && (race.phase === 'lights' || (race.phase === 'race' && race.time - race.goTime < 0.9)));
    const raceOn = t > 3.55 && race.phase === 'race';
    panelOn('race', raceOn);
    if (raceOn) {
      const kmh = race.v * 3.6;
      write(hud.speed, String(Math.round(kmh)));
      let gear = 1;
      while (gear < 8 && race.v > GEARS[gear]) gear++;
      write(hud.gear, race.v < 0.5 ? 'N' : String(gear));
      const rpm = race.v < 0.5 ? 0.12 : 0.35 + 0.65 * clamp((race.v - GEARS[gear - 1]) / (GEARS[gear] - GEARS[gear - 1]), 0, 1);
      hud.rpm.style.setProperty('--rpm', rpm.toFixed(3));
      write(hud.lap, String(race.lap));
      const lapTime = race.phase === 'race' ? race.time - race.lapStart : 0;
      write(hud.laptime, `${Math.floor(lapTime / 60)}:${(lapTime % 60).toFixed(3).padStart(6, '0')}`);
      const [mx, my] = toMap(here.x, here.z);
      mapCar.setAttribute('cx', mx.toFixed(1));
      mapCar.setAttribute('cy', my.toFixed(1));
      if (mini.ready) {
        const [rx, ry] = toMap(mini.pose.x, mini.pose.z);
        mapRival.setAttribute('cx', rx.toFixed(1));
        mapRival.setAttribute('cy', ry.toFixed(1));
      }
    }

    const camOn = pov > 0.6;
    panelOn('cam', camOn);
    if (camOn) write(hud.clock, new Date().toLocaleTimeString('pt-BR', { hour12: false }));
    // A câmera do Mini entra num quadro menor quando a da SF-26 já está no lugar
    pip.on = pov > 0.97 && mini.ready && mini.frame.visible;
    panelOn('pip', pip.on);
  };

  /* ---------- Laço de desenho sob demanda ---------- */
  let slowSum = 0;
  let slowCount = 0;
  const tick = (now) => {
    raf = 0;
    const gap = now - last;
    last = now;
    const dt = gap > 100 ? 1 / 60 : gap / 1000;
    const busy = update(dt);
    renderer.render(scene, camera);
    if (pip.on && pip.w > 0) {
      // Segunda imagem: a câmera do Mini, desenhada só dentro do quadro do canto
      renderer.setScissorTest(true);
      renderer.setScissor(pip.x, pip.y, pip.w, pip.h);
      renderer.setViewport(pip.x, pip.y, pip.w, pip.h);
      renderer.render(scene, mini.cam);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, view.w, view.h);
    }
    if (busy) {
      // Resolução adaptativa: se a máquina não aguenta ~45 fps, desenha com menos pixels
      if (gap < 100) {
        slowSum += gap;
        slowCount++;
      }
      if (slowCount >= 45) {
        const average = slowSum / slowCount;
        slowSum = slowCount = 0;
        if (average > 23 && pixelRatio > 0.7) pixelRatio = Math.max(0.7, pixelRatio * 0.85);
        else if (average < 12 && pixelRatio < maxPixelRatio) pixelRatio = Math.min(maxPixelRatio, pixelRatio * 1.1);
        else return wake();
        renderer.setPixelRatio(pixelRatio);
      }
      wake();
    }
  };
  function wake() {
    if (!raf && ready && inView) raf = requestAnimationFrame(tick);
  }

  const resize = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    view.w = w;
    view.h = h;
    aspect = w / h;
    mobile = w < 760;
    // O quadro da câmera do Mini é posicionado pelo CSS; a imagem 3D é desenhada exatamente dentro dele
    const box = panels.pip;
    pip.w = box.clientWidth;
    pip.h = box.clientHeight;
    pip.x = box.offsetLeft + box.clientLeft;
    pip.y = h - (box.offsetTop + box.clientTop) - pip.h;
    if (pip.h) {
      mini.cam.aspect = pip.w / pip.h;
      mini.cam.updateProjectionMatrix();
    }
    measure();
    wake();
  };
  new ResizeObserver(resize).observe(stage);
  new ResizeObserver(() => { measure(); wake(); }).observe(section.querySelector('.rk-chapters'));
  resize();

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) wake();
    else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }).observe(scrolly);
  addEventListener('scroll', wake, { passive: true });
  if (finePointer && !reduceMotion) {
    addEventListener('pointermove', (event) => {
      if (!inView) return;
      pointer.tx = (event.clientX / innerWidth) * 2 - 1;
      pointer.ty = (event.clientY / innerHeight) * 2 - 1;
      wake();
    }, { passive: true });
  }
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stage.classList.remove('is-ready');
    status.textContent = 'O 3D foi pausado pelo navegador. Ele volta sozinho.';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    stage.classList.add('is-ready');
    wake();
  });

  /* ---------- Download dos modelos: as luzes acendem conforme o progresso da SF-26 ---------- */
  const setLights = (count) => loaderLights.forEach((light, i) => light.classList.toggle('on', i < count));
  const findWheels = (model) => ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((name) => model.getObjectByName(name)).filter(Boolean)
    .map((wheel) => {
      wheel.rotation.order = 'YXZ';
      wheel.userData.base = wheel.position.clone();
      wheel.userData.front = wheel.position.z > 0;
      return wheel;
    });
  // Reflexos do estúdio nos dois carros; a pintura ganha verniz
  const prepareMaterials = (model, paint) => {
    model.traverse((object) => {
      if (!object.isMesh || carMaterials.includes(object.material)) return;
      const material = object.material;
      carMaterials.push(material);
      material.envMap = envMap;
      if (material.map) material.map.anisotropy = anisotropy;
      if (material.name === paint) {
        material.clearcoat = 1;
        material.clearcoatRoughness = 0.06;
      }
      material.needsUpdate = true;
    });
    lastMix = -1; // reaplica a intensidade dos reflexos (estúdio ou pista) no próximo quadro
  };

  // O Mini só aparece quando a pista surge: é baixado depois, com a SF-26 já na tela
  const loadMini = () => {
    new GLTFLoader().load(MINI_URL, async (gltf) => {
      const model = gltf.scene;
      const root = model.getObjectByName('mini');
      const info = (root && root.userData) || {};
      if (info.wheelRadius) mini.radius = info.wheelRadius;
      if (info.wheelbase) mini.wheelbase = info.wheelbase;
      // ESP32-CAM no teto, na beirada da frente
      mini.cam.position.set(0, (info.roofTop || 1.43) + 0.09 - mini.tilt.position.y, (info.roofFront || 0.5) - 0.12);
      mini.wheels = findWheels(model);
      prepareMaterials(model, 'COOPER');
      mini.holder.add(model);
      mini.frame.add(bakeContactShadow(renderer, model, { width: 2.8, length: 5.2, centerZ: 0.06 }));
      mapRival.setAttribute('r', '4');
      mini.ready = true;
      update(0);
      mini.frame.visible = true; // compila os materiais agora, para não engasgar quando ele aparecer
      try {
        await renderer.compileAsync(scene, camera);
      } catch { /* compila no primeiro quadro */ }
      mini.frame.visible = t > 3.1;
      wake();
    }, undefined, () => { /* sem o Mini, a corrida segue só com a SF-26 */ });
  };

  status.textContent = 'Aquecendo os pneus… 0%';
  new GLTFLoader().load(MODEL_URL, async (gltf) => {
    const model = gltf.scene;
    offset.add(model);
    const root = model.getObjectByName('sf26');
    if (root && root.userData.wheelRadius) wheelRadius = root.userData.wheelRadius;
    if (root && root.userData.wheelbase) wheelbase = root.userData.wheelbase;
    body = model.getObjectByName('body');
    wheels = findWheels(model);
    prepareMaterials(model, 'sf25_paints');
    shadow = bakeContactShadow(renderer, model, { width: 3.6, length: 7.6, centerZ: PIVOT.z });
    carFrame.add(shadow);

    status.textContent = 'Luzes apagadas!';
    measure();
    t = scrollT();
    update(1 / 60);
    try {
      await renderer.compileAsync(scene, camera);
    } catch { /* sem compileAsync: compila no primeiro quadro */ }
    renderer.render(scene, camera);
    setLights(0);
    ready = true;
    stage.classList.add('is-ready');
    wake();
    loadMini();
  }, (event) => {
    if (!event.lengthComputable) return;
    const progress = event.loaded / event.total;
    setLights(Math.ceil(progress * 5));
    status.textContent = `Aquecendo os pneus… ${Math.round(progress * 100)}%`;
  }, () => {
    setLights(0);
    status.textContent = 'Não foi possível carregar o modelo 3D. Recarregue a página para tentar de novo.';
  });
}

// Mapa da pista no HUD, visto de cima com a reta principal na horizontal
function buildMinimap(track, path, start) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < track.n; i++) {
    minX = Math.min(minX, track.x[i]);
    maxX = Math.max(maxX, track.x[i]);
    minZ = Math.min(minZ, track.z[i]);
    maxZ = Math.max(maxZ, track.z[i]);
  }
  const W = 200;
  const H = 110;
  const pad = 8;
  const scale = Math.min((W - pad * 2) / (maxZ - minZ), (H - pad * 2) / (maxX - minX));
  const ox = (W - (maxZ - minZ) * scale) / 2;
  const oy = (H - (maxX - minX) * scale) / 2;
  const toMap = (x, z) => [ox + (z - minZ) * scale, oy + (maxX - x) * scale];
  let d = '';
  for (let i = 0; i < track.n; i += 6) {
    const [x, y] = toMap(track.x[i], track.z[i]);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  path.setAttribute('d', `${d}Z`);
  const [sx, sy] = toMap(track.x[0], track.z[0]);
  start.setAttribute('cx', sx.toFixed(1));
  start.setAttribute('cy', sy.toFixed(1));
  return toMap;
}
