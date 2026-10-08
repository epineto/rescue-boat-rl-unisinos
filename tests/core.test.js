// Testes do núcleo: o JavaScript tem de reproduzir o Python (notebook) — modelo, Iteração de Valor/Política e resultados estatísticos.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { criarAmbiente, transicoes, renderTexto } from "../src/env.js";
import { iteracaoValor, iteracaoPolitica, qLearning, monteCarlo, avaliar, perfilRota, politicaGulosa } from "../src/algos.js";

const ref = JSON.parse(readFileSync(new URL("./reference.json", import.meta.url)));
const env = criarAmbiente();

test("espaço de estados: 32 células × 26 situações = 832", () => {
  assert.equal(env.celulas.length, 32);
  assert.equal(env.situacoes.length, 26);
  assert.equal(env.nS, 832);
  assert.equal(env.nS, ref.nS);
  assert.equal(env.s0, ref.s0);
  assert.deepEqual(env.celulas, ref.cells);
  assert.deepEqual(env.situacoes, ref.situations);
});

test("modelo P idêntico ao do Python em TODOS os (s,a)", () => {
  let n = 0;
  for (let s = 0; s < env.nS; s++) for (let a = 0; a < env.nA; a++) {
    const js = transicoes(env, s, a).map((t) => [t.s2, t.r, t.f, t.p]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const py = ref.P[s][a].map(([p, s2, r, f]) => [s2, r, f, p]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    assert.equal(js.length, py.length, `nº de desfechos em s=${s}, a=${a}`);
    js.forEach((t, i) => { assert.equal(t[0], py[i][0]); assert.equal(t[1], py[i][1]); assert.equal(t[2], py[i][2]); assert.ok(Math.abs(t[3] - py[i][3]) < 1e-12); });
    assert.ok(Math.abs(js.reduce((x, t) => x + t[3], 0) - 1) < 1e-12); n++;
  }
  assert.equal(n, 832 * 4);
});

test("regras: embarque, capacidade, colisão, destroços, desembarque e término", () => {
  const cod = (cel, sit) => env.codifica(cel, sit);
  const um = (s, a) => { const t = transicoes(env, s, a); assert.equal(t.length, 1); return t[0]; };
  let t = um(cod([0, 1], [0, 0, 0]), 3);  assert.deepEqual(env.decodifica(t.s2), { cel: [0, 0], sit: [1, 0, 0] }); assert.equal(t.r, -1);   // embarque
  t = um(cod([1, 3], [0, 0, 0]), 2);      assert.deepEqual(env.decodifica(t.s2).cel, [1, 3]);                                                 // colisão (bloqueio)
  t = um(cod([0, 5], [1, 1, 0]), 1);      assert.deepEqual(env.decodifica(t.s2), { cel: [1, 5], sit: [1, 1, 0] });                            // barco cheio
  t = um(cod([4, 2], [1, 1, 2]), 1);      assert.deepEqual(env.decodifica(t.s2), { cel: [5, 2], sit: [2, 2, 2] });                            // desembarque + término
  assert.equal(t.r, -1 + 100 + 100); assert.equal(t.f, true);
  t = um(cod([4, 2], [0, 0, 0]), 0);      assert.equal(t.r, -10);                                                                             // destroços
  const corr = transicoes(env, cod([2, 2], [0, 0, 0]), 0);                                                                                    // correnteza: 0,8 / 0,2
  assert.equal(corr.length, 2); assert.ok(corr.some((x) => Math.abs(x.p - 0.8) < 1e-12) && corr.some((x) => Math.abs(x.p - 0.2) < 1e-12));
  assert.match(renderTexto(env, env.s0), /B/);
});

test("Iteração de Valor: V, política e nº de varreduras iguais ao Python", () => {
  const { V, pi, varreduras } = iteracaoValor(env, 0.99);
  let maxDif = 0; for (let s = 0; s < env.nS; s++) maxDif = Math.max(maxDif, Math.abs(V[s] - ref.V[s]));
  assert.ok(maxDif < 1e-9, `max |V_js − V_py| = ${maxDif}`);
  assert.deepEqual(Array.from(pi), ref.pi);
  assert.equal(varreduras, ref.vi_sweeps);
  assert.ok(Math.abs(V[env.s0] - ref.Vstar_s0) < 1e-9);
  assert.ok(Math.abs(V[env.s0] - 161.9299) < 1e-3);
});

test("Iteração de Política converge para o mesmo valor ótimo", () => {
  const { V, rodadas } = iteracaoPolitica(env, 0.99);
  assert.equal(rodadas, ref.pi_rounds);
  for (let s = 0; s < env.nS; s++) assert.ok(Math.abs(V[s] - ref.V[s]) < 1e-6);
});

test("política ótima simulada: retorno descontado ≈ V*(s0) e 100% de sucesso", () => {
  const { pi } = iteracaoValor(env, 0.99);
  const r = avaliar(env, pi, { nEp: 5000 });
  assert.ok(Math.abs(r.retornoDesc - ref.Vstar_s0) < 1.5, `retornoDesc=${r.retornoDesc}`);
  assert.equal(r.sucesso, 1); assert.ok(Math.abs(r.passos - 31) < 0.7);
});

test("sensibilidade: com −10 a rota ótima cruza os destroços; com −20 ou mais, contorna", () => {
  for (const pen of [-10, -15, -20, -30, -60]) {
    const e = criarAmbiente({ rDestrocos: pen }), { V, pi } = iteracaoValor(e, 0.99);
    assert.ok(Math.abs(V[e.s0] - ref.sens[String(pen)].Vstar_s0) < 1e-9, `V*(s0) com ${pen}`);
    assert.deepEqual(Array.from(pi), ref.sens[String(pen)].pi, `política com ${pen}`);
    const p = perfilRota(e, pi, { nEp: 500 });
    if (pen === -10) assert.ok(p.passosDestrocos >= 0.99); else assert.equal(p.passosDestrocos, 0);
  }
});

// Alvos estatísticos do relatório (retorno descontado da política gulosa final). RNG diferente do numba ⇒ comparamos com tolerância.
const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
test("Q-learning (α=0,1; ε₀=1; γ=0,95; 30.000 ep.) atinge o ótimo (≈161,9)", () => {
  const v = [1, 2, 3, 4, 5].map((k) => avaliar(env, politicaGulosa(qLearning(env, { nEp: 30000, alpha: 0.1, gamma: 0.95, eps0: 1, seed: 100 + k }).Q, env.nS, env.nA), { nEp: 1000, seed: k }).retornoDesc);
  assert.ok(media(v) > ref.targets["Q-learning"].mean - 1.0, `média=${media(v)}`);
  assert.ok(media(v) < ref.Vstar_s0 + 0.5);
});

test("Sarsa (α=0,2; ε₀=1; γ=0,99; 30.000 ep.) fica próximo do ótimo", () => {
  const v = [1, 2, 3, 4, 5].map((k) => avaliar(env, politicaGulosa(qLearning(env, { nEp: 30000, alpha: 0.2, gamma: 0.99, eps0: 1, seed: 200 + k, sarsa: true }).Q, env.nS, env.nA), { nEp: 1000, seed: k }).retornoDesc);
  assert.ok(media(v) > ref.targets["Sarsa"].mean - 2.5, `média=${media(v)}`);
});

test("Monte Carlo ε-soft (média amostral; ε₀=0,5; γ=0,95; 60.000 ep.) fica próximo do ótimo", () => {
  const v = [1, 2, 3, 4, 5].map((k) => avaliar(env, politicaGulosa(monteCarlo(env, { nEp: 60000, alpha: null, gamma: 0.95, eps0: 0.5, seed: 300 + k }).Q, env.nS, env.nA), { nEp: 1000, seed: k }).retornoDesc);
  assert.ok(media(v) > ref.targets["Monte Carlo"].mean - 4, `média=${media(v)}`);
});
