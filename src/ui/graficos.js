// Gráficos de linha em canvas 2D, sem bibliotecas. / Canvas 2D line charts, no libraries.
import { remPx, onEscala } from './escala.js';

// Fonte do eixo acompanha a escala (mín. 11 px); altura entre 10,5 e 12,5 rem (≈150–180 px na escala padrão).
export const fonteGrafico = () => `${Math.max(11, Math.round(12 * remPx() / 16 * 10) / 10)}px Arial, Helvetica, sans-serif`;
export const alturaGrafico = (w) => { const r = remPx(); return Math.round(Math.max(10.5 * r, Math.min(12.5 * r, w * 0.5))); };

export function ticksBonitos(min, max, n = 5) {
  if (!(max > min)) return [min];
  const bruto = (max - min) / n, mag = 10 ** Math.floor(Math.log10(bruto)), r = bruto / mag;
  const passo = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag, ts = [];
  for (let v = Math.ceil(min / passo) * passo; v <= max + passo * 1e-9; v += passo) ts.push(Math.abs(v) < passo * 1e-9 ? 0 : v);
  return ts;
}

const abrev = (v) => (v >= 1000 ? `${v / 1000}k` : String(v));

// cfg: { x[], y[], cor, xMax, logX, yMin, yMax, ref, refRot, xRot, yRot, fmtY }
export function criarGrafico(canvas) {
  let cfg = null;

  function desenhar(novo) {
    if (novo) cfg = novo;
    if (!cfg) return;
    const w = Math.max(200, canvas.parentElement.clientWidth || 300), h = alturaGrafico(w);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const cTexto = css.getPropertyValue('--texto-suave').trim() || '#4A4F6A', cGrade = css.getPropertyValue('--borda').trim() || '#DDE2EE';
    const L = 48, R = 12, T = 10, B = 40, pw = w - L - R, ph = h - T - B;
    const x0 = cfg.x.length ? cfg.x[0] : 1, x1 = Math.max(cfg.xMax, x0 + 1);
    const lx = (v) => Math.log10(Math.max(v, 1e-9));
    const px2 = (v) => L + (cfg.logX ? (lx(v) - lx(x0)) / (lx(x1) - lx(x0)) : v / x1) * pw;
    const py = (v) => T + ph - ((v - cfg.yMin) / (cfg.yMax - cfg.yMin)) * ph;

    ctx.clearRect(0, 0, w, h); ctx.font = fonteGrafico(); ctx.fillStyle = cTexto; ctx.strokeStyle = cGrade; ctx.lineWidth = 1;
    // grade e rótulos do eixo y
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of ticksBonitos(cfg.yMin, cfg.yMax, 4)) {
      const y = Math.round(py(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
      ctx.fillText(cfg.fmtY ? cfg.fmtY(v) : String(v), L - 6, y);
    }
    // eixo x
    let xs;
    if (cfg.logX) { xs = []; for (let e = Math.ceil(lx(x0)); e <= Math.floor(lx(x1)); e++) xs.push(10 ** e); if (xs.length < 2) xs = [x0, x1]; }
    else xs = ticksBonitos(0, x1, 5);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of xs) {
      const x = Math.round(px2(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
      ctx.fillText(abrev(Math.round(v)), x, T + ph + 5);
    }
    ctx.strokeStyle = cTexto; ctx.beginPath(); ctx.moveTo(L + 0.5, T); ctx.lineTo(L + 0.5, T + ph + 0.5); ctx.lineTo(L + pw, T + ph + 0.5); ctx.stroke();
    ctx.fillText(cfg.xRot || '', L + pw / 2, h - 16);
    ctx.save(); ctx.translate(11, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(cfg.yRot || '', 0, 0); ctx.restore();

    ctx.save(); ctx.beginPath(); ctx.rect(L, T - 2, pw + 1, ph + 4); ctx.clip();
    if (cfg.ref !== undefined && cfg.ref !== null) {
      const y = py(cfg.ref);
      ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#C0392B'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(cfg.refRot || '', L + 6, y + 4);
    }
    if (cfg.x.length) {
      ctx.strokeStyle = cfg.cor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
      cfg.x.forEach((v, i) => { const X = px2(v), Y = py(cfg.y[i]); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
      ctx.stroke();
      if (cfg.x.length === 1) { ctx.fillStyle = cfg.cor; ctx.beginPath(); ctx.arc(px2(cfg.x[0]), py(cfg.y[0]), 3, 0, 7); ctx.fill(); }
    }
    ctx.restore();
  }

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => desenhar()).observe(canvas.parentElement);
  onEscala(() => desenhar());
  return { desenhar };
}
