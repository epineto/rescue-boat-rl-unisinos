// Cartão "Busca de hiperparâmetros". / "Hyperparameter search" card.
import { t, fmt, fmtMax } from './i18n.js';
import { $, num, textoEta, limitador, esc, textoAlpha } from './util.js';
import { baixarCSV } from './csv.js';
import { lerLista, GRADE_PADRAO, SEMENTES_BUSCA, SEMENTES_RAPIDO, MAX_CONFIGS, ORDEM_ALGOS, gerarConfigs, tarefasBusca, linhasBusca, melhoresPorAlgoritmo, ordenarLinhas, csvBusca, csvBuscaSementes } from '../pesquisa.js';

const ALGOS = [{ id: 'q', p: 'bq' }, { id: 'sarsa', p: 'bs' }, { id: 'mc', p: 'bm' }];
const nomeAlgo = (a) => t(`cmp.${a}`);
const COLUNAS = [['algo', 'cmp.col.algo', false], ['alpha', 'busca.col.alpha', true], ['eps0', 'busca.col.eps', true], ['gamma', 'busca.col.gamma', true], ['nEp', 'busca.col.nEp', true],
  ['desc', 'busca.col.desc', true], ['dp', 'busca.col.dp', true], ['sucesso', 'cmp.col.suc', true], ['passos', 'cmp.col.pas', true]];
const fmtLista = (v) => v.map((x) => (x === 'media' ? t('busca.media') : fmtMax(x, 3))).join('; ');

