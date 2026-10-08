// Testes do link de configuração (hash da URL).
import test from "node:test";
import assert from "node:assert/strict";
import { MAPA_PADRAO } from "../src/env.js";
import { codificar, decodificar, linkCom, paraBase64Url, deBase64Url, PREFIXO, VERSAO } from "../src/compartilhar.js";

const cfg = { mapa: ["P..~", ".#x.", "....", "H..."], amb: { rDestrocos: -15, pCorr: 0.3, capacidade: 1 }, treino: { algo: "sarsa", passo: "media", alpha: 0.2, eps0: 0.5, gamma: 0.99, nEp: 20000, seed: 7 } };

test("base64url: ida e volta com acentos e sem '+', '/' ou '='", () => {
  for (const s of ["", "a", "ab", "abc", "Iteração de Política ≈ ✕ −15", '{"x":"~~~"}']) {
    const b = paraBase64Url(s); assert.match(b, /^[A-Za-z0-9_-]*$/); assert.equal(deBase64Url(b), s);
  }
});

test("codificar/decodificar preserva mapa, ambiente, algoritmo e hiperparâmetros", () => {
  const h = codificar(cfg); assert.ok(h.startsWith(PREFIXO));
  const { cfg: lido, avisos } = decodificar("#" + h);
  assert.deepEqual(avisos, []); assert.deepEqual(lido, cfg);
  assert.equal(linkCom("https://x.github.io/app/index.html?q=1#antigo", cfg), `https://x.github.io/app/index.html?q=1#${h}`);
  assert.equal(JSON.parse(deBase64Url(h.slice(PREFIXO.length))).v, VERSAO);
});

test("sem hash ou com outro hash: nada a fazer e sem aviso", () => {
  for (const h of ["", "#", "#conteudo", null, undefined]) assert.deepEqual(decodificar(h), { cfg: null, avisos: [] });
});

test("lixo ilegível, versão desconhecida, JSON que não é objeto: aviso e nenhuma exceção", () => {
  const b = (o) => "#" + PREFIXO + paraBase64Url(typeof o === "string" ? o : JSON.stringify(o));
  for (const h of ["#cfg=%%%", "#cfg=abcde", b("não é json"), b("[1,2]"), b("null"), b("42"), "#cfg=" + "A".repeat(7000)]) {
    const r = decodificar(h); assert.equal(r.cfg, null, h.slice(0, 30)); assert.equal(r.avisos[0].codigo, "ilegivel");
  }
  assert.equal(decodificar(b({ v: 99, mapa: MAPA_PADRAO })).avisos[0].codigo, "versao");
});

test("campos inválidos são ignorados com aviso; os válidos continuam valendo", () => {
  const h = "#" + codificar({ mapa: ["HP"], amb: { rDestrocos: 5, pCorr: 0.4, capacidade: 7 }, treino: { algo: "dqn", passo: "media", alpha: 0, eps0: "x", gamma: 0.9, nEp: 50, seed: -1 } });
  const { cfg: lido, avisos } = decodificar(h);
  assert.deepEqual(lido, { amb: { pCorr: 0.4 }, treino: { passo: "media", gamma: 0.9 } });
  const campos = avisos.map((a) => a.campo).sort();
  assert.deepEqual(campos, ["amb.capacidade", "amb.rDestrocos", "mapa", "treino.algo", "treino.alpha", "treino.eps0", "treino.nEp", "treino.seed"]);
  assert.ok(avisos.find((a) => a.campo === "mapa").erros.length > 0);
});

test("mapa sem abrigo, com pessoa inalcançável ou com símbolo estranho é ignorado; tipos errados também", () => {
  for (const mapa of [["P...", "....", "....", "...."], ["H.#P", "..#.", "..#.", "..#."], ["H?.P", "....", "....", "...."], "texto", 7, [1, 2]]) {
    const r = decodificar("#" + codificar({ mapa })); assert.equal(r.cfg, null); assert.equal(r.avisos[0].codigo, "mapa");
  }
  const r = decodificar("#" + codificar({ amb: "x", treino: [1] })); assert.equal(r.cfg, null); assert.deepEqual(r.avisos.map((a) => a.campo), ["amb", "treino"]);
  assert.equal(decodificar("#" + codificar({ mapa: MAPA_PADRAO })).cfg.mapa.length, 6);
});

test("a validação do mapa usa a capacidade do próprio link", () => {
  const m = ["HPPP", "....", "....", "...."];
  assert.deepEqual(decodificar("#" + codificar({ mapa: m, amb: { capacidade: 3 } })).cfg.mapa, m);
});
