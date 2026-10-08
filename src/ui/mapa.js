// Desenho do mapa em canvas: responsivo e nítido em telas HiDPI. / Canvas map drawing: responsive and HiDPI-sharp.
import { DELTA } from '../env.js';
import { remPx, onEscala } from './escala.js';

export const CORES = { agua: '#EAF3FB', corr: '#9CC9EC', destr: '#C9A27E', bloq: '#5B5F6B', abrigo: '#BFE3C9',
  verde: '#2E7D5B', verm: '#C0392B', navy: '#1D2369', grade: '#B8C4D6', madeira: '#8B5A2B', marrom: '#5A3A1A' };

// Desenha o barco centrado em (cx,cy) com escala k (1 = 60% da célula). / Draws the boat.
export function desenharBarco(ctx, cx, cy, u, k = 1) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(u * k, u * k);
  ctx.lineJoin = 'round';
  ctx.fillStyle = CORES.madeira; ctx.beginPath();
  ctx.moveTo(-0.32, 0.08); ctx.lineTo(0.32, 0.08); ctx.lineTo(0.2, 0.28); ctx.lineTo(-0.2, 0.28); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = CORES.marrom; ctx.lineWidth = 0.03; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0.08); ctx.lineTo(0, -0.34); ctx.stroke();
  ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = CORES.navy; ctx.lineWidth = 0.025;
  ctx.beginPath(); ctx.moveTo(0.03, -0.32); ctx.lineTo(0.03, 0.04); ctx.lineTo(0.28, 0.04); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.03, -0.2); ctx.lineTo(-0.03, 0.04); ctx.lineTo(-0.22, 0.04); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function seta(ctx, cx, cy, u, a) {
  const [di, dj] = DELTA[a], dx = dj, dy = di, L = u * 0.3, h = u * 0.13;
  const x0 = cx - dx * L, y0 = cy - dy * L, x1 = cx + dx * L, y1 = cy + dy * L;
  ctx.strokeStyle = CORES.navy; ctx.fillStyle = CORES.navy; ctx.lineWidth = Math.max(2, u * 0.05); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - dx * h * 0.6, y1 - dy * h * 0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - dx * h * 1.6 - dy * h, y1 - dy * h * 1.6 + dx * h);
  ctx.lineTo(x1 - dx * h * 1.6 + dy * h, y1 - dy * h * 1.6 - dx * h); ctx.closePath(); ctx.fill();
}

