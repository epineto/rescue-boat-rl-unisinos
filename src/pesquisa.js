// Lógica pura (sem DOM) da sensibilidade à penalidade e da busca de hiperparâmetros; testada em Node.
// Pure (DOM-free) logic for the debris-penalty sensitivity and the hyperparameter search; tested in Node.
import { estatisticas, SEMENTE_BASE } from './experimentos.js';
import { paraCSV } from './ui/csv.js';

// ------------------------------------------------------------ leitura de listas digitadas
// Aceita separadores ";" ou espaço e também "," quando seguida de espaço ou de sinal ("-10, -15", "-10,-15");
// uma vírgula entre dígitos é decimal ("0,05"). O sinal "−" (U+2212) vale como "-".
// Devolve { valores, ignorados } — `ignorados` lista os textos que não viraram número válido.
export function lerLista(texto, { min = -Infinity, max = Infinity, inteiro = false, aceitaMedia = false } = {}) {
  const valores = [], ignorados = [];
  const fichas = String(texto ?? '').replace(/−/g, '-').replace(/,(?=\s|-)/g, ';').split(/[;\s]+/).filter(Boolean);
  for (const f of fichas) {
    if (aceitaMedia && /^(m[eé]dia|media|mean|average|avg|1\/n)$/i.test(f)) { if (!valores.includes('media')) valores.push('media'); continue; }
    const v = Number(f.replace(',', '.'));
    if (!/^[-+]?(\d+([.,]\d*)?|[.,]\d+)$/.test(f) || !Number.isFinite(v) || v < min || v > max || (inteiro && !Number.isInteger(v))) { ignorados.push(f); continue; }
    if (!valores.includes(v)) valores.push(v);
  }
  return { valores, ignorados };
}

const r6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const NOME_ALGO = { vi: 'Iteração de Valor', q: 'Q-learning', sarsa: 'Sarsa', mc: 'Monte Carlo' };
export const nomeAlgoCsv = (id) => NOME_ALGO[id] || id;

// ============================================================ sensibilidade à penalidade dos destroços
export const PENALIDADES_PADRAO = [-10, -15, -20, -30, -60];
export const CFG_SENS = { alpha: 0.1, eps0: 1, gamma: 0.99, nEp: 30000 };   // Q-learning e Sarsa (como o notebook)
export const SEMENTE_SENS = 500;                                             // sementes 500 + k (como o notebook)
export const N_AVAL_SENS = 1500;                                             // episódios de avaliação e de perfil (como o notebook)
export const LIMIAR_CRUZA = 0.5;                                             // "cruza os destroços": ≥ 50% dos episódios tocam os destroços

// Penalidades em ordem crescente de módulo (−10, −15, …), sem repetição.
export const ordenarPenalidades = (pens) => [...new Set(pens)].sort((a, b) => Math.abs(a) - Math.abs(b));

// Tarefas do pool: a Iteração de Valor de cada penalidade (`soVI`) ou o treino de Q-learning/Sarsa (N sementes por penalidade).
// `envBase` são as opções do ambiente (inclui o mapa); a penalidade é sobrescrita.
export function tarefasSensibilidade(envBase, penalidades, { nSem = 5, soVI = false } = {}) {
  const tarefas = [];
  for (const pen of penalidades) {
    const env = { ...envBase, rDestrocos: pen };
    if (soVI) { tarefas.push({ env, cfg: { algo: 'vi', gamma: 0.99 }, seed: 0, nEpAval: N_AVAL_SENS, opcoes: { perfil: N_AVAL_SENS }, peso: 1, rotulo: { pen, algo: 'vi' } }); continue; }
    for (const algo of ['q', 'sarsa']) for (let k = 0; k < nSem; k++) {
      tarefas.push({ env, cfg: { algo, ...CFG_SENS }, seed: SEMENTE_SENS + k, nEpAval: N_AVAL_SENS, opcoes: { perfil: N_AVAL_SENS, leve: true, deslocAval: 1 }, peso: CFG_SENS.nEp, rotulo: { pen, algo } });
    }
  }
  return tarefas;
}

// Junta resultados (na ordem de `tarefas`) em { [algo]: { [pen]: [resultados] } }.
export function agruparSensibilidade(tarefas, resultados) {
  const g = {};
  tarefas.forEach((t, i) => { const { pen, algo } = t.rotulo; ((g[algo] ??= {})[pen] ??= []).push(resultados[i]); });
  return g;
}

