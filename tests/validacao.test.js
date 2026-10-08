// Testes do editor de mapa: regras de validação e compatibilidade de criarAmbiente com mapas de tamanhos diferentes.
import test from "node:test";
import assert from "node:assert/strict";
import { criarAmbiente, MAPA_PADRAO } from "../src/env.js";
import { iteracaoValor, iteracaoPolitica } from "../src/algos.js";
import { validarMapa, contarSituacoes, alcancaveis, redimensionar, pintar } from "../src/validacao.js";

const codigos = (m, o) => validarMapa(m, o).erros.map((e) => e.codigo);

test("mapa padrão é válido: 6×6, 3 pessoas, 832 estados", () => {
  const v = validarMapa(MAPA_PADRAO);
  assert.equal(v.ok, true);
  assert.equal(v.nl, 6); assert.equal(v.nPessoas, 3); assert.equal(v.nCelulas, 32); assert.equal(v.nSituacoes, 26); assert.equal(v.nS, 832);
  assert.equal(v.nS, criarAmbiente().nS);
});

test("contarSituacoes bate com a enumeração de env.js para 1–3 pessoas e capacidade 1–3", () => {
  const livre = ["....", ".H..", "....", "...."];
  for (const nPes of [1, 2, 3]) for (const cap of [1, 2, 3]) {
    const m = livre.map((l) => l.split(""));
    const pos = [[0, 0], [0, 3], [3, 3]];
    for (let k = 0; k < nPes; k++) m[pos[k][0]][pos[k][1]] = "P";
    const mapa = m.map((l) => l.join(""));
    const env = criarAmbiente({ mapa, capacidade: cap });
    assert.equal(contarSituacoes(nPes, cap), env.situacoes.length, `${nPes} pessoas, capacidade ${cap}`);
    assert.equal(validarMapa(mapa, { capacidade: cap }).nS, env.nS);
  }
});

test("exatamente 1 abrigo", () => {
  assert.deepEqual(codigos(["P...", "....", "....", "...."]), ["semAbrigo"]);
  const dois = validarMapa(["PH..", "....", "....", "...H"]);
  assert.deepEqual(dois.erros.map((e) => e.codigo), ["variosAbrigos"]); assert.equal(dois.erros[0].n, 2);
});

test("1 a 3 pessoas", () => {
  assert.deepEqual(codigos(["H...", "....", "....", "...."]), ["semPessoas"]);
  assert.deepEqual(codigos(["HPPP", "P...", "....", "...."]), ["muitasPessoas"]);
  assert.equal(validarMapa(["HPPP", "....", "....", "...."]).ok, true);
});

test("tamanho entre 4×4 e 8×8, quadrado, linhas de mesmo comprimento", () => {
  assert.deepEqual(codigos(["HP.", "...", "..."]), ["tamanho"]);
  const grande = Array.from({ length: 9 }, () => ".".repeat(9));
  assert.deepEqual(codigos(grande), ["tamanho"]);
  assert.deepEqual(codigos(["HP..", "....", "...."]), ["tamanho"]);   // 3×4
  assert.deepEqual(codigos(["HP..", "...", "....", "...."]), ["formato"]);
  assert.deepEqual(codigos([]), ["formato"]);
  assert.deepEqual(codigos("abc"), ["formato"]);
  assert.deepEqual(codigos([1, 2, 3, 4]), ["formato"]);
  for (const n of [4, 5, 6, 7, 8]) {
    const m = redimensionar(["HP"], n); assert.equal(m.length, n); assert.equal(m[0].length, n); assert.equal(validarMapa(m).ok, true);
  }
});

test("símbolos desconhecidos são recusados", () => {
  const v = validarMapa(["HP.?", "....", "..Z.", "...."]);
  assert.deepEqual(v.erros.map((e) => e.codigo), ["simbolo"]); assert.match(v.erros[0].simbolos, /\?/); assert.match(v.erros[0].simbolos, /Z/);
});

test("todas as pessoas alcançáveis a partir do abrigo (BFS ignorando a correnteza)", () => {
  // pessoa isolada por uma parede de bloqueios
  const m = ["H.#P", "..#.", "..#.", "..#."];
  const v = validarMapa(m);
  assert.deepEqual(v.erros.map((e) => e.codigo), ["inalcancavel"]); assert.deepEqual(v.inalcancaveis, [[0, 3]]);
  // correnteza, destroços e água não bloqueiam
  assert.equal(validarMapa(["H~xP", "....", "....", "...."]).ok, true);
  assert.equal(validarMapa(["H#..", "#...", "..P.", "...."]).erros[0].codigo, "abrigoPreso");
  assert.equal(alcancaveis(["H.#P", "..#.", "..#.", "..#."], [0, 0]).has("0,3"), false);
});

test("pintar: o abrigo é único; pessoas/abrigo substituem bloqueio, correnteza e destroços (um símbolo por célula)", () => {
  let m = pintar(MAPA_PADRAO, 0, 1, "H");
  assert.equal(m.join("").split("H").length - 1, 1); assert.equal(m[0][1], "H"); assert.equal(m[5][2], ".");
  m = pintar(MAPA_PADRAO, 2, 0, "P"); assert.equal(m[2][0], "P");
  m = pintar(MAPA_PADRAO, 1, 1, "x"); assert.equal(m[1][1], "x"); assert.equal(validarMapa(m).ok, true);
});

const MAPAS = {
  "4×4, 1 pessoa": ["P..~", ".#x.", "....", "H..."],
  "5×5, 2 pessoas": ["P.~.P", ".x#..", "~~~~~", "..x..", "H...."],
  "7×7, 3 pessoas": ["P...P..", ".#..#..", "~~~~~~~", "..xx.P.", ".#..#..", "......x", "H......"]
};
for (const [nome, mapa] of Object.entries(MAPAS)) {
  test(`criarAmbiente com mapa ${nome}: válido e Iteração de Valor = Iteração de Política`, () => {
    const v = validarMapa(mapa); assert.equal(v.ok, true, JSON.stringify(v.erros));
    for (const capacidade of [1, 2]) {
      const env = criarAmbiente({ mapa, capacidade });
      assert.equal(env.nl, mapa.length); assert.equal(env.nS, validarMapa(mapa, { capacidade }).nS);
      // as probabilidades de cada (s,a) somam 1
      for (let sa = 0; sa < env.nS * env.nA; sa++) { let p = 0; for (let k = 0; k < env.nOut[sa]; k++) p += env.prob[sa * env.K + k]; assert.ok(Math.abs(p - 1) < 1e-12); }
      const vi = iteracaoValor(env, 0.99), ip = iteracaoPolitica(env, 0.99);
      let dif = 0; for (let s = 0; s < env.nS; s++) dif = Math.max(dif, Math.abs(vi.V[s] - ip.V[s]));
      assert.ok(dif < 1e-6, `|V_VI − V_IP| = ${dif}`);
      assert.ok(vi.V[env.s0] > 0, "o objetivo é alcançável: valor inicial positivo");
    }
  });
}

test("mapa 8×8 com 3 pessoas e capacidade 2: 64 células × 26 situações = 1664 estados", () => {
  const mapa = ["P.......", "........", "........", "...P....", "........", "........", "......P.", ".......H"];
  const v = validarMapa(mapa); assert.equal(v.ok, true); assert.equal(v.nS, 64 * 26);
  const env = criarAmbiente({ mapa }); assert.equal(env.nS, 1664);
});
