// Trabalho pesado fora da thread principal (worker do tipo module). / Heavy work off the main thread (module worker).
//
// 1) Treino ao vivo (cartão "Treinar"). Entrada: { env, algo: 'q'|'sarsa'|'mc', alpha, passo, eps0, gamma, nEp, seed, cada, parar? }
//    `passo` (só MC): 'media' (média amostral) | 'const' (usa `alpha`).
//    `parar` (opcional): treina de novo, deterministicamente, só até esse episódio — usado para recuperar a Q
//    de um treino interrompido (o worker é encerrado, pois o laço é síncrono), sem emitir progresso.
//    algo 'ip' (Iteração de Política): { env, algo: 'ip', gamma } → { tipo: 'ip', pi, rodadas, dif, iguais, nS, v0, v0vi, ms }.
// 2) Tarefa do pool (cartão "Comparar"). Entrada: { cmd: 'tarefa', id, env, cfg, seed, nEpAval }
//    Saída: { tipo: 't-prog', id, frac } e { tipo: 't-fim', id, resultado }.
import { criarAmbiente } from './env.js';
import { qLearning, monteCarlo, iteracaoPolitica, iteracaoValor } from './algos.js';
import { executarSemente, resolverVI } from './experimentos.js';

// Opções extras (F3): `opcoes` = { deslocAval, perfil, leve, gamma } repassadas a executarSemente / resolverVI.
// cfg.algo === 'vi' → Iteração de Valor (sem episódios), usada na sensibilidade à penalidade.
function tarefa({ id, env: opts, cfg, seed, nEpAval, opcoes = {} }) {
  const env = criarAmbiente(opts);
  if (cfg.algo === 'vi') {
    self.postMessage({ tipo: 't-fim', id, resultado: resolverVI(env, cfg.gamma, { perfil: opcoes.perfil, nEpAval }) });
    return;
  }
  let ultimo = 0;
  const resultado = executarSemente(env, cfg, seed, {
    nEpAval, deslocAval: opcoes.deslocAval, perfil: opcoes.perfil, leve: opcoes.leve,
    onFrac: (f) => { const agora = performance.now(); if (agora - ultimo > 120) { ultimo = agora; self.postMessage({ tipo: 't-prog', id, frac: f }); } }
  });
  self.postMessage({ tipo: 't-fim', id, resultado: { ...resultado, seed } });
}

// Iteração de Política (sem episódios): calcula e compara com a Iteração de Valor de mesmo γ.
function politica({ env: opts, gamma }) {
  const env = criarAmbiente(opts), t0 = performance.now();
  const ip = iteracaoPolitica(env, gamma), vi = iteracaoValor(env, gamma);
  let dif = 0, iguais = 0;
  for (let s = 0; s < env.nS; s++) { dif = Math.max(dif, Math.abs(ip.V[s] - vi.V[s])); if (ip.pi[s] === vi.pi[s]) iguais++; }
  self.postMessage({ tipo: 'ip', pi: ip.pi, rodadas: ip.rodadas, dif, iguais, nS: env.nS, v0: ip.V[env.s0], v0vi: vi.V[env.s0], ms: performance.now() - t0 });
}

function treino({ env: opts, algo, alpha, passo, eps0, gamma, nEp, seed, cada, parar }) {
  const env = criarAmbiente(opts), t0 = performance.now();
  const onProgress = (ep, ret, suc) => {
    if (parar !== undefined) return ep >= parar;
    let sr = 0, ss = 0;
    for (let i = ep - cada; i < ep; i++) { sr += ret[i]; ss += suc[i]; }   // média do último bloco
    self.postMessage({ tipo: 'progresso', ep, retorno: sr / cada, sucesso: ss / cada });
    return false;
  };
  const res = algo === 'mc'
    ? monteCarlo(env, { nEp, gamma, eps0, seed, cada, alpha: passo === 'const' ? alpha : null, onProgress })
    : qLearning(env, { nEp, alpha, eps0, gamma, seed, cada, sarsa: algo === 'sarsa', onProgress });
  const Q = res.Q;
  self.postMessage({ tipo: 'fim', Q, episodios: res.retornos.length, ms: performance.now() - t0 }, [Q.buffer]);
}

self.onmessage = (e) => {
  try {
    if (e.data.cmd === 'tarefa') tarefa(e.data); else if (e.data.algo === 'ip') politica(e.data); else treino(e.data);
  } catch (err) {
    self.postMessage({ tipo: 'erro', msg: String(err && err.message ? err.message : err) });
  }
};
