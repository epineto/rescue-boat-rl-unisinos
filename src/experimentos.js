// Experimentos com várias sementes: funções puras (sem DOM), usadas pelo worker/pool e testadas em Node.
// Multi-seed experiments: pure functions (no DOM), used by the worker/pool and tested in Node.
import { qLearning, monteCarlo, politicaGulosa, avaliar, iteracaoValor, perfilRota } from './algos.js';

// Melhores configurações da pesquisa (relatório). `passo: 'media'` = média amostral (1/N); 'const' usa `alpha`.
export const CONFIG_PESQUISA = {
  mc: { algo: 'mc', passo: 'media', alpha: 0.1, eps0: 0.5, gamma: 0.95, nEp: 60000 },
  q: { algo: 'q', alpha: 0.1, eps0: 1, gamma: 0.95, nEp: 30000 },
  sarsa: { algo: 'sarsa', alpha: 0.2, eps0: 1, gamma: 0.99, nEp: 30000 }
};
export const SEMENTE_BASE = 9000;   // mesma convenção do notebook: 9000 + k

// ------------------------------------------------------------ estatística
// IC95 = 1,96·dp/√n (dp amostral, n−1), como no relatório. Com n = 1 o intervalo é 0.
export function estatisticas(xs) {
  const n = xs.length;
  if (n === 0) return { n: 0, media: NaN, dp: NaN, ic95: NaN };
  let soma = 0; for (let i = 0; i < n; i++) soma += xs[i];
  const media = soma / n;
  let ss = 0; for (let i = 0; i < n; i++) ss += (xs[i] - media) ** 2;
  const dp = n > 1 ? Math.sqrt(ss / (n - 1)) : 0;
  return { n, media, dp, ic95: n > 1 ? (1.96 * dp) / Math.sqrt(n) : 0 };
}

// ------------------------------------------------------------ uma execução (uma semente)
// Treina com a configuração `cfg` ({algo, alpha, passo, eps0, gamma, nEp}) e devolve a Q e as séries por episódio.
export function treinar(env, cfg, seed, extra = {}) {
  const base = { nEp: cfg.nEp, gamma: cfg.gamma, eps0: cfg.eps0, seed, ...extra };
  if (cfg.algo === 'mc') return monteCarlo(env, { ...base, alpha: cfg.passo === 'const' ? cfg.alpha : null });
  return qLearning(env, { ...base, alpha: cfg.alpha, sarsa: cfg.algo === 'sarsa' });
}

// Curva de aprendizado amostrada: média das últimas `w` observações em `pontos` episódios espaçados em escala log.
export function curvaAmostrada(retornos, sucesso, pontos = 60) {
  const n = retornos.length, w = Math.max(50, Math.floor(n / 100));
  if (n < w) return { x: [], ret: [], suc: [] };
  const alvo = new Set();
  for (let k = 0; k < pontos; k++) alvo.add(Math.round(10 ** (Math.log10(w) + ((Math.log10(n) - Math.log10(w)) * k) / Math.max(1, pontos - 1))));
  const x = [...alvo].sort((a, b) => a - b), ret = [], suc = [];
  for (const e of x) {
    let sr = 0, ss = 0; for (let i = e - w; i < e; i++) { sr += retornos[i]; ss += sucesso[i]; }
    ret.push(sr / w); suc.push(ss / w);
  }
  return { x, ret, suc };
}

// Executa e avalia uma semente. `onFrac(f)` (opcional) recebe a fração concluída do treino (0..1).
// Opções: `deslocAval` (a avaliação usa a semente `seed + deslocAval`; padrão 5, como nos experimentos finais do notebook),
// `perfil` (nº de episódios do perfilRota da política gulosa; 0 = não calcula) e `leve` (não devolve a política nem a curva).
export function executarSemente(env, cfg, seed, { nEpAval = 2000, pontos = 60, onFrac = null, deslocAval = 5, perfil = 0, leve = false } = {}) {
  const cada = Math.max(100, Math.floor(cfg.nEp / 40));
  const res = treinar(env, cfg, seed, { cada, onProgress: onFrac ? (ep) => { onFrac(ep / cfg.nEp); return false; } : null });
  const pi = politicaGulosa(res.Q, env.nS, env.nA);
  const aval = avaliar(env, pi, { nEp: nEpAval, seed: seed + deslocAval });
  const out = { algo: cfg.algo, seed, aval };
  if (perfil > 0) out.perfil = perfilRota(env, pi, { nEp: perfil });
  if (!leve) { out.pi = pi; out.curva = curvaAmostrada(res.retornos, res.sucesso, pontos); }
  return out;
}

// Iteração de Valor como "tarefa" do pool: V*(s0), política ótima e, opcionalmente, o perfil de risco da rota ótima.
export function resolverVI(env, gamma = 0.99, { perfil = 3000, nEpAval = 1500 } = {}) {
  const vi = iteracaoValor(env, gamma);
  const out = { algo: 'vi', v0: vi.V[env.s0], varreduras: vi.varreduras };
  if (perfil > 0) out.perfil = perfilRota(env, vi.pi, { nEp: perfil });
  out.aval = avaliar(env, vi.pi, { nEp: nEpAval });
  return out;
}

// ------------------------------------------------------------ agregação entre sementes
export function agregar(resultados) {
  const col = (f) => estatisticas(resultados.map(f));
  const out = {
    n: resultados.length,
    retornoDesc: col((r) => r.aval.retornoDesc), retorno: col((r) => r.aval.retorno),
    sucesso: col((r) => r.aval.sucesso), passos: col((r) => r.aval.passos),
    curva: null, representativa: -1
  };
  if (!resultados.length) return out;
  // semente representativa: a de retorno descontado mais próximo da média (desempate: menor índice)
  let melhor = 0, dist = Infinity;
  resultados.forEach((r, i) => { const d = Math.abs(r.aval.retornoDesc - out.retornoDesc.media); if (d < dist) { dist = d; melhor = i; } });
  out.representativa = melhor;
  const x = resultados[0].curva.x, serie = (campo) => x.map((_, i) => estatisticas(resultados.map((r) => r.curva[campo][i])));
  const ret = serie('ret'), suc = serie('suc');
  out.curva = { x, ret: ret.map((e) => e.media), retIc: ret.map((e) => e.ic95), suc: suc.map((e) => e.media), sucIc: suc.map((e) => e.ic95) };
  return out;
}

// Versão síncrona (Node/testes): roda `nSementes` sementes e agrega.
export function rodarVariasSementes(env, cfg, nSementes, { sementeBase = SEMENTE_BASE, nEpAval = 2000, pontos = 60 } = {}) {
  const resultados = [];
  for (let k = 0; k < nSementes; k++) resultados.push(executarSemente(env, cfg, sementeBase + k, { nEpAval, pontos }));
  return { resultados, ...agregar(resultados) };
}

// Linhas da tabela comparativa (também usadas no CSV). `vi` = { v0, aval } da Iteração de Valor.
export function linhasTabela(vi, agregados) {
  const linhas = [{ id: 'vi', n: 1, desc: vi.v0, ic95: 0, dif: 0, retorno: vi.aval.retorno, sucesso: vi.aval.sucesso, passos: vi.aval.passos }];
  for (const [id, ag] of agregados) {
    linhas.push({ id, n: ag.n, desc: ag.retornoDesc.media, ic95: ag.retornoDesc.ic95, dif: ag.retornoDesc.media - vi.v0,
      retorno: ag.retorno.media, sucesso: ag.sucesso.media, passos: ag.passos.media });
  }
  return linhas;
}
