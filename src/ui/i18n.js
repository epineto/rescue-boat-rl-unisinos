// Internacionalização mínima: dicionários são módulos JS (sem fetch). / Minimal i18n: dictionaries are JS modules.
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';

const DICT = { pt, en };
const CHAVE = 'barco-resgate-lang';
let lang = 'pt';
const ouvintes = [];

export const getLang = () => lang;
export const onLang = (fn) => ouvintes.push(fn);

// Português é o idioma padrão; só mudamos se a pessoa escolher EN no botão (a escolha fica salva no navegador).
export function detectar() {
  try { const s = localStorage.getItem(CHAVE); if (s === 'pt' || s === 'en') return s; } catch (_) { /* sem storage */ }
  return 'pt';
}

export function t(chave, vars = {}) {
  const s = DICT[lang][chave] ?? DICT.pt[chave] ?? chave;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

// Formata número conforme o idioma (vírgula decimal em PT). / Locale-aware number formatting.
export const fmt = (n, d = 2) => Number(n).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// Número com até `max` casas, sem zeros à direita (ex.: 0,05 · 0,1 · 1). / Up to `max` decimals, no trailing zeros.
export const fmtMax = (n, max = 3) => Number(n).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: max });

export function aplicar() {
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
  document.title = t('doc.titulo');
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', t('doc.descricao'));
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((par) => { const [attr, k] = par.split(':'); el.setAttribute(attr, t(k)); });
  });
  document.querySelectorAll('[data-lang-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.langBtn === lang)));
}

export function setLang(novo, persistir = true) {
  if (!DICT[novo]) return;
  lang = novo;
  if (persistir) { try { localStorage.setItem(CHAVE, novo); } catch (_) { /* ignora */ } }
  aplicar();
  ouvintes.forEach((fn) => fn(lang));
}

export function iniciar() {
  lang = detectar();
  aplicar();
}