// maxRem: lado máximo em rem (25 rem = 360 px na escala padrão; os mini-mapas usam menos).
export function criarMapa(canvas, maxRem = 25) {
  let dados = null;

  function ajustar() {
    const w = Math.round(Math.max(120, Math.min(canvas.parentElement.clientWidth || 360, maxRem * remPx())));
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${w}px`; canvas.style.height = `${w}px`;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * dpr);
    return { w, dpr };
  }

  // dados: { env, s (estado exibido), pi (política ou null) }
  function desenhar(novo) {
    if (novo) dados = novo;
    if (!dados) return;
    const { env, s, pi } = dados, { w, dpr } = ajustar(), ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const u = w / env.nc, mapa = env.opts.mapa;
    const { cel: barco, sit } = env.decodifica(s);
    ctx.clearRect(0, 0, w, w); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < env.nl; i++) for (let j = 0; j < env.nc; j++) {
      const c = mapa[i][j], x = j * u, y = i * u, cx = x + u / 2, cy = y + u / 2;
      ctx.fillStyle = c === '~' ? CORES.corr : c === 'x' ? CORES.destr : c === '#' ? CORES.bloq : c === 'H' ? CORES.abrigo : CORES.agua;
      ctx.fillRect(x, y, u, u);
      ctx.strokeStyle = CORES.grade; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, u - 1, u - 1);
      if (c === '~') { ctx.fillStyle = CORES.navy; if (pi) { ctx.font = `bold ${u * 0.26}px Arial, Helvetica, sans-serif`; ctx.fillText('≈', x + u * 0.2, y + u * 0.22); } else { ctx.font = `bold ${u * 0.4}px Arial, Helvetica, sans-serif`; ctx.fillText('≈', cx, cy + u * 0.02); } }
      if (c === 'x') {
        ctx.strokeStyle = CORES.marrom; ctx.lineWidth = Math.max(2, u * 0.06); ctx.lineCap = 'round'; const r = pi ? u * 0.08 : u * 0.2, qx = pi ? x + u * 0.2 : cx, qy = pi ? y + u * 0.22 : cy;
        ctx.beginPath(); ctx.moveTo(qx - r, qy - r); ctx.lineTo(qx + r, qy + r); ctx.moveTo(qx + r, qy - r); ctx.lineTo(qx - r, qy + r); ctx.stroke();
      }
    }
    // abrigo: letra H no canto (o barco ocupa o centro)
    const [hi, hj] = env.abrigo;
    ctx.fillStyle = CORES.verde; ctx.font = `bold ${u * 0.3}px Arial, Helvetica, sans-serif`;
    ctx.fillText('H', hj * u + u * 0.2, hi * u + u * 0.22);
    // setas da política (situação inicial das pessoas) nas células livres
    const zeros = new Array(env.nPes).fill(0);
    if (pi) for (const cel of env.celulas) seta(ctx, cel[1] * u + u / 2, cel[0] * u + u / 2, u, pi[env.codifica(cel, zeros)]);
    // trilha da rota (animação): linha tracejada pelos centros das células visitadas
    if (dados.trilha && dados.trilha.length > 1) {
      ctx.save(); ctx.strokeStyle = 'rgba(29,35,105,.55)'; ctx.lineWidth = Math.max(2, u * 0.05); ctx.setLineDash([u * 0.1, u * 0.08]); ctx.lineJoin = 'round'; ctx.beginPath();
      dados.trilha.forEach((c, i) => { const X = c[1] * u + u / 2, Y = c[0] * u + u / 2; if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
      ctx.stroke(); ctx.restore();
    }
    // pessoas ainda ilhadas: P1..Pn em vermelho (no canto, se o barco está na mesma célula)
    env.pessoas.forEach((p, k) => {
      if (sit[k] !== 0) return;
      ctx.fillStyle = CORES.verm;
      const junto = p[0] === barco[0] && p[1] === barco[1];
      if (pi || junto) { ctx.font = `bold ${u * 0.22}px Arial, Helvetica, sans-serif`; ctx.fillText(`P${k + 1}`, p[1] * u + u * 0.24, p[0] * u + u * 0.2); }
      else { ctx.font = `bold ${u * 0.34}px Arial, Helvetica, sans-serif`; ctx.fillText(`P${k + 1}`, p[1] * u + u / 2, p[0] * u + u / 2); }
    });
    // pessoas a bordo (círculo branco com contorno azul e texto vermelho) e salvas (círculo verde com ✓), no canto superior direito
    if (!pi) {
      const emblema = (cel, j, txt, fundo, corTxt, borda) => {
        const r = u * 0.12, X = cel[1] * u + u - r - u * 0.04 - j * (2 * r + u * 0.03), Y = cel[0] * u + r + u * 0.04;
        ctx.fillStyle = fundo; ctx.strokeStyle = borda; ctx.lineWidth = Math.max(1.5, u * 0.025);
        ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = corTxt; ctx.font = `bold ${u * (txt === '✓' ? 0.16 : 0.115)}px Arial, Helvetica, sans-serif`; ctx.fillText(txt, X, Y + u * 0.005);
      };
      let jb = 0, js = 0;
      env.pessoas.forEach((p, k) => {
        if (sit[k] === 1) emblema(barco, jb++, `P${k + 1}`, '#FFFFFF', CORES.verm, CORES.navy);
        else if (sit[k] === 2) emblema(env.abrigo, js++, '✓', CORES.verde, '#FFFFFF', '#1E5A40');
      });
    }
    // barco (menor e no canto quando há seta na mesma célula)
    const bx = barco[1] * u + u / 2, by = barco[0] * u + u / 2;
    if (pi) desenharBarco(ctx, bx + u * 0.27, by + u * 0.25, u, 0.5); else desenharBarco(ctx, bx, by + u * 0.02, u, 1);
  }

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => desenhar()).observe(canvas.parentElement);
  onEscala(() => desenhar());
  return { desenhar };
}
