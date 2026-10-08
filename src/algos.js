// Algoritmos tabulares / Tabular algorithms (Sutton & Barto, 2ª ed.):
//   cap. 4: Iteração de Valor e Iteração de Política (usam o modelo P)
//   cap. 5: Monte Carlo on-policy ε-soft, first-visit
//   cap. 6: Q-learning (off-policy) e Sarsa (on-policy)
import { makeRng } from "./rng.js";

// ------------------------------------------------------------ cap. 4 — programação dinâmica
const qSA = (env, V, s, a, gamma) => {  // soma na mesma ordem do Python para reproduzir os números
  const base = (s * env.nA + a) * env.K, n = env.nOut[s * env.nA + a];
  let acc = 0;
  for (let k = 0; k < n; k++) acc += env.prob[base + k] * (env.rec[base + k] + gamma * V[env.prox[base + k]] * (env.term[base + k] ? 0 : 1));
  return acc;
};
const argmax = (arr) => { let b = 0; for (let i = 1; i < arr.length; i++) if (arr[i] > arr[b]) b = i; return b; }; // 1º máximo, como np.argmax

export function iteracaoValor(env, gamma = 0.99, theta = 1e-10, maxIt = 100000) {
  const V = new Float64Array(env.nS); let it = 0;
  for (; it < maxIt; it++) {
    let delta = 0;
    for (let s = 0; s < env.nS; s++) {
      let m = -Infinity;
      for (let a = 0; a < env.nA; a++) m = Math.max(m, qSA(env, V, s, a, gamma));
      delta = Math.max(delta, Math.abs(m - V[s])); V[s] = m;
    }
    if (delta < theta) { it++; break; }
  }
  const pi = new Int32Array(env.nS), Q = new Float64Array(env.nS * env.nA);
  for (let s = 0; s < env.nS; s++) {
    const q = [0, 1, 2, 3].map((a) => qSA(env, V, s, a, gamma));
    for (let a = 0; a < env.nA; a++) Q[s * env.nA + a] = q[a];
    pi[s] = argmax(q);
  }
  return { V, pi, Q, varreduras: it };
}

export function iteracaoPolitica(env, gamma = 0.99, theta = 1e-10) {
  const pi = new Int32Array(env.nS), V = new Float64Array(env.nS); let rodadas = 0;
  for (;;) {
    rodadas++;
    for (;;) {                                   // avaliação da política (varreduras no próprio vetor V)
      let delta = 0;
      for (let s = 0; s < env.nS; s++) { const v = qSA(env, V, s, pi[s], gamma); delta = Math.max(delta, Math.abs(v - V[s])); V[s] = v; }
      if (delta < theta) break;
    }
    let estavel = true;                          // melhoria gulosa da política
    for (let s = 0; s < env.nS; s++) {
      const q = [0, 1, 2, 3].map((a) => qSA(env, V, s, a, gamma)), melhor = argmax(q);
      if (q[melhor] > q[pi[s]] + 1e-12) { pi[s] = melhor; estavel = false; }
    }
    if (estavel) return { V, pi, rodadas };
  }
}

// ------------------------------------------------------------ simulação a partir de env.P
export function criarSimulador(env) {
  const { nS, nA, K } = env, cum = new Float64Array(nS * nA * K);
  for (let sa = 0; sa < nS * nA; sa++) {
    let c = 0; const n = env.nOut[sa];
    for (let k = 0; k < K; k++) { if (k < n) { c += env.prob[sa * K + k]; cum[sa * K + k] = c; } else cum[sa * K + k] = 1; }
    cum[sa * K + n - 1] = 1;                     // o último desfecho válido fecha em 1
  }
  const out = { s2: 0, r: 0, f: false };
  const passo = (s, a, u) => {
    const base = (s * nA + a) * K; let k = 0;
    while (u > cum[base + k]) k++;
    out.s2 = env.prox[base + k]; out.r = env.rec[base + k]; out.f = env.term[base + k] === 1;
    return out;
  };
  return { passo };
}

