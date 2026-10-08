// Utilitários compartilhados pela interface. / Shared UI helpers.
import { t, fmtMax, getLang, onLang } from './i18n.js';
import { lerNumero, formatarCampo } from '../numeros.js';

export const $ = (id) => document.getElementById(id);

// Escreve um valor num campo: campos decimais (data-dec) usam o formato do idioma (vírgula em PT).
export function definir(id, valor) {
  const el = $(id);
  el.value = el.hasAttribute('data-dec') ? formatarCampo(valor, getLang()) : String(valor);
}

// Campos corrigidos desde a última chamada de `tomarCorrecoes()` (rótulos).
const correcoes = [];
export const tomarCorrecoes = () => correcoes.splice(0).filter((x, i, a) => a.indexOf(x) === i);

// Lê um campo numérico (aceita vírgula ou ponto), limita ao intervalo e escreve de volta o valor corrigido.
export function num(id, min, max, padrao, inteiro = false) {
  const el = $(id);
  const lido = lerNumero(el.value, { inteiro });
  let v = Number.isFinite(lido) ? lido : padrao;
  v = Math.min(max, Math.max(min, v));
  if (inteiro) v = Math.round(v);
  if (!Number.isFinite(lido) || lido !== v) {   // texto inválido, vazio ou fora do intervalo: avisa quem chamou
    const rot = document.querySelector(`label[for="${id}"]`);
    correcoes.push(rot ? rot.textContent.trim() : id);
  }
  definir(id, v);
  return v;
}

// Campos decimais: ao sair do campo, normaliza o texto para o formato do idioma; ao trocar de idioma, reformata todos.
function reformatar(el) {
  const v = lerNumero(el.value);
  if (Number.isFinite(v)) el.value = formatarCampo(v, getLang());
}
document.addEventListener('focusout', (ev) => { if (ev.target.matches && ev.target.matches('input[data-dec]')) reformatar(ev.target); });
onLang(() => document.querySelectorAll('input[data-dec]').forEach(reformatar));
export const reformatarCampos = () => document.querySelectorAll('input[data-dec]').forEach(reformatar);

export const metrica = (rot, val, sub = '', cls = '') => `<div class="${cls}"><dt>${rot}</dt><dd>${val}${sub ? `<small>${sub}</small>` : ''}</dd></div>`;

export const duracao = (seg) => (seg < 60 ? `${Math.max(1, Math.round(seg))} s` : `${Math.floor(seg / 60)} min ${Math.round(seg % 60)} s`);

// Tempo restante estimado (texto) a partir da fração concluída e do instante de início; "…" até haver dados suficientes.
export function textoEta(frac, t0) {
  const seg = (performance.now() - t0) / 1000;
  return frac > 0.03 ? duracao((seg * (1 - frac)) / frac) : '…';
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Formata um α (null = média amostral) / format an alpha (null = sample average)
export const textoAlpha = (a) => (a === null || a === 'media' ? t('busca.media') : fmtMax(a, 3));

// Atualiza a barra e o texto de estado só a cada `ms` (evita sobrecarregar leitores de tela e o DOM).
export function limitador(ms = 250) {
  let ultimo = 0;
  return (fn, forcar = false) => { const agora = performance.now(); if (forcar || agora - ultimo >= ms) { ultimo = agora; fn(); } };
}
