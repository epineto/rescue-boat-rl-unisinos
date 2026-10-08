// Ambiente "Barco de resgate em área alagada" como MDP tabular finito, idêntico ao RescueBoatEnv do notebook Python.
// Environment "Flood rescue boat" as a finite tabular MDP, identical to the Python RescueBoatEnv of the notebook.
//
// Estado s = (linha, coluna do barco, situação das pessoas): 0 ilhada · 1 a bordo · 2 salva (no máx. `capacidade` a bordo).
// Codificação: s = idxCelula * nSituacoes + idxSituacao (mesma ordem do Python), ações 0=N 1=S 2=L 3=O.

export const MAPA_PADRAO = ["P..P..", ".#..#P", "~~~~~~", "..xx..", ".#..#.", "..H..."];
export const DELTA = [[-1, 0], [1, 0], [0, 1], [0, -1]];
export const NOMES_ACOES = ["N", "S", "L", "O"];
const K = 2; // máximo de desfechos por (s,a): ação normal e arraste da correnteza

export function criarAmbiente(opts = {}) {
  const o = { mapa: MAPA_PADRAO, pCorr: 0.2, capacidade: 2, rPasso: -1, rDestrocos: -10, rPessoa: 50, rFinal: 100, ...opts };
  const nl = o.mapa.length, nc = o.mapa[0].length;
  const ch = (i, j) => o.mapa[i][j];
  const todas = [];
  for (let i = 0; i < nl; i++) for (let j = 0; j < nc; j++) todas.push([i, j]);
  const chave = (i, j) => i * nc + j;
  const conj = (c) => new Set(todas.filter(([i, j]) => ch(i, j) === c).map(([i, j]) => chave(i, j)));
  const bloqueios = conj("#"), corr = conj("~"), destrocos = conj("x");
  const abrigoPos = todas.find(([i, j]) => ch(i, j) === "H");
  const pessoas = todas.filter(([i, j]) => ch(i, j) === "P"); // ordem de leitura do mapa
  const nPes = pessoas.length;
  const celulas = todas.filter(([i, j]) => !bloqueios.has(chave(i, j)));
  const idxCel = new Map(celulas.map(([i, j], k) => [chave(i, j), k]));

  // situações possíveis: produto cartesiano em ordem lexicográfica, com no máximo `capacidade` a bordo
  const situacoes = [];
  const gera = (pref) => {
    if (pref.length === nPes) { if (pref.filter((x) => x === 1).length <= o.capacidade) situacoes.push(pref.slice()); return; }
    for (let v = 0; v < 3; v++) { pref.push(v); gera(pref); pref.pop(); }
  };
  gera([]);
  const idxSit = new Map(situacoes.map((e, k) => [e.join(","), k]));
  const nSit = situacoes.length, nS = celulas.length * nSit, nA = 4;
  const codifica = (cel, sit) => idxCel.get(chave(cel[0], cel[1])) * nSit + idxSit.get(sit.join(","));
  const decodifica = (s) => { const k = Math.floor(s / nSit); return { cel: celulas[k], sit: situacoes[s - k * nSit] }; };
  const s0 = codifica(abrigoPos, new Array(nPes).fill(0));

  const mover = (cel, d) => {
    const ni = cel[0] + d[0], nj = cel[1] + d[1];
    return ni < 0 || ni >= nl || nj < 0 || nj >= nc || bloqueios.has(chave(ni, nj)) ? cel : [ni, nj];
  };
  // efeitos do fim do passo na célula `nova`: destroços, embarque (respeita a capacidade), desembarque no abrigo e término
  const resultado = (sit, nova) => {
    let r = destrocos.has(chave(nova[0], nova[1])) ? o.rDestrocos : o.rPasso;
    const s = sit.slice();
    for (let i = 0; i < nPes; i++) {
      const aBordo = s.filter((x) => x === 1).length;
      if (pessoas[i][0] === nova[0] && pessoas[i][1] === nova[1] && s[i] === 0 && aBordo < o.capacidade) s[i] = 1;
    }
    if (nova[0] === abrigoPos[0] && nova[1] === abrigoPos[1]) for (let i = 0; i < nPes; i++) if (s[i] === 1) { s[i] = 2; r += o.rPessoa; }
    const fim = s.every((x) => x === 2);
    if (fim) r += o.rFinal;
    return { sit: s, r, fim };
  };

  // modelo P em arrays achatados: índice (s*nA + a)*K + k
  const prox = new Int32Array(nS * nA * K), prob = new Float64Array(nS * nA * K), rec = new Float64Array(nS * nA * K);
  const term = new Uint8Array(nS * nA * K), nOut = new Uint8Array(nS * nA);
  for (let s = 0; s < nS; s++) {
    const { cel, sit } = decodifica(s);
    for (let a = 0; a < nA; a++) {
      const base = (s * nA + a) * K;
      if (sit.every((x) => x === 2)) { prox[base] = s; prob[base] = 1; rec[base] = 0; term[base] = 1; nOut[s * nA + a] = 1; continue; }
      const saidas = corr.has(chave(cel[0], cel[1])) ? [[1 - o.pCorr, DELTA[a]], [o.pCorr, DELTA[1]]] : [[1, DELTA[a]]];
      const acum = new Map(); // junta desfechos idênticos, preservando a ordem de aparição (como o defaultdict do Python)
      for (const [p, d] of saidas) {
        const nova = mover(cel, d), res = resultado(sit, nova), s2 = codifica(nova, res.sit);
        const kk = `${s2}|${res.r}|${res.fim}`;
        if (acum.has(kk)) acum.get(kk).p += p; else acum.set(kk, { p, s2, r: res.r, f: res.fim });
      }
      let k = 0;
      for (const v of acum.values()) { prob[base + k] = v.p; prox[base + k] = v.s2; rec[base + k] = v.r; term[base + k] = v.f ? 1 : 0; k++; }
      nOut[s * nA + a] = k;
    }
  }
  const emDestrocos = new Uint8Array(nS), naCorrenteza = new Uint8Array(nS);
  for (let s = 0; s < nS; s++) { const { cel } = decodifica(s); emDestrocos[s] = destrocos.has(chave(cel[0], cel[1])) ? 1 : 0; naCorrenteza[s] = corr.has(chave(cel[0], cel[1])) ? 1 : 0; }

  return { opts: o, nl, nc, nS, nA, K, s0, celulas, situacoes, pessoas, abrigo: abrigoPos, nPes,
    bloqueios, corr, destrocos, chave, codifica, decodifica, prox, prob, rec, term, nOut, emDestrocos, naCorrenteza };
}

// Desfechos de (s,a) como lista [{p, s2, r, f}] — útil para testes e para a UI.
export function transicoes(env, s, a) {
  const base = (s * env.nA + a) * env.K, n = env.nOut[s * env.nA + a], out = [];
  for (let k = 0; k < n; k++) out.push({ p: env.prob[base + k], s2: env.prox[base + k], r: env.rec[base + k], f: !!env.term[base + k] });
  return out;
}

// Texto do estado (para depuração/aria-label). / Text rendering of a state.
export function renderTexto(env, s) {
  const { cel, sit } = env.decodifica(s);
  const g = env.opts.mapa.map((l) => l.split(""));
  env.pessoas.forEach((p, i) => { if (sit[i] !== 0) g[p[0]][p[1]] = p[0] === env.abrigo[0] && p[1] === env.abrigo[1] ? "H" : "."; });
  g[cel[0]][cel[1]] = "B";
  return g.map((l) => l.join("")).join("\n");
}
