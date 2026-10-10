// Orquestrador da interface (F1 + F2 + F3). / UI orchestrator.
import { criarAmbiente, renderTexto, MAPA_PADRAO } from '../env.js';
import { iteracaoValor, politicaGulosa, avaliar } from '../algos.js';
import { criarEpisodio } from '../animacao.js';
import { agregar, linhasTabela, CONFIG_PESQUISA, SEMENTE_BASE } from '../experimentos.js';
import { codificar, decodificar, linkCom } from '../compartilhar.js';
import { PENALIDADES_PADRAO, CFG_SENS, GRADE_PADRAO, SEMENTES_BUSCA, gerarConfigs } from '../pesquisa.js';
import { iniciarEscala } from './escala.js';
import { iniciar as i18nIniciar, setLang, onLang, t, fmt } from './i18n.js';
import { $, num, definir, metrica, duracao, tomarCorrecoes } from './util.js';
import { criarExecutor } from './executor.js';
import { criarSensibilidade } from './sensibilidade.js';
import { criarBusca } from './busca.js';
import { criarEditor } from './editor.js';
import { criarReproducao } from './reproduzir.js';
import { criarMapa } from './mapa.js';
import { criarGrafico } from './graficos.js';
import { criarGraficoMulti } from './graficos-multi.js';
import { paraCSV, baixarCSV } from './csv.js';

const GAMMA_REF = 0.99, PADRAO = { rDestrocos: -10, pCorr: 0.2, capacidade: 2 };

const S = {
  mapa: MAPA_PADRAO.slice(), opts: { ...PADRAO, mapa: MAPA_PADRAO }, env: null, ref: null,
  treino: { worker: null, rodando: false, parando: false, nEp: 0, params: null, ultimoEp: 0, x: [], ret: [], suc: [], Q: null, pi: null, aval: null, ms: 0, interrompido: false },
  setas: null,  // null | 'otima' | 'aprendida'
  rota: { ep: null, timer: null, tocando: false, log: [], ultimo: null },
  cmp: { rodando: false, res: null, statusFn: null, t0: 0, ultimoPct: 0, ultimaAtual: 0 }
};
const PRESETS = {
  q: { alpha: 0.1, eps: 1, gamma: 0.95, nEp: 30000 }, sarsa: { alpha: 0.2, eps: 1, gamma: 0.99, nEp: 30000 },
  mc: { passo: 'media', alpha: 0.1, eps: 0.5, gamma: 0.95, nEp: 60000 }, ip: { gamma: 0.99 }
};
const reduzido = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };

const mapa = criarMapa($('mapa'));
const gRet = criarGrafico($('g-ret'));
const gSuc = criarGrafico($('g-suc'));
const mapaRota = criarMapa($('mapa-rota'));
const gcRet = criarGraficoMulti($('cg-ret'));
const gcSuc = criarGraficoMulti($('cg-suc'));

// ---------------------------------------------------------------- leitura de campos
const lerEnv = () => ({ rDestrocos: num('p-destrocos', -100, 0, PADRAO.rDestrocos), pCorr: num('p-corr', 0, 1, PADRAO.pCorr), capacidade: num('p-cap', 1, 3, PADRAO.capacidade, true) });

// ---------------------------------------------------------------- ambiente e referência
function reconstruir(avisar) {
  pararTreino(true);
  descartarPesquisas();
  S.opts = { ...lerEnv(), mapa: S.mapa };
  S.env = criarAmbiente(S.opts);
  const vi = iteracaoValor(S.env, GAMMA_REF);
  const av = avaliar(S.env, vi.pi, { nEp: 1000 });
  S.ref = { v0: vi.V[S.env.s0], varreduras: vi.varreduras, pi: vi.pi, passos: av.passos, sucesso: av.sucesso, retorno: av.retorno };
  limparTreino();
  if (S.setas === 'aprendida') definirSetas(null);
  $('aviso-amb').textContent = avisar ? t('amb.invalidado') : '';
  atualizarFonteRota(); reiniciarRota();
  renderTudo();
  if (sens) sens.rodar({ vi: true });   // a sensibilidade (Iteração de Valor) é recalculada na hora, em workers
}

function limparTreino() {
  Object.assign(S.treino, { ultimoEp: 0, x: [], ret: [], suc: [], Q: null, pi: null, aval: null, ip: null, interrompido: false });
  $('barra').value = 0; $('status').textContent = t('tr.ociosoStatus');
  if (S.env) atualizarFonteRota();
}

function definirSetas(modo) {
  S.setas = modo;
  $('c-otima').checked = modo === 'otima';
  $('c-aprendida').checked = modo === 'aprendida';
  desenharMapa();
}

function desenharMapa() {
  const pi = S.setas === 'otima' ? S.ref.pi : S.setas === 'aprendida' ? S.treino.pi : null;
  mapa.desenhar({ env: S.env, s: S.env.s0, pi });
  const extra = S.setas === 'otima' ? t('amb.mapaPolOtima') : S.setas === 'aprendida' ? t('amb.mapaPolAprendida') : '';
  $('mapa-desc').textContent = `${renderTexto(S.env, S.env.s0)}\n${t('amb.mapaLegendaTexto')}${extra ? `\n${extra}` : ''}`;
  $('mapa').setAttribute('aria-label', t('amb.mapaAria', { n: S.env.nPes }));
}

// ---------------------------------------------------------------- renderização de textos dinâmicos
function renderResumo() {
  const o = S.opts, e = S.env;
  $('resumo').textContent = t('amb.resumo', { nl: e.nl, nc: e.nc, nS: e.nS, rDestrocos: fmt(o.rDestrocos, 0).replace('-', '−'), pOk: fmt(1 - o.pCorr, 2), pCorr: fmt(o.pCorr, 2) });
}

function renderRef() {
  const r = S.ref;
  $('ref-res').innerHTML = metrica(t('ref.v0'), fmt(r.v0, 2)) + metrica(t('ref.varr'), fmt(r.varreduras, 0)) +
    metrica(t('ref.passos'), fmt(r.passos, 1)) + metrica(t('ref.sucesso'), `${fmt(r.sucesso * 100, 0)}%`) +
    metrica(t('ref.retSemDesc'), fmt(r.retorno, 1));
}