// ctx: { S, exec, bloqueado (), aplicarNoTreino (cfg) }
export function criarBusca(ctx) {
  const E = { linhas: [], nSem: SEMENTES_BUSCA, rodando: false, statusFn: null, ordem: { col: 'desc', desc: true }, filtro: 'todos', corrida: 0 };
  const status = (fn) => { E.statusFn = fn; $('busca-status').textContent = fn ? fn() : ''; };

  // ---- leitura da grade editável
  function lerGrade() {
    const grade = {}, avisos = [];
    for (const { id, p } of ALGOS) {
      const pad = GRADE_PADRAO[id], mc = id === 'mc', g = { ativo: $(`${p}-ativo`).checked, nEp: num(`${p}-nep`, 100, 500000, pad.nEp, true) };
      const campo = (sufixo, rotulo, chave, min, max, aceitaMedia) => {
        const { valores, ignorados } = lerLista($(`${p}-${sufixo}`).value, { min, max, aceitaMedia });
        if (ignorados.length) avisos.push(t('busca.avisoIgnorados', { algo: nomeAlgo(id), campo: rotulo, lista: ignorados.join(' ') }));
        if (!valores.length && g.ativo) { avisos.push(t('busca.avisoVazio', { algo: nomeAlgo(id), campo: rotulo })); return pad[chave].slice(); }
        return valores;
      };
      g.alpha = campo('alpha', 'α', 'alpha', 0.001, 1, mc); g.eps0 = campo('eps', 'ε₀', 'eps0', 0, 1, false); g.gamma = campo('gamma', 'γ', 'gamma', 0, 1, false);
      grade[id] = g;
    }
    return { grade, avisos };
  }
  const nSementes = () => num('b-nsem', 1, 30, SEMENTES_BUSCA, true);

  function atualizarResumo() {
    const { grade, avisos } = lerGrade(), cfgs = gerarConfigs(grade), ns = nSementes();
    const ep = cfgs.reduce((a, c) => a + c.nEp, 0) * ns;
    const por = ORDEM_ALGOS.map((a) => `${nomeAlgo(a)}: ${cfgs.filter((c) => c.algo === a).length}`).join(' · ');
    $('b-resumo').textContent = t('busca.resumo', { n: cfgs.length, s: ns, total: fmt(cfgs.length * ns, 0), ep: fmt(ep / 1e6, 1), por });
    const av = [...avisos]; if (cfgs.length > MAX_CONFIGS) av.push(t('busca.avisoMax', { n: fmt(cfgs.length, 0), max: MAX_CONFIGS }));
    $('b-aviso').textContent = av.join(' ');
    ligarBotoes();
    return cfgs;
  }

  function ligarBotoes() {
    const bloqueado = ctx.exec.ocupado || ctx.bloqueado(), n = gerarConfigs(lerGradeSilencioso()).length;
    $('b-busca').disabled = bloqueado || n === 0 || n > MAX_CONFIGS;
    $('b-busca-cancelar').disabled = !E.rodando;
    $('b-busca-csv').disabled = !E.linhas.length; $('b-busca-csv-sem').disabled = !E.linhas.length;
    $('b-busca-padrao').disabled = E.rodando;
    document.querySelectorAll('#busca-grade input, #b-nsem, #b-rapido').forEach((el) => { el.disabled = E.rodando; });
    if (!E.rodando) $('b-nsem').disabled = $('b-rapido').checked;
  }
  // grade sem avisos nem escrita nos campos (para habilitar botões)
  function lerGradeSilencioso() {
    const grade = {};
    for (const { id, p } of ALGOS) {
      const pad = GRADE_PADRAO[id], l = (suf, min, max, med) => lerLista($(`${p}-${suf}`).value, { min, max, aceitaMedia: med }).valores;
      grade[id] = { ativo: $(`${p}-ativo`).checked, alpha: l('alpha', 0.001, 1, id === 'mc'), eps0: l('eps', 0, 1, false), gamma: l('gamma', 0, 1, false), nEp: pad.nEp };
    }
    return grade;
  }

  // ---- execução
  async function rodar({ onFrac = null } = {}) {
    if (ctx.exec.ocupado) return false;
    const cfgs = atualizarResumo();
    if (!cfgs.length || cfgs.length > MAX_CONFIGS) return false;
    const ns = nSementes(), id = ++E.corrida, tarefas = tarefasBusca(ctx.S.opts, cfgs, ns), t0 = performance.now(), lim = limitador(300), nW = Math.min(ctx.exec.tamanho, tarefas.length);
    E.rodando = true; E.linhas = []; E.nSem = ns; $('busca-barra').value = 0; $('busca-res').hidden = true; ligarBotoes();
    status(() => t('busca.iniciando', { total: fmt(tarefas.length, 0), n: nW }));
    $('busca-anuncio').textContent = t('busca.iniciando', { total: fmt(tarefas.length, 0), n: nW });
    let marco = 0;
    try {
      const res = await ctx.exec.executar(tarefas, {
        onProgresso: (frac, feitas, total) => {
          lim(() => {
            $('busca-barra').value = frac * 100;
            status(() => t('busca.rodando', { pct: fmt(frac * 100, 0), feitas: fmt(feitas, 0), total: fmt(total, 0), eta: textoEta(frac, t0), n: nW }));
            const m = Math.floor(frac * 4) * 25;
            if (m > marco && m < 100) { marco = m; $('busca-anuncio').textContent = t('busca.anuncioMeio', { pct: m }); }
          });
          if (onFrac) onFrac(frac);
        }
      });
      if (E.corrida !== id) return false;
      E.linhas = linhasBusca(cfgs, res, ns); E.rodando = false;
      $('busca-barra').value = 100;
      const seg = (performance.now() - t0) / 1000;
      status(() => t('busca.concluido', { seg: fmt(seg, 1), total: fmt(tarefas.length, 0), n: nW }));
      $('busca-anuncio').textContent = t('busca.concluido', { seg: fmt(seg, 1), total: fmt(tarefas.length, 0), n: nW });
      render();
      return true;
    } catch (e) {
      if (E.corrida !== id) return false;
      E.rodando = false;
      if (e && e.cancelado) status(() => t('busca.cancelado')); else status(() => t('busca.erro', { msg: e && e.message ? e.message : String(e) }));
      $('busca-anuncio').textContent = $('busca-status').textContent;
      ligarBotoes();
      return false;
    }
  }

  // ---- tabela e melhores configurações
  const textoCfg = (c) => `${c.algo === 'mc' && c.alpha === null ? `${t('busca.col.alpha')} = ${t('busca.media')}` : `α = ${fmtMax(c.alpha, 3)}`} · ε₀ = ${fmtMax(c.eps0, 3)} · γ = ${fmtMax(c.gamma, 3)} · ${fmt(c.nEp, 0)} ${t('busca.ep')}`;

  function render() {
    if (E.statusFn) $('busca-status').textContent = E.statusFn();
    $('busca-res').hidden = !E.linhas.length;
    ligarBotoes();
    if (!E.linhas.length) return;
    const melhores = melhoresPorAlgoritmo(E.linhas);
    $('busca-melhores').innerHTML = ORDEM_ALGOS.filter((a) => melhores[a]).map((a) => {
      const l = melhores[a];
      return `<li><strong>${esc(nomeAlgo(a))}</strong><span>${esc(textoCfg(l.cfg))}</span>` +
        `<span class="num">${t('busca.col.desc')}: <b>${fmt(l.retornoDesc.media, 2)}</b> ± ${fmt(l.retornoDesc.dp, 2)} · ${t('cmp.col.suc')} ${fmt(l.sucesso.media * 100, 1)}%</span>` +
        `<button type="button" class="btn sec" data-aplicar="${a}">${t('busca.aplicar')}</button></li>`;
    }).join('');
    $('busca-melhores').querySelectorAll('[data-aplicar]').forEach((b) => b.addEventListener('click', () => aplicar(b.dataset.aplicar)));

    const visiveis = E.filtro === 'todos' ? E.linhas : E.linhas.filter((l) => l.cfg.algo === E.filtro), ord = ordenarLinhas(visiveis, E.ordem.col, E.ordem.desc);
    const th = ([col, chave, numerica]) => {
      const ativo = E.ordem.col === col, sort = ativo ? (E.ordem.desc ? 'descending' : 'ascending') : 'none';
      return `<th scope="col" aria-sort="${sort}"${numerica ? '' : ' class="esq"'}><button type="button" class="ord" data-col="${col}">${t(chave)}<span aria-hidden="true">${ativo ? (E.ordem.desc ? ' ▼' : ' ▲') : ''}</span></button></th>`;
    };
    $('busca-tab').setAttribute('aria-label', t('busca.tabAria', { n: ord.length }));
    $('busca-tab').innerHTML = `<thead><tr>${COLUNAS.map(th).join('')}</tr></thead><tbody>` + ord.map((l) => {
      const eMelhor = melhores[l.cfg.algo] === l, c = l.cfg;
      return `<tr${eMelhor ? ' class="melhor"' : ''}><th scope="row" class="esq">${esc(nomeAlgo(c.algo))}${eMelhor ? ` <span class="selo">${t('busca.melhor')}</span>` : ''}</th><td>${c.alpha === null ? t('busca.media') : fmtMax(c.alpha, 3)}</td><td>${fmtMax(c.eps0, 3)}</td><td>${fmtMax(c.gamma, 3)}</td><td>${fmt(c.nEp, 0)}</td>` +
        `<td>${fmt(l.retornoDesc.media, 2)}</td><td>${fmt(l.retornoDesc.dp, 2)}</td><td>${fmt(l.sucesso.media * 100, 1)}%</td><td>${fmt(l.passos.media, 1)}</td></tr>`;
    }).join('') + '</tbody>';
    $('busca-tab').querySelectorAll('[data-col]').forEach((b) => b.addEventListener('click', () => ordenar(b.dataset.col)));
    $('busca-nota').textContent = t('busca.nota', { n: E.nSem, v: fmt(ctx.S.ref ? ctx.S.ref.v0 : 0, 2) });
  }

  function ordenar(col) {
    E.ordem = E.ordem.col === col ? { col, desc: !E.ordem.desc } : { col, desc: col === 'desc' || col === 'sucesso' };
    render();
    const b = document.querySelector(`#busca-tab [data-col="${col}"]`); if (b) b.focus();   // mantém o foco no cabeçalho
    $('busca-anuncio').textContent = t('busca.ordenado', { col: t(COLUNAS.find((c) => c[0] === col)[1]), sentido: t(E.ordem.desc ? 'busca.decrescente' : 'busca.crescente') });
  }

  function aplicar(algo) {
    const l = melhoresPorAlgoritmo(E.linhas)[algo]; if (!l) return;
    const c = l.cfg;
    const feito = ctx.aplicarNoTreino({ algo: c.algo, passo: c.algo === 'mc' ? (c.alpha === null ? 'media' : 'const') : undefined, alpha: c.alpha === null ? undefined : c.alpha, eps0: c.eps0, gamma: c.gamma, nEp: c.nEp });
    $('busca-aplicado').textContent = feito ? t('busca.aplicado', { algo: nomeAlgo(algo) }) : t('busca.treinoOcupado');
  }

  function restaurarPadrao() {
    for (const { id, p } of ALGOS) {
      const g = GRADE_PADRAO[id];
      $(`${p}-ativo`).checked = true; $(`${p}-alpha`).value = fmtLista(g.alpha); $(`${p}-eps`).value = fmtLista(g.eps0); $(`${p}-gamma`).value = fmtLista(g.gamma); $(`${p}-nep`).value = g.nEp;
    }
    $('b-rapido').checked = false; $('b-nsem').value = SEMENTES_BUSCA; $('b-nsem').disabled = false; $('busca-aplicado').textContent = '';
    atualizarResumo();
  }

  function descartar() {
    E.corrida++; if (E.rodando) ctx.exec.cancelar();
    E.linhas = []; E.rodando = false; $('busca-barra').value = 0; $('busca-res').hidden = true; $('busca-anuncio').textContent = ''; $('busca-aplicado').textContent = '';
    status(() => t('busca.ocioso')); ligarBotoes();
  }

  function ligar() {
    restaurarPadrao();
    $('b-busca').addEventListener('click', () => rodar());
    $('b-busca-cancelar').addEventListener('click', () => ctx.exec.cancelar());
    $('b-busca-padrao').addEventListener('click', restaurarPadrao);
    $('b-busca-csv').addEventListener('click', () => { if (E.linhas.length) baixarCSV('busca_hiperparametros', csvBusca(E.linhas)); });
    $('b-busca-csv-sem').addEventListener('click', () => { if (E.linhas.length) baixarCSV('busca_por_semente', csvBuscaSementes(E.linhas)); });
    $('b-rapido').addEventListener('change', () => { $('b-nsem').value = $('b-rapido').checked ? SEMENTES_RAPIDO : SEMENTES_BUSCA; $('b-nsem').disabled = $('b-rapido').checked; atualizarResumo(); });
    document.querySelectorAll('#busca-grade input, #b-nsem').forEach((el) => el.addEventListener('change', atualizarResumo));
    $('b-filtro').addEventListener('change', () => { E.filtro = $('b-filtro').value; render(); });
    ctx.exec.onMudanca(ligarBotoes);
  }

  return { ligar, render, rodar, descartar, restaurarPadrao, atualizarResumo, ligarBotoes,
    csv: () => (E.linhas.length ? { busca: csvBusca(E.linhas), porSemente: csvBuscaSementes(E.linhas) } : null),
    get rodando() { return E.rodando; }, get temResultado() { return E.linhas.length > 0; }, get linhas() { return E.linhas; } };
}