export const politicaGulosa = (Q, nS, nA) => {
  const pi = new Int32Array(nS);
  for (let s = 0; s < nS; s++) { let b = 0; for (let a = 1; a < nA; a++) if (Q[s * nA + a] > Q[s * nA + b]) b = a; pi[s] = b; }
  return pi;
};

export const epsLinear = (ep, nEp, eps0, epsMin) => Math.max(epsMin, eps0 - ((eps0 - epsMin) * ep) / Math.max(1, 0.5 * nEp));

function acaoEps(Q, s, nA, eps, rng) {
  if (rng.random() < eps) return rng.randint(nA);
  let m = -Infinity, n = 0;
  for (let a = 0; a < nA; a++) { const q = Q[s * nA + a]; if (q > m) { m = q; n = 1; } else if (q === m) n++; }
  let k = rng.randint(n);
  for (let a = 0; a < nA; a++) if (Q[s * nA + a] === m) { if (k === 0) return a; k--; }
  return 0;
}

// ------------------------------------------------------------ cap. 6 — Q-learning e Sarsa
// onProgress(ep, retornos, sucessos) é chamado a cada `cada` episódios; devolver true interrompe o treino.
export function qLearning(env, { nEp = 30000, alpha = 0.1, gamma = 0.99, eps0 = 1.0, epsMin = 0.05, seed = 0, maxPassos = 200, sarsa = false, onProgress = null, cada = 500 } = {}) {
  const rng = makeRng(seed), sim = criarSimulador(env), { nS, nA, s0 } = env;
  const Q = new Float64Array(nS * nA), retornos = new Float32Array(nEp), sucesso = new Uint8Array(nEp);
  let feitos = 0;
  for (let ep = 0; ep < nEp; ep++) {
    const eps = epsLinear(ep, nEp, eps0, epsMin);
    let s = s0, a = acaoEps(Q, s, nA, eps, rng), G = 0, t = 0, fim = false;
    for (;;) {
      const { s2, r, f } = sim.passo(s, a, rng.random()); G += r; t++; fim = f;
      const a2 = acaoEps(Q, s2, nA, eps, rng);
      let alvo;
      if (f) alvo = r;
      else if (sarsa) alvo = r + gamma * Q[s2 * nA + a2];          // Sarsa: usa a ação que de fato será tomada
      else { let m = -Infinity; for (let b = 0; b < nA; b++) m = Math.max(m, Q[s2 * nA + b]); alvo = r + gamma * m; } // Q-learning: máximo
      Q[s * nA + a] += alpha * (alvo - Q[s * nA + a]); s = s2; a = a2;
      if (f || t >= maxPassos) break;
    }
    retornos[ep] = G; sucesso[ep] = fim ? 1 : 0; feitos = ep + 1;
    if (onProgress && feitos % cada === 0 && onProgress(feitos, retornos, sucesso)) break;
  }
  return { Q, retornos: retornos.subarray(0, feitos), sucesso: sucesso.subarray(0, feitos) };
}

