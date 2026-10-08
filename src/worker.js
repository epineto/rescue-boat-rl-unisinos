// Treino fora da thread principal (worker do tipo module). / Training off the main thread (module worker).
// Entrada: { env, algo, alpha, eps0, gamma, nEp, seed, cada, parar? }
// `parar` (opcional): treina de novo, deterministicamente, só até esse episódio — usado para recuperar a Q
// de um treino interrompido (o worker é encerrado, pois o laço é síncrono), sem emitir progresso.
import { criarAmbiente } from './env.js';
import { qLearning } from './algos.js';

self.onmessage = (e) => {
  const { env: opts, algo, alpha, eps0, gamma, nEp, seed, cada, parar } = e.data;
  try {
    const env = criarAmbiente(opts), t0 = performance.now();
    const res = qLearning(env, {
      nEp, alpha, eps0, gamma, seed, cada, sarsa: algo === 'sarsa',
      onProgress: (ep, ret, suc) => {
        if (parar !== undefined) return ep >= parar;
        let sr = 0, ss = 0;
        for (let i = ep - cada; i < ep; i++) { sr += ret[i]; ss += suc[i]; }   // média do último bloco
        self.postMessage({ tipo: 'progresso', ep, retorno: sr / cada, sucesso: ss / cada });
        return false;
      }
    });
    const Q = res.Q;
    self.postMessage({ tipo: 'fim', Q, episodios: res.retornos.length, ms: performance.now() - t0 }, [Q.buffer]);
  } catch (err) {
    self.postMessage({ tipo: 'erro', msg: String(err && err.message ? err.message : err) });
  }
};
