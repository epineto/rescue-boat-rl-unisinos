// Gráfico de várias séries com faixas de IC (canvas 2D, sem bibliotecas). / Multi-series chart with CI bands.
import { ticksBonitos, fonteGrafico, alturaGrafico } from './graficos.js';
import { onEscala } from './escala.js';

const abrev = (v) => (v >= 1000 ? `${v / 1000}k` : String(v));

// cfg: { series: [{x[], y[], lo[], hi[], cor, tracos, forma ('c' círculo | 'q' quadrado | 't' triângulo; marca cada ponto)}], refs: [{y, cor, tracos, rot}], xMin, xMax, logX, yMin, yMax, xRot, yRot, fmtY }
export function criarGraficoMulti(canvas) {
  let cfg = null;
  function desenhar(novo) {
    if (novo) cfg = novo;
    if (!cfg) return;
    const w = Math.max(220, canvas.parentElement.clientWidth || 300), h = alturaGrafico(w);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const cTexto = css.getPropertyValue('--texto-suave').trim() || '#4A4F6A', cGrade = css.getPropertyValue('--borda').trim() || '#DDE2EE';
    const L = 48, R = 12, T = 10, B = 40, pw = w - L - R, ph = h - T - B;
    const x0 = cfg.xMin, x1 = Math.max(cfg.xMax, x0 + 1), lx = (v) => Math.log10(Math.max(v, 1e-9));
    const px = (v) => L + (cfg.logX ? (lx(v) - lx(x0)) / (lx(x1) - lx(x0)) : (v - x0) / (x1 - x0)) * pw;
    const py = (v) => T + ph - ((v - cfg.yMin) / (cfg.yMax - cfg.yMin)) * ph;

    ctx.clearRect(0, 0, w, h); ctx.font = fonteGrafico(); ctx.fillStyle = cTexto; ctx.strokeStyle = cGrade; ctx.lineWidth = 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of ticksBonitos(cfg.yMin, cfg.yMax, 4)) {
      const y = Math.round(py(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
      ctx.fillText(cfg.fmtY ? cfg.fmtY(v) : String(v), L - 6, y);
    }
    let xs;
    if (cfg.logX) { xs = []; for (let e = Math.ceil(lx(x0)); e <= Math.floor(lx(x1)); e++) xs.push(10 ** e); if (xs.length < 2) xs = [x0, x1]; }
    else xs = ticksBonitos(x0, x1, 5);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of xs) {
      const x = Math.round(px(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
      ctx.fillText(abrev(Math.round(v)), x, T + ph + 5);
    }
    ctx.strokeStyle = cTexto; ctx.beginPath(); ctx.moveTo(L + 0.5, T); ctx.lineTo(L + 0.5, T + ph + 0.5); ctx.lineTo(L + pw, T + ph + 0.5); ctx.stroke();
    ctx.fillText(cfg.xRot || '', L + pw / 2, h - 16);
    ctx.save(); ctx.translate(11, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(cfg.yRot || '', 0, 0); ctx.restore();

    ctx.save(); ctx.beginPath(); ctx.rect(L, T - 2, pw + 1, ph + 4); ctx.clip();
    for (const r of cfg.refs || []) {
      ctx.strokeStyle = r.cor; ctx.lineWidth = 1.5; ctx.setLineDash(r.tracos || []);
      ctx.beginPath(); ctx.moveTo(L, py(r.y)); ctx.lineTo(L + pw, py(r.y)); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const s of cfg.series) {   // faixas primeiro, depois as linhas
      if (!s.x.length || !s.lo) continue;
      ctx.fillStyle = s.cor; ctx.globalAlpha = 0.16; ctx.beginPath();
      s.x.forEach((v, i) => { const X = px(v), Y = py(s.hi[i]); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
      for (let i = s.x.length - 1; i >= 0; i--) ctx.lineTo(px(s.x[i]), py(s.lo[i]));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }
    for (const s of cfg.series) {
      if (!s.x.length) continue;
      ctx.strokeStyle = s.cor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.setLineDash(s.tracos || []); ctx.beginPath();
      s.x.forEach((v, i) => { const X = px(v), Y = py(s.y[i]); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
      ctx.stroke(); ctx.setLineDash([]);
      if (s.forma) {   // marcadores: a forma distingue as séries também sem cor
        ctx.fillStyle = s.cor; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5;
        s.x.forEach((v, i) => {
          const X = px(v), Y = py(s.y[i]), r = 4.5; ctx.beginPath();
          if (s.forma === 'q') ctx.rect(X - r + 0.5, Y - r + 0.5, 2 * r - 1, 2 * r - 1);
          else if (s.forma === 't') { ctx.moveTo(X, Y - r - 0.5); ctx.lineTo(X + r + 0.5, Y + r - 1); ctx.lineTo(X - r - 0.5, Y + r - 1); ctx.closePath(); }
          else ctx.arc(X, Y, r, 0, 7);
          ctx.fill(); ctx.stroke();
        });
      }
    }
    ctx.restore();
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => desenhar()).observe(canvas.parentElement);
  onEscala(() => desenhar());
  return { desenhar };
}