// Linhas da tabela: uma por (penalidade, algoritmo), em ordem de penalidade e depois vi, q, sarsa.
export function linhasSensibilidade(penalidades, grupos) {
  const linhas = [];
  for (const pen of ordenarPenalidades(penalidades)) for (const algo of ['vi', 'q', 'sarsa']) {
    const rs = grupos[algo] && grupos[algo][pen];
    if (!rs || !rs.length) continue;
    const col = (f) => estatisticas(rs.map(f));
    linhas.push({
      penalidade: pen, algo, n: rs.length, v0: algo === 'vi' ? rs[0].v0 : null,
      tocam: col((r) => r.perfil.tocamDestrocos), passosDestrocos: col((r) => r.perfil.passosDestrocos),
      passosCorrenteza: col((r) => r.perfil.passosCorrenteza), retornoDesc: col((r) => r.aval.retornoDesc), sucesso: col((r) => r.aval.sucesso)
    });
  }
  return linhas;
}

// Em que penalidade a rota ÓTIMA (Iteração de Valor) muda de "cruzar os destroços" para "contornar"?
// Devolve { muda, de, para, deCruza } (primeira mudança, penalidades por módulo crescente) ou { muda: false, cruza }.
export function mudancaDeRota(linhas) {
  const vi = linhas.filter((l) => l.algo === 'vi');
  if (!vi.length) return null;
  const cruza = vi.map((l) => l.tocam.media >= LIMIAR_CRUZA);
  for (let i = 0; i + 1 < vi.length; i++) {
    if (cruza[i] !== cruza[i + 1]) return { muda: true, de: vi[i].penalidade, para: vi[i + 1].penalidade, deCruza: cruza[i], passosDe: vi[i].passosDestrocos.media, passosPara: vi[i + 1].passosDestrocos.media };
  }
  return { muda: false, cruza: cruza[0], passos: vi[0].passosDestrocos.media, so1: vi.length === 1 };
}

export function csvSensibilidade(linhas) {
  const cab = ['penalidade', 'algoritmo', 'sementes', 'v0_otimo', 'tocam_destrocos', 'passos_destrocos', 'ic95_passos_destrocos', 'passos_correnteza', 'ic95_passos_correnteza', 'retorno_desc', 'ic95_retorno_desc', 'sucesso'];
  return paraCSV(cab, linhas.map((l) => [l.penalidade, nomeAlgoCsv(l.algo), l.n, l.v0 === null ? '' : r6(l.v0), r6(l.tocam.media), r6(l.passosDestrocos.media), r6(l.passosDestrocos.ic95),
    r6(l.passosCorrenteza.media), r6(l.passosCorrenteza.ic95), r6(l.retornoDesc.media), r6(l.retornoDesc.ic95), r6(l.sucesso.media)]));
}

// ============================================================ busca de hiperparâmetros
export const ORDEM_ALGOS = ['q', 'sarsa', 'mc'];
// Grade da pesquisa: Q-learning e Sarsa 4×3×2 = 24 cada; Monte Carlo 3×3×2 = 18 (α "media" = média amostral 1/N); total 66.
export const GRADE_PADRAO = {
  q: { ativo: true, alpha: [0.05, 0.1, 0.2, 0.5], eps0: [1, 0.5, 0.2], gamma: [0.95, 0.99], nEp: 30000 },
  sarsa: { ativo: true, alpha: [0.05, 0.1, 0.2, 0.5], eps0: [1, 0.5, 0.2], gamma: [0.95, 0.99], nEp: 30000 },
  mc: { ativo: true, alpha: ['media', 0.05, 0.1], eps0: [1, 0.5, 0.2], gamma: [0.95, 0.99], nEp: 60000 }
};
export const N_AVAL_BUSCA = 1000, SEMENTES_BUSCA = 10, SEMENTES_RAPIDO = 3, MAX_CONFIGS = 600;

// Lista de configurações (Monte Carlo primeiro: são as mais demoradas, o que equilibra melhor os workers).
export function gerarConfigs(grade) {
  const cfgs = [];
  for (const algo of ['mc', 'q', 'sarsa']) {
    const g = grade[algo];
    if (!g || !g.ativo) continue;
    for (const a of g.alpha) for (const e of g.eps0) for (const gm of g.gamma) {
      const media = a === 'media';
      cfgs.push({ algo, passo: algo === 'mc' ? (media ? 'media' : 'const') : undefined, alpha: media ? null : a, eps0: e, gamma: gm, nEp: g.nEp });
    }
  }
  return cfgs;
}

