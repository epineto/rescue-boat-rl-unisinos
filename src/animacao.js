// Episódio passo a passo para a animação da rota (lógica pura, testável em Node).
// Step-by-step episode for the route animation (pure logic, testable in Node).
import { DELTA } from './env.js';
import { criarSimulador } from './algos.js';
import { makeRng } from './rng.js';

// Cria um episódio que segue `politica` (vetor de ações por estado). Cada chamada a `passo()` avança um passo e devolve
//   { t, s, a, s2, r, acumulada, fim, truncado, eventos: [{tipo, ...dados}] }
// Tipos de evento: embarque{pessoa}, desembarque{pessoa}, destrocos{}, arraste{}, fim{}, limite{}.
// Mesma semente ⇒ mesma sequência de estados que `rotaDe` (algos.js).
export function criarEpisodio(env, politica, { seed = 3, maxPassos = 100 } = {}) {
  const rng = makeRng(seed), sim = criarSimulador(env);
  const ep = { s: env.s0, t: 0, acumulada: 0, terminou: false, estados: [env.s0] };
  const destinoPretendido = (cel, a) => {   // para onde a ação levaria o barco sem a correnteza
    const ni = cel[0] + DELTA[a][0], nj = cel[1] + DELTA[a][1];
    return ni < 0 || ni >= env.nl || nj < 0 || nj >= env.nc || env.bloqueios.has(env.chave(ni, nj)) ? cel : [ni, nj];
  };

  function passo() {
    if (ep.terminou) return null;
    const s = ep.s, a = politica[s], de = env.decodifica(s);
    const { s2, r, f } = sim.passo(s, a, rng.random());
    const para = env.decodifica(s2), eventos = [];
    for (let i = 0; i < env.nPes; i++) {
      if (de.sit[i] === 0 && para.sit[i] === 1) eventos.push({ tipo: 'embarque', pessoa: i + 1 });
      if (de.sit[i] === 1 && para.sit[i] === 2) eventos.push({ tipo: 'desembarque', pessoa: i + 1 });
    }
    if (env.emDestrocos[s2]) eventos.push({ tipo: 'destrocos', r: env.opts.rDestrocos });
    if (env.naCorrenteza[s]) {   // arraste "perceptível": o barco não foi para onde a ação pretendia
      const alvo = destinoPretendido(de.cel, a);
      if (alvo[0] !== para.cel[0] || alvo[1] !== para.cel[1]) eventos.push({ tipo: 'arraste' });
    }
    ep.t++; ep.s = s2; ep.acumulada += r; ep.estados.push(s2);
    const truncado = !f && ep.t >= maxPassos;
    if (f) eventos.push({ tipo: 'fim' });
    if (truncado) eventos.push({ tipo: 'limite' });
    ep.terminou = f || truncado;
    return { t: ep.t, s, a, s2, r, acumulada: ep.acumulada, fim: f, truncado, eventos };
  }
  return { passo, get estado() { return ep.s; }, get t() { return ep.t; }, get acumulada() { return ep.acumulada; },
    get terminou() { return ep.terminou; }, get estados() { return ep.estados; } };
}