function renderResultados() {
  const T = S.treino, el = $('tr-res');
  if (!T.aval) { el.innerHTML = `<p class="nota">${t('tr.res.vazio')}</p>`; return; }
  const a = T.aval, dif = a.retornoDesc - S.ref.v0, bom = Math.abs(dif) < 2, ip = T.ip;
  const blocoIp = ip ? metrica(t('ip.rodadas'), fmt(ip.rodadas, 0)) +
    metrica(t('ip.coincide'), ip.dif < 1e-6 ? t('ip.sim') : t('ip.nao'), t('ip.detalhe', { d: ip.dif.toExponential(1), n: fmt(ip.iguais, 0), nS: fmt(ip.nS, 0) }), ip.dif < 1e-6 ? 'bom' : 'ruim') +
    metrica(t('ip.v0'), fmt(ip.v0, 2)) : '';
  el.innerHTML = `<dl class="metricas">` + blocoIp +
    metrica(t('tr.res.retDesc'), fmt(a.retornoDesc, 2), t('tr.res.vsOtimo', { v: fmt(S.ref.v0, 2), d: (dif > 0 ? '+' : '') + fmt(dif, 2) }), bom ? 'bom' : 'ruim') +
    metrica(t('tr.res.sucesso'), `${fmt(a.sucesso * 100, 1)}%`, '', a.sucesso > 0.99 ? 'bom' : 'ruim') +
    metrica(t('tr.res.passos'), fmt(a.passos, 1), `${t('ref.passos')}: ${fmt(S.ref.passos, 1)}`) + `</dl>`;
}

function renderStatus() {
  const T = S.treino;
  if (T.parando) { $('status').textContent = t('tr.parando'); return; }
  if (T.rodando) { $('status').textContent = t('tr.rodando', { ep: fmt(T.ultimoEp, 0), nEp: fmt(T.nEp, 0), pct: fmt((100 * T.ultimoEp) / T.nEp, 0) }); return; }
  if (T.ip) { $('status').textContent = t('ip.status', { r: fmt(T.ip.rodadas, 0), ms: fmt(T.ip.ms, 0), g: fmt(T.ip.gamma, 2) }); return; }
  if (T.pi) {
    $('status').textContent = T.interrompido ? t('tr.interrompido', { ep: fmt(T.ultimoEp, 0) }) : t('tr.concluido', { ep: fmt(T.ultimoEp, 0), seg: fmt(T.ms / 1000, 1) });
  } else if (!T.erro) $('status').textContent = t('tr.ociosoStatus');
}

function resumoGrafico(vals, fmtv) {
  const T = S.treino;
  return T.x.length ? t('tr.grafUltimo', { v: fmtv(vals[vals.length - 1]), ep: fmt(T.x[T.x.length - 1], 0) }) : t('tr.grafVazio');
}

function renderGraficos() {
  const T = S.treino, log = $('c-log').checked, xMax = T.nEp || Number($('t-nep').value) || 30000;
  const ref = S.ref.retorno, dados = T.ret.concat([ref]);
  let lo = Math.min(...dados), hi = Math.max(...dados);
  const marg = (hi - lo) * 0.08 || 10; lo -= marg; hi += marg;
  const x = T.x.length ? T.x : [];
  gRet.desenhar({ x, y: T.ret, cor: '#1D2369', xMax, logX: log, yMin: lo, yMax: hi, ref, refRot: t('tr.otimo', { v: fmt(ref, 0) }), xRot: t('tr.eixoEp'), yRot: t('tr.eixoRet'), fmtY: (v) => fmt(v, 0) });
  gSuc.desenhar({ x, y: T.suc, cor: '#2E7D5B', xMax, logX: log, yMin: 0, yMax: 1, ref: 1, refRot: '', xRot: t('tr.eixoEp'), yRot: t('tr.eixoSuc'), fmtY: (v) => `${fmt(v * 100, 0)}%` });
  $('g-ret').setAttribute('aria-label', t('tr.grafRetAria', { resumo: resumoGrafico(T.ret, (v) => fmt(v, 1)) }));
  $('g-suc').setAttribute('aria-label', t('tr.grafSucAria', { resumo: resumoGrafico(T.suc, (v) => `${fmt(v * 100, 1)}%`) }));
}

function renderTudo() { renderResumo(); renderRef(); renderResultados(); renderStatus(); renderGraficos(); desenharMapa(); renderRota(); renderComparacao(); if (editor) { editor.render(); sens.render(); busca.render(); repro.render(); } }

// ---------------------------------------------------------------- treino (worker)
function lerTreino() {
  const algo = ['q', 'sarsa', 'mc', 'ip'].includes($('t-algo').value) ? $('t-algo').value : 'q';
  const passo = $('t-passo').value === 'const' ? 'const' : 'media';
  return { algo, passo, alpha: num('t-alpha', 0.001, 1, 0.1), eps0: num('t-eps', 0, 1, 1), gamma: num('t-gamma', 0, 1, algo === 'ip' ? 0.99 : 0.95),
    nEp: num('t-nep', 100, 500000, 30000, true), seed: num('t-seed', 0, 4294967295, 0, true) };
}

// Mostra só os campos que valem para o algoritmo escolhido; `preset` troca também os valores pelos padrões do algoritmo.
function adaptarCampos(preset) {
  const algo = $('t-algo').value, ip = algo === 'ip', P = PRESETS[algo];
  if (preset) {
    if (P.passo) $('t-passo').value = P.passo;
    if (P.alpha !== undefined) definir('t-alpha', P.alpha);
    if (P.eps !== undefined) definir('t-eps', P.eps);
    definir('t-gamma', P.gamma);
    if (P.nEp) definir('t-nep', P.nEp);
  }
  $('f-passo').hidden = algo !== 'mc';
  $('f-alpha').hidden = ip || (algo === 'mc' && $('t-passo').value !== 'const');
  $('f-eps').hidden = ip; $('f-nep').hidden = ip; $('f-seed').hidden = ip;
  $('tr-nota-algo').textContent = t(`tr.nota.${algo}`);
  $('b-treinar').textContent = t(ip ? 'tr.calcular' : 'tr.treinar');
  $('b-parar').hidden = ip; $('barra').hidden = ip; $('tr-graficos').hidden = ip;
}

