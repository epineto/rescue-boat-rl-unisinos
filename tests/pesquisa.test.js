// Testes da sensibilidade à penalidade e da busca de hiperparâmetros (lógica pura, execução síncrona em Node).
import test from "node:test";
import assert from "node:assert/strict";
import { criarAmbiente } from "../src/env.js";
import { resolverVI, executarSemente } from "../src/experimentos.js";
import { lerLista, GRADE_PADRAO, gerarConfigs, tarefasBusca, linhasBusca, melhoresPorAlgoritmo, ordenarLinhas, csvBusca, csvBuscaSementes,
  PENALIDADES_PADRAO, tarefasSensibilidade, agruparSensibilidade, linhasSensibilidade, mudancaDeRota, csvSensibilidade, ordenarPenalidades } from "../src/pesquisa.js";

test("lerLista: separadores, vírgula decimal, sinal unicode, limites e duplicatas", () => {
  assert.deepEqual(lerLista("−10, −15; -20 -30,-60").valores, [-10, -15, -20, -30, -60]);
  assert.deepEqual(lerLista("0,05; 0,1  0.2 0,5").valores, [0.05, 0.1, 0.2, 0.5]);
  assert.deepEqual(lerLista("1 1 1").valores, [1]);
  const r = lerLista("-10 abc 5 -200", { min: -100, max: 0 });
  assert.deepEqual(r.valores, [-10]); assert.deepEqual(r.ignorados, ["abc", "5", "-200"]);
  assert.deepEqual(lerLista("média 0,05 media", { aceitaMedia: true }).valores, ["media", 0.05]);
  assert.deepEqual(lerLista("1,5 2", { inteiro: true }).ignorados, ["1,5"]);
  assert.deepEqual(lerLista("").valores, []); assert.deepEqual(lerLista(null).valores, []);
});

test("grade padrão da pesquisa: 24 + 24 + 18 = 66 configurações", () => {
  const cfgs = gerarConfigs(GRADE_PADRAO);
  assert.equal(cfgs.length, 66);
  const por = (a) => cfgs.filter((c) => c.algo === a).length;
  assert.equal(por("q"), 24); assert.equal(por("sarsa"), 24); assert.equal(por("mc"), 18);
  assert.equal(cfgs.filter((c) => c.algo === "mc" && c.passo === "media").length, 6);
  assert.ok(cfgs.filter((c) => c.algo === "mc").every((c) => c.nEp === 60000));
  assert.ok(cfgs.filter((c) => c.algo !== "mc").every((c) => c.nEp === 30000 && c.alpha > 0));
  assert.equal(new Set(cfgs.map((c) => JSON.stringify(c))).size, 66);
  assert.equal(tarefasBusca({}, cfgs, 10).length, 660);
  assert.equal(gerarConfigs({ ...GRADE_PADRAO, mc: { ...GRADE_PADRAO.mc, ativo: false } }).length, 48);
});