// ------------------------------------------------------------ cap. 5 — Monte Carlo on-policy ε-soft (first-visit)
// alpha = null → média amostral (1/N); número → passo constante.
export function monteCarlo(env, { nEp = 60000, gamma = 0.99, eps0 = 1.0, epsMin = 0.05, alpha = null, seed = 0, maxPassos = 200, onProgress = null, cada = 500 } = {}) {
  const rng = makeRng(seed), sim = criarSimulador(env), { nS, nA, s0 } = env;
  const Q = new Float64Array(nS * nA), N = new Float64Array(nS * nA), visto = new Int32Array(nS * nA);
  const retornos = new Float32Array(nEp), sucesso = new Uint8Array(nEp);
  const ts = new Int32Array(maxPassos), ta = new Int32Array(maxPassos), tr = new Float64Array(maxPassos), ret = new Float64Array(maxPassos);
  let feitos = 0;
  for (let ep = 0; ep < nEp; ep++) {
    const eps = epsLinear(ep, nEp, eps0, epsMin);
    let s = s0, t = 0, fim = false, total = 0;
    for (;;) {                                                  // geramos o episódio com a política ε-gulosa atual
      const a = acaoEps(Q, s, nA, eps, rng), { s2, r, f } = sim.passo(s, a, rng.random());
      ts[t] = s; ta[t] = a; tr[t] = r; total += r; t++; s = s2; fim = f;
      if (f || t >= maxPassos) break;
    }
    let G = 0;
    for (let k = t - 1; k >= 0; k--) { G = tr[k] + gamma * G; ret[k] = G; }   // retornos de trás para frente
    for (let k = 0; k < t; k++) {                                              // primeira visita de cada (s,a)
      const i = ts[k] * nA + ta[k];
      if (visto[i] === ep + 1) continue;
      visto[i] = ep + 1; N[i] += 1;
      Q[i] += (alpha === null ? 1 / N[i] : alpha) * (ret[k] - Q[i]);
    }
    retornos[ep] = total; sucesso[ep] = fim ? 1 : 0; feitos = ep + 1;
    if (onProgress && feitos % cada === 0 && onProgress(feitos, retornos, sucesso)) break;
  }
  return { Q, retornos: retornos.subarray(0, feitos), sucesso: sucesso.subarray(0, feitos) };
}

// ------------------------------------------------------------ avaliação e perfil de risco da política
export function avaliar(env, politica, { nEp = 1000, maxPassos = 100, gammaAv = 0.99, seed = 12345 } = {}) {
  const rng = makeRng(seed), sim = criarSimulador(env);
  let G = 0, Gd = 0, suc = 0, pas = 0;
  for (let ep = 0; ep < nEp; ep++) {
    let s = env.s0, t = 0, fator = 1;
    for (;;) {
      const { s2, r, f } = sim.passo(s, politica[s], rng.random()); G += r; Gd += fator * r; fator *= gammaAv; t++; s = s2;
      if (f || t >= maxPassos) { if (f) suc++; break; }
    }
    pas += t;
  }
  return { retorno: G / nEp, retornoDesc: Gd / nEp, sucesso: suc / nEp, passos: pas / nEp };
}

export function perfilRota(env, politica, { nEp = 3000, maxPassos = 100, seed = 77 } = {}) {
  const rng = makeRng(seed), sim = criarSimulador(env);
  let tocou = 0, nd = 0, nc = 0, suc = 0;
  for (let ep = 0; ep < nEp; ep++) {
    let s = env.s0, t = 0, d = 0;
    for (;;) {
      const { s2, f } = sim.passo(s, politica[s], rng.random()); s = s2; t++;
      if (env.emDestrocos[s]) d++;
      if (env.naCorrenteza[s]) nc++;
      if (f || t >= maxPassos) { if (f) suc++; break; }
    }
    nd += d; tocou += d > 0 ? 1 : 0;
  }
  return { tocamDestrocos: tocou / nEp, passosDestrocos: nd / nEp, passosCorrenteza: nc / nEp, sucesso: suc / nEp };
}

// Caminho (lista de estados) de um episódio seguindo a política; útil para animar a rota. / One episode path for animation.
export function rotaDe(env, politica, { seed = 3, maxPassos = 100 } = {}) {
  const rng = makeRng(seed), sim = criarSimulador(env); let s = env.s0; const estados = [s], recompensas = [];
  for (let t = 0; t < maxPassos; t++) {
    const { s2, r, f } = sim.passo(s, politica[s], rng.random()); s = s2; estados.push(s); recompensas.push(r);
    if (f) break;
  }
  return { estados, recompensas };
}