function ligarBotoes() {
  const T = S.treino, ocupado = T.rodando;
  $('b-treinar').disabled = ocupado; $('b-parar').disabled = !ocupado || T.parando;
  document.querySelectorAll('#t-algo,#t-passo,#t-alpha,#t-eps,#t-gamma,#t-nep,#t-seed').forEach((el) => { el.disabled = ocupado; });
  $('c-aprendida').disabled = !T.pi;
  atualizarFonteRota();
}

function novoWorker() {
  const w = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
  w.onerror = (ev) => { falhar(ev.message || 'worker'); };
  return w;
}

function falhar(msg) {
  const T = S.treino;
  if (T.worker) T.worker.terminate();
  Object.assign(T, { worker: null, rodando: false, parando: false, erro: true });
  $('status').textContent = t('tr.erro', { msg });
  ligarBotoes();
}

function treinar() {
  const T = S.treino; tomarCorrecoes();
  const p = lerTreino(), corr = tomarCorrecoes();
  $('tr-corrigido').textContent = corr.length ? t('tr.corrigido', { campos: corr.join(', ') }) : '';
  limparTreino(); T.erro = false;
  if (S.setas === 'aprendida') definirSetas(null);
  const cada = Math.max(10, Math.min(500, Math.floor(p.nEp / 20)));
  Object.assign(T, { params: { ...p, cada }, nEp: p.nEp, rodando: true, parando: false });
  try { T.worker = novoWorker(); } catch (_) { falhar(t('tr.semWorker')); return; }
  T.worker.onmessage = ({ data }) => {
    if (data.tipo === 'ip') finalizarIP(data, p.gamma);
    else if (data.tipo === 'progresso') {
      T.ultimoEp = data.ep; T.x.push(data.ep); T.ret.push(data.retorno); T.suc.push(data.sucesso);
      $('barra').value = (100 * data.ep) / T.nEp;
      renderStatus(); renderGraficos();
    } else if (data.tipo === 'fim') finalizar(data);
    else if (data.tipo === 'erro') falhar(data.msg);
  };
  T.worker.postMessage({ env: S.opts, ...T.params });
  if (p.algo === 'ip') $('status').textContent = t('tr.calculandoIp');
  else renderStatus();
  renderGraficos(); ligarBotoes();
}

function finalizarIP(d, gamma) {
  const T = S.treino;
  if (T.worker) T.worker.terminate();
  T.worker = null; T.rodando = false; T.parando = false;
  T.pi = d.pi; T.aval = avaliar(S.env, T.pi, { nEp: 1000 });
  T.ip = { rodadas: d.rodadas, dif: d.dif, iguais: d.iguais, nS: d.nS, v0: d.v0, ms: d.ms, gamma };
  renderStatus(); renderResultados(); ligarBotoes();
}

// Parar: o laço do worker é síncrono, então o worker é encerrado e a Q do último ponto reportado é
// recuperada por reexecução determinística (mesma semente) até esse episódio, também fora da thread principal.
function pararTreino(descartar = false) {
  const T = S.treino;
  if (!T.rodando) return;
  T.worker.terminate(); T.worker = null;
  if (descartar || T.ultimoEp === 0 || T.params.algo === 'ip') { T.rodando = false; T.parando = false; limparTreino(); ligarBotoes(); return; }
  T.parando = true; T.interrompido = true; renderStatus(); ligarBotoes();
  try { T.worker = novoWorker(); } catch (_) { falhar(t('tr.semWorker')); return; }
  T.worker.onmessage = ({ data }) => { if (data.tipo === 'fim') finalizar(data); else if (data.tipo === 'erro') falhar(data.msg); };
  T.worker.postMessage({ env: S.opts, ...T.params, parar: T.ultimoEp });
}

function finalizar({ Q, episodios, ms }) {
  const T = S.treino, env = S.env;
  if (T.worker) T.worker.terminate();
  T.worker = null; T.rodando = false; T.parando = false;
  T.ultimoEp = episodios; T.ms = ms;
  T.pi = politicaGulosa(Q, env.nS, env.nA);
  T.aval = avaliar(env, T.pi, { nEp: 1000 });
  T.ip = null;
  $('barra').value = (100 * episodios) / T.nEp;
  renderStatus(); renderResultados(); renderGraficos(); ligarBotoes();
}

// ---------------------------------------------------------------- rota do barco (animação)
const MAX_PASSOS_ROTA = 100;

function politicaRota() { return $('r-fonte').value === 'aprendida' && S.treino.pi ? S.treino.pi : S.ref.pi; }

// Habilita a opção "aprendida" só depois de treinar; se ela some, a rota volta para a ótima.
function atualizarFonteRota() {
  const sel = $('r-fonte'), opt = sel.querySelector('option[value="aprendida"]'), tem = !!S.treino.pi;
  opt.disabled = !tem; opt.textContent = t(tem ? 'rota.fonteAprendidaOk' : 'rota.fonteAprendida');
  if (!tem && sel.value === 'aprendida') { sel.value = 'otima'; if (S.env) reiniciarRota(); }
}

function pararAnimacao() {
  clearTimeout(S.rota.timer); S.rota.timer = null; S.rota.tocando = false;
  renderBotoesRota();
}

function reiniciarRota() {
  pararAnimacao();
  const seed = num('r-seed', 0, 4294967295, 3, true);
  S.rota.ep = criarEpisodio(S.env, politicaRota(), { seed, maxPassos: MAX_PASSOS_ROTA });
  S.rota.log = [{ tipo: 'inicio', seed, t: 0 }]; S.rota.ultimo = null;
  $('r-anuncio').textContent = '';
  renderRota();
}

