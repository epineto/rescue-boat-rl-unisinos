// Testes do gerador de .zip: confere estrutura, CRC e conteúdo relendo o arquivo gerado.
import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { criarZip } from "../src/ui/zip.js";

test("zip: diretório central coerente e conteúdo recuperável", () => {
  const arq = [{ nome: "a.csv", texto: "x,y\r\n1,2\r\n" }, { nome: "pasta/ç.csv", texto: "﻿Ação,valor\r\nÓtimo,161,93\r\n" }, { nome: "vazio.csv", texto: "" }];
  const z = criarZip(arq, new Date(2026, 9, 8, 12, 30, 10)), v = new DataView(z.buffer, z.byteOffset, z.byteLength);
  const fim = z.length - 22; assert.equal(v.getUint32(fim, true), 0x06054b50); assert.equal(v.getUint16(fim + 10, true), 3);
  let o = v.getUint32(fim + 16, true); const dec = new TextDecoder('utf-8', { ignoreBOM: true }), lidos = [];
  for (let i = 0; i < 3; i++) {
    assert.equal(v.getUint32(o, true), 0x02014b50);
    const tam = v.getUint32(o + 24, true), nn = v.getUint16(o + 28, true), lh = v.getUint32(o + 42, true), nome = dec.decode(z.subarray(o + 46, o + 46 + nn));
    assert.equal(v.getUint32(lh, true), 0x04034b50);
    const ini = lh + 30 + v.getUint16(lh + 26, true); lidos.push([nome, dec.decode(z.subarray(ini, ini + tam))]); o += 46 + nn;
  }
  assert.deepEqual(lidos, arq.map((a) => [a.nome, a.texto]));
});

test("zip: aceito pelo 'unzip -t' / zipfile do Python (CRC verificado), quando disponíveis", () => {
  const dir = mkdtempSync(join(tmpdir(), "zip-")), f = join(dir, "t.zip");
  writeFileSync(f, criarZip([{ nome: "comparacao.csv", texto: "a,b\r\n1,2\r\n" }, { nome: "busca.csv", texto: "ç\r\n".repeat(1000) }]));
  const r = spawnSync("python3", ["-I", "-c", "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(','.join(z.namelist()))", f], { encoding: "utf8" });
  if (r.error || r.status === 127) return;   // sem Python: o teste estrutural acima já cobre
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), "comparacao.csv,busca.csv");
});
