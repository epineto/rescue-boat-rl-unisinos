// Escala da interface (A− · A · A+ = 80% · 90% · 100%): troca o tamanho-base da fonte (rem) sem recarregar.
// Interface scale: swaps the root font-size (everything is in rem); canvases are redrawn through onEscala().
const CHAVE = 'barco-resgate-escala';
export const ESCALAS = ['80', '90', '100'];
export const ESCALA_PADRAO = '90';
const ouvintes = [];

export const getEscala = () => document.documentElement.dataset.escala || ESCALA_PADRAO;
// Tamanho do rem em px CSS (já inclui a escala escolhida e o zoom/fonte do navegador não — esses entram nos px CSS).
export const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 14.4;
// Registra um redesenho; é chamado ao mudar a escala e ao mudar o devicePixelRatio (zoom do navegador / troca de tela).
export const onEscala = (fn) => { ouvintes.push(fn); };
const notificar = () => ouvintes.forEach((fn) => fn());

function marcarBotoes() {
  const atual = getEscala();
  document.querySelectorAll('[data-escala-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.escalaBtn === atual)));
}

export function setEscala(e, persistir = true) {
  if (!ESCALAS.includes(e)) return;
  document.documentElement.dataset.escala = e;
  if (persistir) { try { localStorage.setItem(CHAVE, e); } catch (_) { /* sem storage */ } }
  marcarBotoes();
  notificar();
}

export function iniciarEscala() {
  let e = ESCALA_PADRAO;
  try { const s = localStorage.getItem(CHAVE); if (ESCALAS.includes(s)) e = s; } catch (_) { /* sem storage */ }
  document.documentElement.dataset.escala = e;
  marcarBotoes();
  document.querySelectorAll('[data-escala-btn]').forEach((b) => b.addEventListener('click', () => setEscala(b.dataset.escalaBtn)));
  // zoom do navegador muda o devicePixelRatio: redesenha os canvases para ficarem nítidos
  let dpr = window.devicePixelRatio || 1;
  window.addEventListener('resize', () => { const n = window.devicePixelRatio || 1; if (n !== dpr) { dpr = n; notificar(); } });
}
