// Leitura robusta de números digitados (pt-BR e en). Módulo puro, sem DOM. / Robust parsing of typed numbers.

// Aceita "0,25", "0.25", "−10", "1.234,5", "1,234.5", " 30 000 " e, em campos inteiros, "30.000" (ponto como milhar).
// Devolve NaN se não for um número.
export function lerNumero(texto, { inteiro = false } = {}) {
  let s = String(texto ?? '').trim().replace(/[\s  ]/g, '').replace(/[−–]/g, '-');
  if (!/^[-+]?(\d[\d.,]*|[.,]\d+)$/.test(s)) return NaN;
  const iv = s.lastIndexOf(','), ip = s.lastIndexOf('.');
  if (iv >= 0 && ip >= 0) {
    const dec = iv > ip ? ',' : '.', mil = dec === ',' ? '.' : ',';
    s = s.split(mil).join('').replace(dec, '.');
  } else if (iv >= 0 || ip >= 0) {
    const sep = iv >= 0 ? ',' : '.', n = s.split(sep).length - 1;
    const milhar = new RegExp(`^[-+]?\\d{1,3}(\\${sep}\\d{3})+$`).test(s);
    if (n > 1 && !milhar) return NaN;
    s = (n > 1 || (inteiro && milhar)) ? s.split(sep).join('') : s.replace(sep, '.');
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}

// Formata para exibição em um campo de texto, sem separador de milhar. / Format for a text field, no grouping.
export const formatarCampo = (v, lang = 'pt', max = 6) =>
  Number(v).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: max, useGrouping: false });