export const tarefasBusca = (envOpts, cfgs, nSem) => {
  const t = [];
  cfgs.forEach((cfg, i) => { for (let k = 0; k < nSem; k++) t.push({ env: envOpts, cfg, seed: SEMENTE_BASE + k, nEpAval: N_AVAL_BUSCA, opcoes: { leve: true, deslocAval: 1 }, peso: cfg.nEp, rotulo: { i } }); });
  return t;
};

// Uma linha por configuração (ordem de `cfgs`); `resultados` vem na ordem de `tarefasBusca`.
export function linhasBusca(cfgs, resultados, nSem) {
  return cfgs.map((cfg, i) => {
    const rs = resultados.slice(i * nSem, (i + 1) * nSem), col = (f) => estatisticas(rs.map(f));
    return { id: i, cfg, n: rs.length, retornoDesc: col((r) => r.aval.retornoDesc), retorno: col((r) => r.aval.retorno), sucesso: col((r) => r.aval.sucesso), passos: col((r) => r.aval.passos), sementes: rs };
  });
}

// Melhor de cada algoritmo: maior retorno descontado médio; desempate pela taxa de sucesso (mesmo critério do notebook).
export function melhoresPorAlgoritmo(linhas) {
  const m = {};
  for (const l of linhas) {
    const a = l.cfg.algo, b = m[a];
    if (!b || l.retornoDesc.media > b.retornoDesc.media || (l.retornoDesc.media === b.retornoDesc.media && l.sucesso.media > b.sucesso.media)) m[a] = l;
  }
  return m;
}

// Ordenação da tabela por coluna: 'algo' | 'alpha' | 'eps0' | 'gamma' | 'nEp' | 'desc' | 'dp' | 'sucesso' | 'passos' | 'retorno'.
const VALOR = {
  algo: (l) => ORDEM_ALGOS.indexOf(l.cfg.algo), alpha: (l) => (l.cfg.alpha === null ? 0 : l.cfg.alpha), eps0: (l) => l.cfg.eps0, gamma: (l) => l.cfg.gamma, nEp: (l) => l.cfg.nEp,
  desc: (l) => l.retornoDesc.media, dp: (l) => l.retornoDesc.dp, sucesso: (l) => l.sucesso.media, passos: (l) => l.passos.media, retorno: (l) => l.retorno.media
};
export function ordenarLinhas(linhas, coluna, decrescente) {
  const f = VALOR[coluna] || VALOR.desc, s = decrescente ? -1 : 1;
  return [...linhas].sort((a, b) => s * (f(a) - f(b)) || ORDEM_ALGOS.indexOf(a.cfg.algo) - ORDEM_ALGOS.indexOf(b.cfg.algo) || b.retornoDesc.media - a.retornoDesc.media || a.id - b.id);
}

const alphaCsv = (c) => (c.alpha === null ? 'média' : c.alpha);

// Equivalente ao busca_hiperparametros.csv do notebook (+ episódios, sementes e marca do melhor).
export function csvBusca(linhas) {
  const melhores = melhoresPorAlgoritmo(linhas), ordem = [...linhas].sort((a, b) => ORDEM_ALGOS.indexOf(a.cfg.algo) - ORDEM_ALGOS.indexOf(b.cfg.algo) || b.retornoDesc.media - a.retornoDesc.media || b.sucesso.media - a.sucesso.media);
  return paraCSV(['algoritmo', 'alpha', 'eps0', 'gamma', 'episodios', 'sementes', 'ret_desc', 'ret_desc_dp', 'retorno', 'sucesso', 'passos', 'melhor'],
    ordem.map((l) => [nomeAlgoCsv(l.cfg.algo), alphaCsv(l.cfg), l.cfg.eps0, l.cfg.gamma, l.cfg.nEp, l.n, r6(l.retornoDesc.media), r6(l.retornoDesc.dp), r6(l.retorno.media), r6(l.sucesso.media), r6(l.passos.media), melhores[l.cfg.algo] === l ? 'sim' : '']));
}

// Equivalente ao busca_por_semente.csv.
export function csvBuscaSementes(linhas) {
  const rows = [];
  for (const l of linhas) l.sementes.forEach((r) => rows.push([nomeAlgoCsv(l.cfg.algo), alphaCsv(l.cfg), l.cfg.eps0, l.cfg.gamma, l.cfg.nEp, r.seed, r6(r.aval.retornoDesc), r6(r.aval.retorno), r6(r.aval.sucesso), r6(r.aval.passos)]));
  return paraCSV(['algoritmo', 'alpha', 'eps0', 'gamma', 'episodios', 'semente', 'retorno_desc', 'retorno', 'sucesso', 'passos'], rows);
}
