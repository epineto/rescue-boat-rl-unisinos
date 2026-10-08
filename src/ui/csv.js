// Utilitário genérico de CSV (sem DOM até `baixarCSV`). / Generic CSV utility (DOM-free until `baixarCSV`).

// Escapa uma célula: aspas duplicadas e campo entre aspas se tiver separador, aspas ou quebra de linha.
export function celulaCSV(v, sep = ',') {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// cabecalho: string[]; linhas: any[][] (ou objetos, se `cabecalho` for lista de chaves e `chaves` true).
export function paraCSV(cabecalho, linhas, { sep = ',', eol = '\r\n' } = {}) {
  const l = [cabecalho.map((c) => celulaCSV(c, sep)).join(sep)];
  for (const linha of linhas) l.push(linha.map((c) => celulaCSV(c, sep)).join(sep));
  return l.join(eol) + eol;
}

// Baixa o texto como arquivo .csv (UTF-8 com BOM para o Excel abrir acentos corretamente).
export function baixarCSV(nome, texto) {
  const blob = new Blob(['﻿', texto], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nome.endsWith('.csv') ? nome : `${nome}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