function textoEvento(e) {
  const o = S.opts;
  switch (e.tipo) {
    case 'inicio': return t('rota.ev.inicio', { seed: e.seed });
    case 'embarque': return t('rota.ev.embarque', { p: e.pessoa });
    case 'desembarque': return t('rota.ev.desembarque', { p: e.pessoa, r: fmt(S.env.opts.rPessoa, 0) });
    case 'destrocos': return t('rota.ev.destrocos', { r: fmt(o.rDestrocos, 0).replace('-', '−') });
    case 'arraste': return t('rota.ev.arraste');
    case 'fim': return t('rota.ev.fim', { n: fmt(e.t, 0), r: fmt(e.acumulada, 0), b: fmt(S.env.opts.rFinal, 0) });
    default: return t('rota.ev.limite', { n: fmt(MAX_PASSOS_ROTA, 0) });
  }
}

function listaPessoas(s) {
  const { sit } = S.env.decodifica(s);
  return sit.map((v, k) => `P${k + 1} ${t(`rota.sit.${v}`)}`).join(' · ');
}

function renderBotoesRota() {
  const R = S.rota, fim = R.ep && R.ep.terminou, sem = reduzido.matches;
  $('b-play').textContent = t(R.tocando ? 'rota.pausar' : R.ep && R.ep.t > 0 && !fim ? 'rota.retomar' : 'rota.play');
  $('b-play').disabled = sem; $('b-passo').disabled = !!fim;
  $('r-nota-mov').hidden = !sem;
}

