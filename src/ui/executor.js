// Executor único de tarefas do pool: só uma pesquisa pesada por vez; avisa a interface quando ocupa/libera.
// Single pool executor: one heavy run at a time; notifies the UI when it becomes busy/idle.
import { criarPool, tamanhoPadrao } from '../pool.js';

export function criarExecutor() {
  let pool = null;
  const ouvintes = [];
  const avisar = () => ouvintes.forEach((f) => f());
  return {
    get tamanho() { return tamanhoPadrao(); },
    get ocupado() { return !!pool; },
    onMudanca: (f) => { ouvintes.push(f); },
    // Resolve quando o executor estiver livre (ex.: o cálculo automático da sensibilidade terminou).
    livre: () => new Promise((ok) => { if (!pool) { ok(); return; } const f = () => { if (!pool) { ouvintes.splice(ouvintes.indexOf(f), 1); ok(); } }; ouvintes.push(f); }),
    // Resolve com os resultados na ordem das tarefas; rejeita com { cancelado: true } se cancelado.
    async executar(tarefas, opcoes) {
      if (pool) throw new Error('pool ocupado');
      const meu = criarPool(); pool = meu; avisar();
      try { return await meu.executar(tarefas, opcoes); } finally { if (pool === meu) { pool = null; avisar(); } }
    },
    // Libera o executor de forma síncrona (uma nova execução pode começar logo em seguida).
    cancelar() { if (pool) { const p = pool; pool = null; p.cancelar(); avisar(); } }
  };
}
