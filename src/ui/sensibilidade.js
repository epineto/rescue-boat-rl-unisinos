// Cartão "Sensibilidade à penalidade dos destroços". / "Debris-penalty sensitivity" card.
import { t, fmt } from './i18n.js';
import { $, textoEta, limitador, esc } from './util.js';
import { criarGraficoMulti } from './graficos-multi.js';
import { baixarCSV } from './csv.js';
import { lerLista, PENALIDADES_PADRAO, ordenarPenalidades, tarefasSensibilidade, agruparSensibilidade, linhasSensibilidade, mudancaDeRota, csvSensibilidade, CFG_SENS } from '../pesquisa.js';

const MAX_PENALIDADES = 12;
const SERIES = [
  { algo: 'vi', cor: '#2E7D5B', tracos: [], forma: 'c' },
  { algo: 'q', cor: '#1D2369', tracos: [], forma: 'q' },
  { algo: 'sarsa', cor: '#4A86B8', tracos: [7, 4], forma: 't' }
];
const nomeAlgo = (a) => t(a === 'vi' ? 'cmp.vi' : `cmp.${a}`);

// ctx: { S (estado global: opts, env), exec (executor do pool), aoMudar () }
export function criarSensibilidade(ctx) {
  const E = { vi: new Map(), rl: { q: new Map(), sarsa: new Map() }, nSem: 5, rodando: false, statusFn: null, linhas: [], corrida: 0 };
  const gDestr = criarGraficoMulti($('sg-destr')), gCorr = criarGraficoMulti($('sg-corr'));
  const status = (fn) => { E.statusFn = fn; $('sens-status').textContent = fn ? fn() : ''; };
  const anunciar = (txt) => { $('sens-anuncio').textContent = txt; };

  // ---- lista de penalidades
  function lerPenalidades(normalizar) {
    const { valores, ignorados } = lerLista($('s-lista').value, { min: -100, max: 0 });
    let pens = ordenarPenalidades(valores), aviso = '';
    if (pens.length > MAX_PENALIDADES) { pens = pens.slice(0, MAX_PENALIDADES); aviso = t('sens.avisoMax', { n: MAX_PENALIDADES }); }
    if (!pens.length) { pens = PENALIDADES_PADRAO.slice(); aviso = t('sens.avisoVazia'); }
    if (ignorados.length) aviso = `${t('sens.avisoIgnorados', { lista: ignorados.join(' ') })} ${aviso}`.trim();
    $('s-aviso').textContent = aviso;
    if (normalizar) $('s-lista').value = pens.map((p) => fmt(p, Number.isInteger(p) ? 0 : 2)).join('; ');
    return pens;
  }
  const nSem = () => Number($('s-nsem').value) || 5;

  function ligarBotoes() {
    const bloqueado = ctx.exec.ocupado || ctx.bloqueado();
    $('b-sens-vi').disabled = bloqueado; $('b-sens-rl').disabled = bloqueado;
    $('b-sens-cancelar').disabled = !E.rodando;
    $('b-sens-csv').disabled = !E.linhas.length;
    $('s-lista').disabled = E.rodando; $('s-nsem').disabled = E.rodando; $('b-sens-padrao').disabled = bloqueado;
  }

  // ---- execução
  async function rodar({ vi = true, rl = false, nSemente = nSem(), onFrac = null } = {}) {
    if (ctx.exec.ocupado) return false;
    const pens = lerPenalidades(true), id = ++E.corrida, opts = ctx.S.opts, t0 = performance.now(), lim = limitador(250);
    if (rl && nSemente !== E.nSem) { E.rl.q.clear(); E.rl.sarsa.clear(); }
    E.nSem = nSemente; E.rodando = true; ligarBotoes();
    $('sens-barra').value = 0;
    try {
      const fases = [];
      if (vi || rl) fases.push({ soVI: true, peso: 0.02 });
      if (rl) fases.push({ soVI: false, peso: 0.98 });
      let base = 0;
      for (const f of fases) {
        const tarefas = tarefasSensibilidade(opts, pens, { nSem: nSemente, soVI: f.soVI });
        status(() => t(f.soVI ? 'sens.calculandoVI' : 'sens.treinando', { total: tarefas.length, n: Math.min(ctx.exec.tamanho, tarefas.length) }));
        const base0 = base;
        const res = await ctx.exec.executar(tarefas, {
          onProgresso: (frac, feitas, total) => {
            const g = rl ? base0 + f.peso * frac : frac;
            lim(() => {
              $('sens-barra').value = g * 100;
              status(() => t('sens.rodando', { pct: fmt(g * 100, 0), feitas, total, eta: textoEta(g, t0), fase: t(f.soVI ? 'sens.faseVI' : 'sens.faseRL') }));
            });
            if (onFrac) onFrac(g);
          }
        });
        if (E.corrida !== id) return false;   // descartado (ambiente mudou) durante a execução
        const grupos = agruparSensibilidade(tarefas, res);
        for (const pen of pens) {
          if (f.soVI) E.vi.set(pen, grupos.vi[pen][0]);
          else for (const a of ['q', 'sarsa']) E.rl[a].set(pen, grupos[a][pen]);
        }
        base += f.peso;
        render();
      }
      $('sens-barra').value = 100;
      const seg = (performance.now() - t0) / 1000;
      status(() => t('sens.concluido', { seg: fmt(seg, 1), n: pens.length }));
      anunciar(`${t('sens.concluido', { seg: fmt(seg, 1), n: pens.length })} ${$('sens-destaque').textContent}`);
      E.rodando = false; ligarBotoes();
      return true;
    } catch (e) {
      if (E.corrida !== id) return false;
      E.rodando = false;
      if (e && e.cancelado) status(() => t('sens.cancelado')); else status(() => t('sens.erro', { msg: e && e.message ? e.message : String(e) }));
      anunciar($('sens-status').textContent);
      render(); ligarBotoes();
      return false;
    }
  }

  // ---- linhas, tabela e gráficos
  function montarLinhas() {
    const lista = lerPenalidadesSemEfeitos();
    const ativas = lista.filter((p) => E.vi.has(p));
    const grupos = { vi: {}, q: {}, sarsa: {} };
    for (const p of ativas) {
      grupos.vi[p] = [E.vi.get(p)];
      for (const a of ['q', 'sarsa']) if (E.rl[a].has(p)) grupos[a][p] = E.rl[a].get(p);
    }
    return linhasSensibilidade(ativas, grupos);
  }
  // lê a lista sem gravar no campo nem mexer em avisos (usada ao desenhar)
  function lerPenalidadesSemEfeitos() {
    const { valores } = lerLista($('s-lista').value, { min: -100, max: 0 });
    return valores.length ? ordenarPenalidades(valores).slice(0, MAX_PENALIDADES) : PENALIDADES_PADRAO.slice();
  }

  const dpIc = (e, d, pct = false) => `${fmt(pct ? e.media * 100 : e.media, d)}${pct ? '%' : ''}${e.n > 1 ? ` ± ${fmt(pct ? e.ic95 * 100 : e.ic95, d)}` : ''}`;

  function textoDestaque(m, linhas) {
    if (!m) return t('sens.destaque.vazio');
    const f = (v) => fmt(v, 2);
    if (m.muda) {
      return t(m.deCruza ? 'sens.destaque.mudaCruza' : 'sens.destaque.mudaContorna', { de: fmt(m.de, 0), para: fmt(m.para, 0), pd: f(m.passosDe), pp: f(m.passosPara) });
    }
    if (m.so1) return t(m.cruza ? 'sens.destaque.umaCruza' : 'sens.destaque.umaContorna', { p: fmt(linhas.find((l) => l.algo === 'vi').penalidade, 0), pd: f(m.passos) });
    return t(m.cruza ? 'sens.destaque.todasCruzam' : 'sens.destaque.todasContornam');
  }

  function render() {
    const linhas = montarLinhas(); E.linhas = linhas;
    $('sens-res').hidden = !linhas.length;
    if (!E.rodando && !linhas.length && !E.statusFn) status(() => t('sens.ocioso'));
    else if (E.statusFn) $('sens-status').textContent = E.statusFn();
    ligarBotoes();
    if (!linhas.length) return;
    const m = mudancaDeRota(linhas);
    $('sens-destaque').textContent = textoDestaque(m, linhas);
    $('sens-destaque').classList.toggle('muda', !!(m && m.muda));
    const temRL = linhas.some((l) => l.algo !== 'vi');
    $('sens-nota').textContent = temRL ? t('sens.notaRL', { n: E.nSem, a: fmt(CFG_SENS.alpha, 1), e: fmt(CFG_SENS.eps0, 0), g: fmt(CFG_SENS.gamma, 2), ep: fmt(CFG_SENS.nEp, 0) }) : t('sens.notaVI');
    $('sens-tab').setAttribute('aria-label', t('sens.tabAria'));
    $('sens-tab').innerHTML = `<thead><tr><th scope="col">${t('sens.col.pen')}</th><th scope="col" class="esq">${t('cmp.col.algo')}</th><th scope="col">${t('cmp.col.n')}</th><th scope="col">${t('sens.col.ret')}</th>` +
      `<th scope="col">${t('sens.col.tocam')}</th><th scope="col">${t('sens.col.dest')}</th><th scope="col">${t('sens.col.corr')}</th><th scope="col">${t('cmp.col.suc')}</th></tr></thead><tbody>` +
      linhas.map((l, i) => {
        const novaPen = i === 0 || linhas[i - 1].penalidade !== l.penalidade;
        return `<tr${novaPen && i ? ' class="nova-pen"' : ''}><th scope="row">${novaPen ? fmt(l.penalidade, 0) : `<span class="so-leitor">${fmt(l.penalidade, 0)}</span>`}</th><td class="esq">${esc(nomeAlgo(l.algo))}</td><td>${l.n}</td>` +
          `<td>${l.algo === 'vi' ? fmt(l.v0, 2) : dpIc(l.retornoDesc, 2)}</td><td>${fmt(l.tocam.media * 100, 0)}%</td><td>${dpIc(l.passosDestrocos, 2)}</td><td>${dpIc(l.passosCorrenteza, 2)}</td><td>${fmt(l.sucesso.media * 100, 1)}%</td></tr>`;
      }).join('') + '</tbody>';

    // gráficos: x = módulo da penalidade (como a figura do relatório)
    const serie = (algo, campo) => {
      const ls = linhas.filter((l) => l.algo === algo), s = SERIES.find((x) => x.algo === algo);
      return { x: ls.map((l) => Math.abs(l.penalidade)), y: ls.map((l) => l[campo].media), lo: ls.map((l) => Math.max(0, l[campo].media - l[campo].ic95)), hi: ls.map((l) => l[campo].media + l[campo].ic95), cor: s.cor, tracos: s.tracos, forma: s.forma };
    };
    const usadas = SERIES.filter((s) => linhas.some((l) => l.algo === s.algo));
    const xs = linhas.map((l) => Math.abs(l.penalidade)), xMin = Math.min(...xs), xMax = Math.max(...xs);
    const desenhar = (g, campo, idCanvas, rotY) => {
      const ss = usadas.map((s) => serie(s.algo, campo)), topo = Math.max(...ss.flatMap((s) => s.hi), 0.5);
      g.desenhar({ series: ss, refs: [], xMin, xMax: xMax === xMin ? xMin + 1 : xMax, logX: false, yMin: 0, yMax: topo * 1.12, xRot: t('sens.eixoPen'), yRot: rotY, fmtY: (v) => fmt(v, v < 10 ? 1 : 0) });
      const resumo = usadas.map((s, i) => `${nomeAlgo(s.algo)}: ${ss[i].x.map((x, k) => `${fmt(-x, 0)} → ${fmt(ss[i].y[k], 2)}`).join('; ')}.`).join(' ');
      $(idCanvas).setAttribute('aria-label', t(campo === 'passosDestrocos' ? 'sens.grafDestAria' : 'sens.grafCorrAria', { resumo }));
    };
    desenhar(gDestr, 'passosDestrocos', 'sg-destr', t('sens.eixoDest'));
    desenhar(gCorr, 'passosCorrenteza', 'sg-corr', t('sens.eixoCorr'));
    $('sens-leg').innerHTML = usadas.map((s) => `<li><span class="linha-leg" style="color:${s.cor};border-top-style:${s.tracos.length ? 'dashed' : 'solid'}"></span><span>${esc(nomeAlgo(s.algo))}</span></li>`).join('');
  }

  function exportar() {
    if (!E.linhas.length) return;
    baixarCSV('sensibilidade_destrocos', csvSensibilidade(E.linhas));
  }

  function descartar() {
    E.corrida++; if (E.rodando) ctx.exec.cancelar();
    E.vi.clear(); E.rl.q.clear(); E.rl.sarsa.clear(); E.linhas = []; E.rodando = false;
    $('sens-barra').value = 0; status(() => t('sens.ocioso')); $('sens-res').hidden = true; $('sens-anuncio').textContent = ''; ligarBotoes();
  }

  function restaurarPadrao() {
    $('s-lista').value = PENALIDADES_PADRAO.map((p) => fmt(p, 0)).join('; '); $('s-nsem').value = '5'; $('s-aviso').textContent = '';
  }

  function ligar() {
    $('b-sens-vi').addEventListener('click', () => rodar({ vi: true }));
    $('b-sens-rl').addEventListener('click', () => rodar({ vi: true, rl: true }));
    $('b-sens-cancelar').addEventListener('click', () => ctx.exec.cancelar());
    $('b-sens-csv').addEventListener('click', exportar);
    $('b-sens-padrao').addEventListener('click', () => { restaurarPadrao(); descartarRL(); rodar({ vi: true }); });
    // ao editar a lista: a Iteração de Valor é recalculada na hora; os resultados de RL das penalidades que sobram são mantidos
    $('s-lista').addEventListener('change', () => { if (!ctx.exec.ocupado && !ctx.bloqueado()) rodar({ vi: true }); });
    $('s-nsem').addEventListener('change', () => { E.rl.q.clear(); E.rl.sarsa.clear(); render(); });
    ctx.exec.onMudanca(ligarBotoes);
  }
  function descartarRL() { E.rl.q.clear(); E.rl.sarsa.clear(); }

  return { ligar, render, rodar, descartar, restaurarPadrao, descartarRL, csv: () => (E.linhas.length ? csvSensibilidade(E.linhas) : null), ligarBotoes,
    get rodando() { return E.rodando; }, get temResultado() { return E.linhas.length > 0; }, get temRL() { return E.linhas.some((l) => l.algo !== 'vi'); }, get nSem() { return E.nSem; } };
}