function renderRota() {
  const R = S.rota, ep = R.ep;
  if (!ep) return;
  const s = ep.estado, cel = S.env.decodifica(s).cel;
  mapaRota.desenhar({ env: S.env, s, pi: null, trilha: ep.estados.map((x) => S.env.decodifica(x).cel) });
  $('mapa-rota').setAttribute('aria-label', t('rota.mapaAria'));
  $('rota-desc').textContent = `${t('rota.estado', { t: ep.t, i: cel[0] + 1, j: cel[1] + 1, lista: listaPessoas(s) })}\n${renderTexto(S.env, s)}`;
  const u = R.ultimo;
  $('r-hud').innerHTML = metrica(t('rota.hud.passos'), fmt(ep.t, 0)) +
    metrica(t('rota.hud.recPasso'), u ? fmt(u.r, 0) : '—', '', u && u.r < -1 ? 'ruim' : u && u.r > 0 ? 'bom' : '') +
    metrica(t('rota.hud.acum'), fmt(ep.acumulada, 0), '', ep.terminou && ep.acumulada > 0 ? 'bom' : '');
  $('r-pessoas').textContent = t('rota.pessoas', { lista: listaPessoas(s) });
  const itens = R.log.slice().reverse().map((e) => `<li class="ev-${e.tipo}">${e.t ? `<span class="passo">#${e.t}</span>` : ''}${textoEvento(e)}</li>`);
  $('r-log').innerHTML = itens.length ? itens.join('') : `<li class="vazio">${t('rota.logVazio')}</li>`;
  renderBotoesRota();
}

function passoRota() {
  const R = S.rota;
  if (!R.ep || R.ep.terminou) return;
  const r = R.ep.passo(); R.ultimo = r;
  const falar = [];
  for (const e of r.eventos) {
    const ev = { ...e, t: r.t, acumulada: r.acumulada }; R.log.push(ev);
    if (['embarque', 'desembarque', 'fim', 'limite'].includes(e.tipo)) falar.push(`${t('rota.passo')} ${r.t}: ${textoEvento(ev)}`);
  }
  if (falar.length) $('r-anuncio').textContent = falar.join(' ');   // só marcos: embarque, desembarque e término
  if (R.ep.terminou) pararAnimacao();
  renderRota();
}

function agendar() {
  const R = S.rota;
  R.timer = setTimeout(() => { passoRota(); if (R.tocando && !R.ep.terminou) agendar(); }, Number($('r-vel').value) || 450);
}

function alternarPlay() {
  const R = S.rota;
  if (reduzido.matches) return;
  if (R.tocando) { pararAnimacao(); return; }
  if (R.ep.terminou) reiniciarRota();
  R.tocando = true; renderBotoesRota(); agendar();
}

// ---------------------------------------------------------------- comparar algoritmos (pool de workers)
const ALGOS_CMP = [
  { id: 'mc', cor: '#C0392B', tracos: [], p: 'm' },
  { id: 'q', cor: '#1D2369', tracos: [], p: 'q' },
  { id: 'sarsa', cor: '#4A86B8', tracos: [7, 4], p: 's' }
];
const COR_VI = '#2E7D5B';
const nomeAlgo = (id) => (id === 'vi' ? t('cmp.vi') : t(`cmp.${id}`));

function lerCfgCmp(a) {
  const p = a.p, pad = CONFIG_PESQUISA[a.id];
  const cfg = { algo: a.id, alpha: num(`${p}-alpha`, 0.001, 1, pad.alpha), eps0: num(`${p}-eps`, 0, 1, pad.eps0), gamma: num(`${p}-gamma`, 0, 1, pad.gamma), nEp: num(`${p}-nep`, 100, 500000, pad.nEp, true) };
  if (a.id === 'mc') cfg.passo = $('m-passo').value === 'const' ? 'const' : 'media';
  return cfg;
}

function restaurarCfgCmp() {
  for (const a of ALGOS_CMP) {
    const pad = CONFIG_PESQUISA[a.id], p = a.p;
    definir(`${p}-alpha`, pad.alpha); definir(`${p}-eps`, pad.eps0); definir(`${p}-gamma`, pad.gamma); definir(`${p}-nep`, pad.nEp);
  }
  $('m-passo').value = CONFIG_PESQUISA.mc.passo; adaptarCmp();
}
const adaptarCmp = () => { $('m-alpha').disabled = S.cmp.rodando || $('m-passo').value !== 'const'; };

function ligarBotoesCmp() {
  const C = S.cmp, bloqueado = exec.ocupado || (repro && repro.rodando);
  $('b-comparar').disabled = bloqueado; $('b-cmp-cancelar').disabled = !C.rodando;
  $('b-csv').disabled = !C.res || C.rodando; $('b-csv-curvas').disabled = !C.res || C.rodando;
  document.querySelectorAll('#cmp-nsem, #c-nsem, .cmp-linha input, .cmp-linha select, #b-cmp-padrao').forEach((el) => { el.disabled = C.rodando; });
  adaptarCmp();
}

function statusCmp(fn) { S.cmp.statusFn = fn; $('cmp-status').textContent = fn ? fn() : ''; }

function descartarComparacao() {
  const C = S.cmp;
  C.corrida = (C.corrida || 0) + 1;
  if (C.rodando) exec.cancelar();
  C.rodando = false; C.res = null;
  if ($('cmp-barra')) { $('cmp-barra').value = 0; statusCmp(() => t('cmp.ocioso')); $('cmp-res').hidden = true; ligarBotoesCmp(); }
}

// Tudo o que depende do ambiente atual (comparação, sensibilidade, busca) é cancelado e descartado.
function descartarPesquisas() {
  if (repro) repro.cancelar();
  descartarComparacao();
  if (sens) { sens.descartar(); busca.descartar(); }
}

// Roda a comparação; `nSemente` (opcional) força o nº de sementes; `onFrac(f)` recebe o progresso (0..1). Resolve true se concluiu.
async function comparar({ onFrac = null } = {}) {
  const C = S.cmp;
  if (C.rodando || exec.ocupado) return false;
  const cfgs = ALGOS_CMP.map(lerCfgCmp), nSem = Number($('c-nsem').value) || 5, id = (C.corrida = (C.corrida || 0) + 1);
  const tarefas = [];
  cfgs.forEach((cfg) => { for (let k = 0; k < nSem; k++) tarefas.push({ env: S.opts, cfg, seed: SEMENTE_BASE + k, nEpAval: 2000, peso: cfg.nEp }); });
  const nW = Math.min(exec.tamanho, tarefas.length), t0 = performance.now(), env = S.env;
  Object.assign(C, { rodando: true, t0, res: null }); C.ultimoPct = 0; C.ultimaAtual = 0;
  $('cmp-res').hidden = true; $('cmp-barra').value = 0;
  statusCmp(() => t('cmp.iniciando', { total: tarefas.length, n: nW })); ligarBotoesCmp();
  $('cmp-anuncio').textContent = t('cmp.iniciando', { total: tarefas.length, n: nW });
  try {
    const out = await exec.executar(tarefas, {
      onProgresso: (frac, feitas, total) => {
        if (onFrac) onFrac(frac);
        const agora = performance.now();
        if (agora - C.ultimaAtual < 250 && feitas < total) return;
        C.ultimaAtual = agora; $('cmp-barra').value = frac * 100;
        const seg = (agora - t0) / 1000, eta = frac > 0.03 ? (seg * (1 - frac)) / frac : null;
        statusCmp(() => t('cmp.rodando', { pct: fmt(frac * 100, 0), feitas, total, eta: eta === null ? '…' : duracao(eta), n: nW }));
        const marco = Math.floor(frac * 4) * 25;
        if (marco > C.ultimoPct && marco < 100) { C.ultimoPct = marco; $('cmp-anuncio').textContent = t('cmp.anuncioMeio', { pct: marco }); }
      }
    });
    if (C.corrida !== id || S.env !== env) return false;                     // o ambiente mudou durante a execução
    const grupos = {}; ALGOS_CMP.forEach((a, i) => { grupos[a.id] = out.slice(i * nSem, (i + 1) * nSem); });
    const ag = {}; for (const a of ALGOS_CMP) ag[a.id] = agregar(grupos[a.id]);
    const aval = avaliar(env, S.ref.pi, { nEp: 2000 }), seg = (performance.now() - t0) / 1000;
    C.res = { nSem, cfgs, grupos, ag, vi: { v0: S.ref.v0, aval, pi: S.ref.pi }, retVi: aval.retorno };
    C.rodando = false; $('cmp-barra').value = 100;
    statusCmp(() => t('cmp.concluido', { seg: fmt(seg, 1), total: tarefas.length, n: nW }));
    $('cmp-anuncio').textContent = t('cmp.concluido', { seg: fmt(seg, 1), total: tarefas.length, n: nW });
    renderComparacao(); ligarBotoesCmp(); if (repro) repro.ligarBotoes();
    return true;
  } catch (e) {
    if (C.corrida !== id) return false;
    C.rodando = false;
    if (e && e.cancelado) statusCmp(() => t('cmp.cancelado')); else statusCmp(() => t('cmp.erro', { msg: e && e.message ? e.message : String(e) }));
    $('cmp-anuncio').textContent = $('cmp-status').textContent;
    ligarBotoesCmp();
    return false;
  }
}

const miniMapas = {};
function garantirMiniMapas() {
  if (miniMapas.vi) return;
  const cont = $('cmp-mapas');
  for (const id of ['vi', 'mc', 'q', 'sarsa']) {
    const fig = document.createElement('figure');
    fig.innerHTML = `<figcaption></figcaption><div class="mapa-caixa"><canvas role="img"></canvas></div>`;
    cont.appendChild(fig);
    const canvas = fig.querySelector('canvas');
    miniMapas[id] = { fig, canvas, mapa: criarMapa(canvas, 13) };
  }
}

const seta = (d) => (d > 0.005 ? '+' : '') + fmt(d, 2);

function renderComparacao() {
  const C = S.cmp, res = C.res;
  if (!$('cmp-res')) return;
  if (!res) { $('cmp-res').hidden = true; if (!C.rodando) $('cmp-status').textContent = C.statusFn ? C.statusFn() : t('cmp.ocioso'); else $('cmp-status').textContent = C.statusFn(); return; }
  if (C.statusFn) $('cmp-status').textContent = C.statusFn();
  $('cmp-res').hidden = false;
  const linhas = linhasTabela(res.vi, ALGOS_CMP.map((a) => [a.id, res.ag[a.id]]));
  $('cmp-tab').setAttribute('aria-label', t('cmp.tabAria'));
  $('cmp-tab').innerHTML = `<thead><tr><th scope="col">${t('cmp.col.algo')}</th><th scope="col">${t('cmp.col.n')}</th><th scope="col">${t('cmp.col.desc')}</th><th scope="col">${t('cmp.col.dif')}</th><th scope="col">${t('cmp.col.ret')}</th><th scope="col">${t('cmp.col.suc')}</th><th scope="col">${t('cmp.col.pas')}</th></tr></thead><tbody>` +
    linhas.map((l) => `<tr><th scope="row">${nomeAlgo(l.id)}</th><td>${l.id === 'vi' ? '—' : l.n}</td><td>${fmt(l.desc, 2)}${l.id === 'vi' ? '' : ` ± ${fmt(l.ic95, 2)}`}</td><td>${l.id === 'vi' ? '—' : seta(l.dif)}</td><td>${fmt(l.retorno, 1)}</td><td>${fmt(l.sucesso * 100, 1)}%</td><td>${fmt(l.passos, 1)}</td></tr>`).join('') + `</tbody>`;
  $('cmp-nota-ic').textContent = t('cmp.notaIc', { n: res.nSem, v: fmt(res.vi.v0, 2) });

  // legenda e gráficos de curvas
  $('cmp-leg').innerHTML = ALGOS_CMP.map((a) => `<li><span class="linha-leg" style="color:${a.cor};border-top-style:${a.tracos.length ? 'dashed' : 'solid'}"></span><span>${nomeAlgo(a.id)}</span></li>`).join('') +
    `<li><span class="linha-leg" style="color:${COR_VI};border-top-style:dotted"></span><span>${t('cmp.refVi')}</span></li>`;
  const log = $('cmp-log').checked, xs = ALGOS_CMP.map((a) => res.ag[a.id].curva.x);
  const xMin = Math.min(...xs.map((x) => x[0])), xMax = Math.max(...xs.map((x) => x[x.length - 1]));
  const serie = (a, y, ic) => { const c = res.ag[a.id].curva; return { x: c.x, y: c[y], lo: c[y].map((v, i) => v - c[ic][i]), hi: c[y].map((v, i) => v + c[ic][i]), cor: a.cor, tracos: a.tracos }; };
  const sr = ALGOS_CMP.map((a) => serie(a, 'ret', 'retIc')), ss = ALGOS_CMP.map((a) => serie(a, 'suc', 'sucIc'));
  const todos = sr.flatMap((x) => x.lo.concat(x.hi)).concat([res.retVi]);
  let lo = Math.min(...todos), hi = Math.max(...todos); const m = (hi - lo) * 0.06 || 5; lo -= m; hi += m;
  gcRet.desenhar({ series: sr, refs: [{ y: res.retVi, cor: COR_VI, tracos: [2, 4] }], xMin, xMax, logX: log, yMin: lo, yMax: hi, xRot: t('tr.eixoEp'), yRot: t('tr.eixoRet'), fmtY: (v) => fmt(v, 0) });
  gcSuc.desenhar({ series: ss, refs: [{ y: 1, cor: COR_VI, tracos: [2, 4] }], xMin, xMax, logX: log, yMin: 0, yMax: 1.02, xRot: t('tr.eixoEp'), yRot: t('tr.eixoSuc'), fmtY: (v) => `${fmt(v * 100, 0)}%` });
  const fim = (y, f) => ALGOS_CMP.map((a, i) => t('cmp.grafFinal', { nome: nomeAlgo(a.id), v: f(y[i].y[y[i].y.length - 1]) })).join(' ');
  $('cg-ret').setAttribute('aria-label', t('cmp.grafRetAria', { resumo: fim(sr, (v) => fmt(v, 1)) }));
  $('cg-suc').setAttribute('aria-label', t('cmp.grafSucAria', { resumo: fim(ss, (v) => `${fmt(v * 100, 1)}%`) }));

  // mini-mapas com a política gulosa da semente representativa
  garantirMiniMapas();
  for (const id of ['vi', 'mc', 'q', 'sarsa']) {
    const mm = miniMapas[id], vi = id === 'vi', ag = res.ag[id], r = vi ? null : res.grupos[id][ag.representativa];
    const pi = vi ? res.vi.pi : r.pi, ret = vi ? res.vi.v0 : r.aval.retornoDesc;
    mm.fig.querySelector('figcaption').innerHTML = `${nomeAlgo(id)}<small>${vi ? t('cmp.mapaSubVi', { r: fmt(ret, 2) }) : t('cmp.mapaSub', { r: fmt(ret, 2), s: r.seed })}</small>`;
    mm.canvas.setAttribute('aria-label', t('cmp.mapaAria', { nome: nomeAlgo(id), r: fmt(ret, 2) }));
    mm.mapa.desenhar({ env: S.env, s: S.env.s0, pi });
  }
}

const r4 = (v) => Math.round(v * 1e4) / 1e4;
function csvComparacao() {
  const res = S.cmp.res; if (!res) return null;
  const linhas = linhasTabela(res.vi, ALGOS_CMP.map((a) => [a.id, res.ag[a.id]]));
  return paraCSV(
    [t('cmp.col.algo'), t('cmp.col.n'), t('cmp.col.desc').replace(/\s*\(.*\)\s*$/, ''), t('cmp.col.ic'), t('cmp.col.dif'), t('cmp.col.ret'), t('cmp.col.suc'), t('cmp.col.pas')],
    linhas.map((l) => [nomeAlgo(l.id), l.id === 'vi' ? 1 : l.n, r4(l.desc), r4(l.ic95), r4(l.dif), r4(l.retorno), r4(l.sucesso), r4(l.passos)]));
}

function csvCurvas() {
  const res = S.cmp.res; if (!res) return null;
  const linhas = [];
  for (const a of ALGOS_CMP) { const c = res.ag[a.id].curva; c.x.forEach((x, i) => linhas.push([nomeAlgo(a.id), x, r4(c.ret[i]), r4(c.retIc[i]), r4(c.suc[i]), r4(c.sucIc[i])])); }
  return paraCSV([t('cmp.col.algo'), t('tr.eixoEp'), t('tr.eixoRet'), `IC95 ${t('tr.eixoRet')}`, t('tr.eixoSuc'), `IC95 ${t('tr.eixoSuc')}`], linhas);
}
const exportarCsv = () => { const x = csvComparacao(); if (x) baixarCSV('comparacao-algoritmos', x); };
const exportarCsvCurvas = () => { const x = csvCurvas(); if (x) baixarCSV('curvas-aprendizado', x); };

// ---------------------------------------------------------------- F3: sensibilidade, busca, editor de mapa, reprodução, link
const exec = criarExecutor();
let sens = null, busca = null, editor = null, repro = null;

// Preenche os campos do cartão Treinar (usado pela busca de hiperparâmetros e pelo link compartilhado). Devolve false se há treino em curso.
function aplicarNoTreino(c) {
  if (S.treino.rodando) return false;
  if (c.algo) { $('t-algo').value = c.algo; adaptarCampos(true); }
  if (c.passo) $('t-passo').value = c.passo;
  if (c.alpha !== undefined) definir('t-alpha', c.alpha);
  if (c.eps0 !== undefined) definir('t-eps', c.eps0);
  if (c.gamma !== undefined) definir('t-gamma', c.gamma);
  if (c.nEp !== undefined) definir('t-nep', c.nEp);
  if (c.seed !== undefined) definir('t-seed', c.seed);
  adaptarCampos(false); if (S.ref) renderGraficos();
  return true;
}

function aplicarMapa(linhas) { S.mapa = linhas; reconstruir(true); }

function restaurarAmbientePadrao() {
  definir('p-destrocos', PADRAO.rDestrocos); definir('p-corr', PADRAO.pCorr); $('p-cap').value = PADRAO.capacidade;
  S.mapa = MAPA_PADRAO.slice(); editor.definir(S.mapa); reconstruir(true);
}

const etapasRepro = [
  { id: 'cmp', prepara: () => { restaurarCfgCmp(); $('c-nsem').value = '20'; },
    custo: () => 20 * Object.values(CONFIG_PESQUISA).reduce((a, c) => a + c.nEp, 0), rodar: (onFrac) => comparar({ onFrac }) },
  { id: 'sens', prepara: () => { sens.restaurarPadrao(); $('s-nsem').value = '10'; sens.descartarRL(); },
    custo: () => PENALIDADES_PADRAO.length * 2 * 10 * CFG_SENS.nEp, rodar: (onFrac) => sens.rodar({ vi: true, rl: true, nSemente: 10, onFrac }) },
  { id: 'busca', prepara: () => busca.restaurarPadrao(),
    custo: () => SEMENTES_BUSCA * gerarConfigs(GRADE_PADRAO).reduce((a, c) => a + c.nEp, 0), rodar: (onFrac) => busca.rodar({ onFrac }) }
];

function textoLeiame() {
  const o = S.opts, linhas = [t('rep.leiame.titulo'), new Date().toISOString().slice(0, 10), '',
    t('rep.leiame.amb', { r: String(o.rDestrocos).replace('-', '−'), p: o.pCorr, c: o.capacidade, nS: S.env.nS, v: fmt(S.ref.v0, 2) }), '',
    t('rep.leiame.arquivos'), '- comparacao-algoritmos.csv', '- curvas-aprendizado.csv', '- sensibilidade_destrocos.csv', '- busca_hiperparametros.csv', '- busca_por_semente.csv'];
  return linhas.join('\r\n') + '\r\n';
}

function arquivosCsv() {
  const a = [], c1 = csvComparacao();
  if (c1) a.push({ nome: 'comparacao-algoritmos.csv', texto: c1 }, { nome: 'curvas-aprendizado.csv', texto: csvCurvas() });
  const cs = sens.csv(); if (cs) a.push({ nome: 'sensibilidade_destrocos.csv', texto: cs });
  const cb = busca.csv(); if (cb) a.push({ nome: 'busca_hiperparametros.csv', texto: cb.busca }, { nome: 'busca_por_semente.csv', texto: cb.porSemente });
  if (a.length) a.push({ nome: 'LEIAME.txt', texto: textoLeiame() });
  return a;
}

// ---- link compartilhável (hash da URL)
const configAtual = () => {
  const p = lerTreino(), o = S.opts;
  return { mapa: S.mapa, amb: { rDestrocos: o.rDestrocos, pCorr: o.pCorr, capacidade: o.capacidade },
    treino: { algo: p.algo, passo: p.passo, alpha: p.alpha, eps0: p.eps0, gamma: p.gamma, nEp: p.nEp, seed: p.seed } };
};
let avisosLink = [];

function textoAvisoLink(a) {
  if (a.codigo === 'ilegivel') return t('link.av.ilegivel');
  if (a.codigo === 'versao') return t('link.av.versao', { v: a.campo });
  if (a.codigo === 'mapa') return t('link.av.mapa', { motivos: a.erros.map((e) => t(`val.${e.codigo}`, e)).join(' ') });
  const nome = t(`link.campo.${a.campo.replace('.', '_')}`);
  return t('link.av.campo', { campo: nome === `link.campo.${a.campo.replace('.', '_')}` ? a.campo : nome });
}

function renderAvisoLink() {
  const el = $('aviso-link');
  el.hidden = !avisosLink.length;
  if (!avisosLink.length) { el.querySelector('ul').innerHTML = ''; return; }
  $('aviso-link-titulo').textContent = t('link.av.titulo');
  el.querySelector('ul').innerHTML = avisosLink.map((a) => `<li>${textoAvisoLink(a).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</li>`).join('');
}

// Lê a configuração do hash e preenche os campos (sem reconstruir). Devolve true se algo foi aplicado.
function carregarDoHash() {
  let r;
  try { r = decodificar(location.hash); } catch (_) { r = { cfg: null, avisos: [{ codigo: 'ilegivel' }] }; }
  avisosLink = r.avisos; renderAvisoLink();
  const c = r.cfg; if (!c) return false;
  if (c.amb) {
    if (c.amb.rDestrocos !== undefined) definir('p-destrocos', c.amb.rDestrocos);
    if (c.amb.pCorr !== undefined) definir('p-corr', c.amb.pCorr);
    if (c.amb.capacidade !== undefined) $('p-cap').value = c.amb.capacidade;
  }
  if (c.mapa) { S.mapa = c.mapa; if (editor) editor.definir(S.mapa); }
  if (c.treino) { const antes = S.treino.rodando; S.treino.rodando = false; aplicarNoTreino(c.treino); S.treino.rodando = antes; }
  return true;
}

async function copiarLink() {
  const cfg = configAtual(), url = linkCom(location.href, cfg);
  $('link-url').value = url;
  try { history.replaceState(null, '', `#${codificar(cfg)}`); } catch (_) { /* o endereço da barra é só uma conveniência */ }
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch (_) {
    try { $('link-url').select(); ok = document.execCommand('copy'); } catch (__) { ok = false; }
  }
  $('link-status').textContent = t(ok ? 'link.copiado' : 'link.copieManual');
  if (!ok) { $('link-url').focus(); $('link-url').select(); }
}

// ---------------------------------------------------------------- eventos
function ligar() {
  document.querySelectorAll('[data-lang-btn]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.langBtn)));
  onLang(() => { if ($('aviso-amb').textContent) $('aviso-amb').textContent = ''; adaptarCampos(false); atualizarFonteRota(); ligarBotoesCmp(); renderTudo(); if (busca) busca.atualizarResumo(); ['sens-anuncio', 'cmp-anuncio', 'busca-anuncio', 'rep-anuncio', 'r-anuncio'].forEach((id) => { $(id).textContent = ''; }); renderAvisoLink(); $('link-status').textContent = ''; });
  ['p-destrocos', 'p-corr', 'p-cap'].forEach((id) => $(id).addEventListener('change', () => reconstruir(true)));
  $('b-restaurar').addEventListener('click', () => {
    definir('p-destrocos', PADRAO.rDestrocos); definir('p-corr', PADRAO.pCorr); $('p-cap').value = PADRAO.capacidade;
    reconstruir(true);
  });
  $('c-otima').addEventListener('change', (e) => definirSetas(e.target.checked ? 'otima' : null));
  $('c-aprendida').addEventListener('change', (e) => definirSetas(e.target.checked ? 'aprendida' : null));
  $('c-log').addEventListener('change', renderGraficos);
  $('t-nep').addEventListener('change', () => { if (!S.treino.rodando && !S.treino.x.length) renderGraficos(); });
  $('t-algo').addEventListener('change', () => { adaptarCampos(true); if (S.treino.x.length === 0) renderGraficos(); });
  $('t-passo').addEventListener('change', () => adaptarCampos(false));
  $('b-treinar').addEventListener('click', treinar);
  // rota
  $('b-play').addEventListener('click', alternarPlay);
  $('b-passo').addEventListener('click', () => { pararAnimacao(); passoRota(); });
  $('b-reiniciar').addEventListener('click', reiniciarRota);
  ['r-fonte', 'r-seed'].forEach((id) => $(id).addEventListener('change', reiniciarRota));
  $('r-vel').addEventListener('change', () => { if (S.rota.tocando) { clearTimeout(S.rota.timer); agendar(); } });
  reduzido.addEventListener('change', () => { if (reduzido.matches) pararAnimacao(); renderBotoesRota(); });
  // comparação
  $('b-comparar').addEventListener('click', comparar);
  $('b-cmp-cancelar').addEventListener('click', () => exec.cancelar());
  $('b-cmp-padrao').addEventListener('click', restaurarCfgCmp);
  $('m-passo').addEventListener('change', adaptarCmp);
  $('cmp-log').addEventListener('change', renderComparacao);
  $('b-csv').addEventListener('click', exportarCsv);
  $('b-csv-curvas').addEventListener('click', exportarCsvCurvas);
  $('b-parar').addEventListener('click', () => pararTreino(false));
  // F3
  $('b-link').addEventListener('click', copiarLink);
  $('aviso-link-fechar').addEventListener('click', () => { avisosLink = []; renderAvisoLink(); });
  window.addEventListener('hashchange', () => { if (carregarDoHash()) reconstruir(true); });
}

iniciarEscala();
i18nIniciar();
ligar();
adaptarCampos(true);
carregarDoHash();   // link compartilhado: preenche campos e mapa antes de construir o ambiente
const ctxMod = { S, exec, bloqueado: () => !!(repro && repro.rodando), aplicarNoTreino: (c) => aplicarNoTreino(c), aplicarMapa };
sens = criarSensibilidade(ctxMod); busca = criarBusca(ctxMod); editor = criarEditor(ctxMod);
repro = criarReproducao({ exec, restaurarAmbientePadrao, etapas: etapasRepro, arquivosCsv, temResultado: () => !!S.cmp.res || sens.temRL || busca.temResultado });
sens.ligar(); busca.ligar(); editor.ligar(); repro.ligar();
exec.onMudanca(ligarBotoesCmp);
reconstruir(false);
statusCmp(() => t('cmp.ocioso')); ligarBotoesCmp();
renderStatus(); ligarBotoes();

// Navegação por seções: destaca no menu a seção visível (aria-current). / Highlights the visible section in the nav.
function ligarNavegacao() {
  const nav = document.querySelector('.nav'), links = [...document.querySelectorAll('.nav a[href^="#"]')], secoes = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  const marcar = (id) => links.forEach((a) => { if (a.getAttribute('href') === `#${id}`) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  if (!('IntersectionObserver' in window)) return;
  const vis = new Set();
  let obs = null;
  // A altura da barra fixa muda com a escala/fonte: publica em --nav-h (usada no scroll-margin das seções) e refaz o observador.
  const criar = () => {
    const h = Math.ceil(nav.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--nav-h', `${h}px`);
    if (obs) obs.disconnect();
    vis.clear();
    obs = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) vis.add(e.target.id); else vis.delete(e.target.id); });
      const primeira = secoes.find((s) => vis.has(s.id));
      if (primeira) {
        marcar(primeira.id);
        const a = document.querySelector(`.nav a[href="#${primeira.id}"]`), nv = a && a.closest('.nav-in');
        if (nv && nv.scrollWidth > nv.clientWidth) nv.scrollLeft = Math.max(0, a.offsetLeft - 24);
      }
    }, { rootMargin: `-${h + 2}px 0px -60% 0px` });
    secoes.forEach((s) => obs.observe(s));
  };
  criar();
  if (typeof ResizeObserver !== 'undefined') { let ultima = nav.getBoundingClientRect().height; new ResizeObserver(() => { const n = nav.getBoundingClientRect().height; if (Math.abs(n - ultima) > 0.5) { ultima = n; criar(); } }).observe(nav); }
}
ligarNavegacao();
