// Pool de Web Workers (thread principal). Executa uma lista de tarefas com no máximo `tamanho` workers em paralelo.
// Web Worker pool (main thread). Runs a task list with at most `tamanho` parallel workers.

export const tamanhoPadrao = () => Math.max(1, Math.min(8, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2));

// Uso: const pool = criarPool(); const p = pool.executar(tarefas, { onProgresso(frac, feitas, total) }); pool.cancelar();
// Cada tarefa é um objeto enviado ao worker como { cmd: 'tarefa', id, ...tarefa }. Resolve com a lista de resultados (na ordem).
// `cancelar()` encerra os workers e rejeita a promessa com { cancelado: true }.
export function criarPool({ url = new URL('./worker.js', import.meta.url), tamanho = tamanhoPadrao() } = {}) {
  let ativo = null;

  function executar(tarefas, { onProgresso = null } = {}) {
    if (ativo) throw new Error('pool ocupado');
    const total = tarefas.length, resultados = new Array(total), frac = new Float64Array(total);
    // `peso` (opcional) de cada tarefa pondera o progresso global (ex.: nº de episódios), melhorando a estimativa de tempo restante
    const pesos = tarefas.map((x) => (x.peso > 0 ? x.peso : 1)), somaPesos = pesos.reduce((a, b) => a + b, 0);
    let proximo = 0, feitas = 0;
    const workers = [];
    return new Promise((resolve, reject) => {
      const encerrar = () => { workers.forEach((w) => w.terminate()); workers.length = 0; ativo = null; };
      ativo = { cancelar: () => { encerrar(); reject({ cancelado: true }); } };
      const falha = (msg) => { if (!ativo) return; encerrar(); reject(new Error(msg)); };
      const notificar = () => { if (onProgresso) { let s = 0; for (let i = 0; i < total; i++) s += frac[i] * pesos[i]; onProgresso(s / somaPesos, feitas, total); } };
      const dar = (w) => {
        if (proximo >= total) return;
        const id = proximo++;
        const { peso, ...msg } = tarefas[id];
        w.postMessage({ cmd: 'tarefa', id, ...msg });
      };
      if (!total) { encerrar(); resolve([]); return; }
      const n = Math.min(tamanho, total);
      try {
        for (let k = 0; k < n; k++) {
          const w = new Worker(url, { type: 'module' });
          w.onerror = (ev) => falha(ev.message || 'worker');
          w.onmessage = ({ data }) => {
            if (!ativo) return;
            if (data.tipo === 't-prog') { frac[data.id] = Math.max(frac[data.id], Math.min(0.999, data.frac)); notificar(); }
            else if (data.tipo === 't-fim') {
              resultados[data.id] = data.resultado; frac[data.id] = 1; feitas++; notificar();
              if (feitas === total) { encerrar(); resolve(resultados); } else dar(w);
            } else if (data.tipo === 'erro') falha(data.msg);
          };
          workers.push(w);
        }
      } catch (e) { falha(String(e && e.message ? e.message : e)); return; }
      workers.forEach(dar);
    });
  }
  return { tamanho, executar, cancelar: () => { if (ativo) ativo.cancelar(); }, get ocupado() { return !!ativo; } };
}
