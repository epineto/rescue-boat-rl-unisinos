// Testes da F2: estatística, execução multi-semente, animação passo a passo, CSV e checagens numéricas contra o relatório.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { criarAmbiente } from "../src/env.js";
import { iteracaoValor, iteracaoPolitica, avaliar, rotaDe } from "../src/algos.js";
import { estatisticas, curvaAmostrada, executarSemente, agregar, rodarVariasSementes, linhasTabela, CONFIG_PESQUISA } from "../src/experimentos.js";
import { criarEpisodio } from "../src/animacao.js";
import { paraCSV, celulaCSV } from "../src/ui/csv.js";

const ref = JSON.parse(readFileSync(new URL("./reference.json", import.meta.url)));
const env = criarAmbiente();

test("estatisticas: média, desvio amostral e IC95 = 1,96·dp/√n", () => {
  const e = estatisticas([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(e.n, 8); assert.equal(e.media, 5);
  assert.ok(Math.abs(e.dp - Math.sqrt(32 / 7)) < 1e-12);
  assert.ok(Math.abs(e.ic95 - (1.96 * Math.sqrt(32 / 7)) / Math.sqrt(8)) < 1e-12);
  assert.deepEqual(estatisticas([3]), { n: 1, media: 3, dp: 0, ic95: 0 });
  assert.equal(estatisticas([]).n, 0);
});

test("curvaAmostrada: x crescente em escala log, termina em nEp e valores batem com a média da janela", () => {
  const n = 10000, ret = Float32Array.from({ length: n }, (_, i) => i), suc = new Uint8Array(n).fill(1);
  const c = curvaAmostrada(ret, suc, 40), w = 100;
  assert.equal(c.x[0], w); assert.equal(c.x[c.x.length - 1], n);
  for (let i = 1; i < c.x.length; i++) assert.ok(c.x[i] > c.x[i - 1]);
  const e = c.x[5]; let m = 0; for (let i = e - w; i < e; i++) m += i; assert.ok(Math.abs(c.ret[5] - m / w) < 1e-6);
  assert.ok(c.suc.every((v) => v === 1));
});

test("executarSemente é determinística e agregar escolhe a semente representativa", () => {
  const cfg = { ...CONFIG_PESQUISA.q, nEp: 3000 };
  const a = executarSemente(env, cfg, 9000, { nEpAval: 300 }), b = executarSemente(env, cfg, 9000, { nEpAval: 300 });
  assert.deepEqual(Array.from(a.pi), Array.from(b.pi)); assert.deepEqual(a.aval, b.aval);
  const ag = agregar([a, executarSemente(env, cfg, 9001, { nEpAval: 300 }), executarSemente(env, cfg, 9002, { nEpAval: 300 })]);
  assert.equal(ag.n, 3); assert.ok(ag.representativa >= 0 && ag.representativa < 3);
  assert.equal(ag.curva.x.length, ag.curva.ret.length); assert.equal(ag.curva.retIc.length, ag.curva.x.length);
  const v = iteracaoValor(env, 0.99), linhas = linhasTabela({ v0: v.V[env.s0], aval: avaliar(env, v.pi, { nEp: 200 }) }, [["q", ag]]);
  assert.equal(linhas.length, 2); assert.equal(linhas[0].dif, 0); assert.ok(Math.abs(linhas[1].dif - (ag.retornoDesc.media - v.V[env.s0])) < 1e-12);
});

test("Iteração de Política: 14 rodadas e mesma política/valor da Iteração de Valor", () => {
  const ip = iteracaoPolitica(env, 0.99), vi = iteracaoValor(env, 0.99);
  assert.equal(ip.rodadas, 14); assert.equal(ip.rodadas, ref.pi_rounds);
  let dif = 0; for (let s = 0; s < env.nS; s++) dif = Math.max(dif, Math.abs(ip.V[s] - vi.V[s]));
  assert.ok(dif < 1e-6, `max |V_ip − V_vi| = ${dif}`);
  assert.ok(Math.abs(ip.V[env.s0] - 161.93) < 0.01);
});

test("animação: mesma semente ⇒ mesma sequência de estados que rotaDe; eventos coerentes", () => {
  const { pi } = iteracaoValor(env, 0.99), esperado = rotaDe(env, pi, { seed: 3 });
  const ep = criarEpisodio(env, pi, { seed: 3 }), evs = []; let ult;
  while (!ep.terminou) { ult = ep.passo(); evs.push(...ult.eventos); }
  assert.deepEqual(ep.estados, esperado.estados);
  assert.equal(ep.passo(), null);
  assert.ok(Math.abs(ep.acumulada - esperado.recompensas.reduce((a, b) => a + b, 0)) < 1e-9);
  assert.equal(evs.filter((e) => e.tipo === "embarque").length, 3);
  assert.equal(evs.filter((e) => e.tipo === "desembarque").length, 3);
  assert.equal(evs.filter((e) => e.tipo === "fim").length, 1);
  assert.equal(ult.fim, true);
  assert.ok(evs.filter((e) => e.tipo === "destrocos").length >= 1, "com −10 a rota ótima cruza os destroços");
});

test("animação: arraste da correnteza aparece em alguma semente", () => {
  const { pi } = iteracaoValor(env, 0.99); let achou = false;
  for (let seed = 0; seed < 30 && !achou; seed++) { const ep = criarEpisodio(env, pi, { seed }); while (!ep.terminou) if (ep.passo().eventos.some((e) => e.tipo === "arraste")) achou = true; }
  assert.ok(achou);
});

test("animação: limite de passos trunca o episódio", () => {
  const ep = criarEpisodio(env, new Int32Array(env.nS).fill(0), { seed: 1, maxPassos: 5 }); let u;
  while (!ep.terminou) u = ep.passo();
  assert.equal(ep.t, 5); assert.ok(u.truncado); assert.ok(u.eventos.some((e) => e.tipo === "limite"));
});

test("CSV: escapa vírgulas, aspas e quebras de linha", () => {
  assert.equal(celulaCSV('a,b'), '"a,b"'); assert.equal(celulaCSV('diz "oi"'), '"diz ""oi"""'); assert.equal(celulaCSV(null), ""); assert.equal(celulaCSV(1.5), "1.5");
  assert.equal(paraCSV(["x", "y"], [[1, "a;b"], [2, "c"]], { eol: "\n" }), "x,y\n1,a;b\n2,c\n");
  assert.equal(paraCSV(["x"], [["a;b"]], { sep: ";", eol: "\n" }), 'x\n"a;b"\n');
});

// ---- checagens numéricas contra o relatório (RNG diferente do numba ⇒ tolerância estatística), 5 sementes por algoritmo
const V0 = ref.Vstar_s0;
test("melhores configurações da pesquisa (5 sementes): retorno descontado próximo dos valores do relatório", () => {
  const q = rodarVariasSementes(env, CONFIG_PESQUISA.q, 5), sa = rodarVariasSementes(env, CONFIG_PESQUISA.sarsa, 5), mc = rodarVariasSementes(env, CONFIG_PESQUISA.mc, 5);
  const m = (r) => r.retornoDesc.media;
  console.log(`  Q-learning ${m(q).toFixed(2)}±${q.retornoDesc.ic95.toFixed(2)} | Sarsa ${m(sa).toFixed(2)}±${sa.retornoDesc.ic95.toFixed(2)} | Monte Carlo ${m(mc).toFixed(2)}±${mc.retornoDesc.ic95.toFixed(2)} | V*=${V0.toFixed(2)}`);
  assert.ok(Math.abs(V0 - 161.93) < 0.01);
  assert.ok(Math.abs(m(q) - ref.targets["Q-learning"].mean) < 1.0, `Q ${m(q)}`);        // relatório: 161,92 ± 0,03
  assert.ok(Math.abs(m(sa) - ref.targets["Sarsa"].mean) < 2.5, `Sarsa ${m(sa)}`);         // relatório: 161,74 ± 0,26
  assert.ok(Math.abs(m(mc) - ref.targets["Monte Carlo"].mean) < 4, `MC ${m(mc)}`);        // relatório: 159,76 ± 0,86
  for (const r of [q, sa, mc]) { assert.ok(m(r) <= V0 + 0.5); assert.ok(r.sucesso.media > 0.95); assert.ok(r.retornoDesc.ic95 >= 0); }
  assert.ok(m(q) >= m(mc) - 0.5, "Q-learning não deve ficar abaixo do Monte Carlo");
});
