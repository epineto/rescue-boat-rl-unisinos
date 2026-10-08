// Gerador mínimo de arquivo .zip (entradas sem compressão, "stored"), sem dependências. Os CSVs são pequenos.
// Minimal .zip writer (stored entries, no compression), dependency-free.

let TABELA = null;
function crc32(bytes) {
  if (!TABELA) { TABELA = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABELA[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// arquivos: [{ nome, texto | bytes }] → Uint8Array do .zip. Nomes em UTF-8 (flag 0x0800).
export function criarZip(arquivos, data = new Date()) {
  const enc = new TextEncoder(), partes = [], central = [];
  const dosHora = (data.getHours() << 11) | (data.getMinutes() << 5) | (data.getSeconds() >> 1);
  const dosData = ((Math.max(1980, data.getFullYear()) - 1980) << 9) | ((data.getMonth() + 1) << 5) | data.getDate();
  let desloc = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome), dados = a.bytes || enc.encode(a.texto ?? ''), crc = crc32(dados);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosHora, true); lh.setUint16(12, dosData, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, dados.length, true); lh.setUint32(22, dados.length, true); lh.setUint16(26, nome.length, true); lh.setUint16(28, 0, true);
    partes.push(new Uint8Array(lh.buffer), nome, dados);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosHora, true); ch.setUint16(14, dosData, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, dados.length, true); ch.setUint32(24, dados.length, true); ch.setUint16(28, nome.length, true);
    ch.setUint32(42, desloc, true);
    central.push(new Uint8Array(ch.buffer), nome);
    desloc += 30 + nome.length + dados.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true); fim.setUint32(16, desloc, true);
  const todas = [...partes, ...central, new Uint8Array(fim.buffer)], saida = new Uint8Array(todas.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of todas) { saida.set(p, o); o += p.length; }
  return saida;
}

export function baixarZip(nome, arquivos) {
  const blob = new Blob([criarZip(arquivos)], { type: 'application/zip' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nome.endsWith('.zip') ? nome : `${nome}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