test("mini-busca: agregação, melhor de cada algoritmo, ordenação e CSV com todas as configurações", () => {
  const env = criarAmbiente(), nSem = 2;
  const grade = { q: { ativo: true, alpha: [0.1, 0.5], eps0: [1], gamma: [0.95], nEp: 3000 }, sarsa: { ativo: false, alpha: [], eps0: [], gamma: [], nEp: 1 },
    mc: { ativo: true, alpha: ["media", 0.1], eps0: [0.5], gamma: [0.95], nEp: 3000 } };
  const cfgs = gerarConfigs(grade); assert.equal(cfgs.length, 4);
  const tarefas = tarefasBusca(env.opts, cfgs, nSem);
  const res = tarefas.map((t) => executarSemente(env, t.cfg, t.seed, { nEpAval: 300, ...t.opcoes }));
  assert.ok(res.every((r) => r.pi === undefined && r.curva === undefined), "modo leve não devolve política nem curva");
  const linhas = linhasBusca(cfgs, res, nSem);
  assert.equal(linhas.length, 4); assert.ok(linhas.every((l) => l.n === nSem && Number.isFinite(l.retornoDesc.media)));
  const mel = melhoresPorAlgoritmo(linhas);
  assert.deepEqual(Object.keys(mel).sort(), ["mc", "q"]);
  for (const a of ["q", "mc"]) assert.ok(linhas.filter((l) => l.cfg.algo === a).every((l) => l.retornoDesc.media <= mel[a].retornoDesc.media));
  const ord = ordenarLinhas(linhas, "desc", true); assert.ok(ord.every((l, i) => i === 0 || ord[i - 1].retornoDesc.media >= l.retornoDesc.media));
  const ordA = ordenarLinhas(linhas, "alpha", false); assert.ok(ordA.every((l, i) => i === 0 || (ordA[i - 1].cfg.alpha ?? 0) <= (l.cfg.alpha ?? 0)));
  const csv = csvBusca(linhas).split("\r\n").filter(Boolean);
  assert.equal(csv[0], "algoritmo,alpha,eps0,gamma,episodios,sementes,ret_desc,ret_desc_dp,retorno,sucesso,passos,melhor");
  assert.equal(csv.length, 1 + 4); assert.ok(csv.some((l) => l.startsWith("Monte Carlo,média,")));
  assert.equal(csv.filter((l) => l.endsWith(",sim")).length, 2);
  assert.equal(csvBuscaSementes(linhas).split("\r\n").filter(Boolean).length, 1 + 4 * nSem);
});

test("sensibilidade: lista padrão, tarefas e mudança da rota ótima entre −10 e −15", () => {
  assert.deepEqual(PENALIDADES_PADRAO, [-10, -15, -20, -30, -60]);
  assert.deepEqual(ordenarPenalidades([-60, -10, -15, -10]), [-10, -15, -60]);
  const tv = tarefasSensibilidade({ mapa: undefined }, PENALIDADES_PADRAO, { soVI: true });
  assert.equal(tv.length, 5); assert.ok(tv.every((t) => t.cfg.algo === "vi"));
  assert.equal(tarefasSensibilidade({}, PENALIDADES_PADRAO, { nSem: 5 }).length, 5 * 2 * 5);
  const base = criarAmbiente().opts;
  const tarefas = tarefasSensibilidade(base, PENALIDADES_PADRAO, { soVI: true });
  const res = tarefas.map((t) => resolverVI(criarAmbiente(t.env), 0.99, { perfil: 1500, nEpAval: 500 }));
  const linhas = linhasSensibilidade(PENALIDADES_PADRAO, agruparSensibilidade(tarefas, res));
  assert.equal(linhas.length, 5);
  assert.ok(Math.abs(linhas[0].v0 - 161.93) < 0.01, `V*(s0) com −10 = ${linhas[0].v0}`);
  for (const l of linhas.slice(1)) assert.ok(Math.abs(l.v0 - 159.158) < 0.001, `V*(s0) com ${l.penalidade} = ${l.v0}`);
  assert.ok(linhas[0].passosDestrocos.media > 0.9 && linhas[1].passosDestrocos.media === 0);
  const m = mudancaDeRota(linhas);
  assert.deepEqual([m.muda, m.de, m.para, m.deCruza], [true, -10, -15, true]);
  assert.equal(mudancaDeRota(linhas.slice(1)).muda, false);
  assert.equal(mudancaDeRota([]), null);
  const csv = csvSensibilidade(linhas).split("\r\n").filter(Boolean);
  assert.equal(csv.length, 6); assert.match(csv[1], /^-10,Iteração de Valor,1,161\.9\d*,1,/);
});

test("sensibilidade com Q-learning e Sarsa (curto): perfil de risco por semente é agregado com IC", () => {
  const env = criarAmbiente(), tarefas = tarefasSensibilidade(env.opts, [-10, -60], { nSem: 2 });
  const res = tarefas.map((t) => executarSemente(criarAmbiente(t.env), { ...t.cfg, nEp: 2000 }, t.seed, { nEpAval: 200, ...t.opcoes, perfil: 200 }));
  const linhas = linhasSensibilidade([-10, -60], agruparSensibilidade(tarefas, res));
  assert.equal(linhas.length, 4); assert.ok(linhas.every((l) => l.n === 2 && l.passosDestrocos.ic95 >= 0 && l.algo !== "vi"));
});
