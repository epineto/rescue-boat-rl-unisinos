// Orquestrador da interface (F1). / UI orchestrator.
import { criarAmbiente, renderTexto } from '../env.js';
import { iteracaoValor, politicaGulosa, avaliar } from '../algos.js';
import { iniciar as i18nIniciar, setLang, onLang, t, fmt } from './i18n.js';
import { criarMapa } from './mapa.js';
import { criarGrafico } from './graficos.js';

const $ = (id) => document.getElementById(id);
const GAMMA_REF = 0.99, PADRAO = { rDestrocos: -10, pCorr: 0.2, capacidade: 2 };

const S = {
  opts: { ...PADRAO }, env: null, ref: null,
  treino: { worker: null, rodando: false, parando: false, nEp: 0, params: null, ultimoEp: 0, x: [], ret: [], suc: [], Q: null, pi: null, aval: null, ms: 0, interrompido: false },
  setas: null   // null | 'otima' | 'aprendida'
};

const mapa = criarMapa($('mapa'));
const gRet = criarGrafico($('g-ret'));
const gSuc = criarGrafico($('g-suc'));

// ---------------------------------------------------------------- leitura de campos
function num(id, min, max, padrao, inteiro = false) {
  const el = $(id);
  let v = parseFloat(String(el.value).replace(',', '.'));
  if (!Number.isFinite(v)) v = padrao;
  v = Math.min(max, Math.max(min, v));
  if (inteiro) v = Math.round(v);
  el.value = String(v);
  return v;
}
const lerEnv = () => ({ rDestrocos: num('p-destrocos', -100, 0, PADRAO.rDestrocos), pCorr: num('p-corr', 0, 1, PADRAO.pCorr), capacidade: num('p-cap', 1, 3, PADRAO.capacidade, true) });

// ---------------------------------------------------------------- ambiente e referência
function reconstruir(avisar) {
  pararTreino(true);
  S.opts = lerEnv();
  S.env = criarAmbiente(S.opts);
  const vi = iteracaoValor(S.env, GAMMA_REF);
  const av = avaliar(S.env, vi.pi, { nEp: 1000 });
  S.ref = { v0: vi.V[S.env.s0], varreduras: vi.varreduras, pi: vi.pi, passos: av.passos, sucesso: av.sucesso, retorno: av.retorno };
  limparTreino();
  if (S.setas === 'aprendida') definirSetas(null);
  $('aviso-amb').textContent = avisar ? t('amb.invalidado') : '';
  renderTudo();
}

function limparTreino() {
  Object.assign(S.treino, { ultimoEp: 0, x: [], ret: [], suc: [], Q: null, pi: null, aval: null, interrompido: false });
  $('barra').value = 0; $('status').textContent = t('tr.ociosoStatus');
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
  $('mapa').setAttribute('aria-label', t('amb.mapaAria'));
}

// ---------------------------------------------------------------- renderização de textos dinâmicos
const metrica = (rot, val, sub = '', cls = '') => `<div class="${cls}"><dt>${rot}</dt><dd>${val}${sub ? `<small>${sub}</small>` : ''}</dd></div>`;

function renderResumo() {
  const o = S.opts, e = S.env;
  $('resumo').textContent = t('amb.resumo', { nl: e.nl, nc: e.nc, nS: e.nS, rDestrocos: fmt(o.rDestrocos, 0), pOk: fmt(1 - o.pCorr, 2), pCorr: fmt(o.pCorr, 2) });
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
  const a = T.aval, dif = a.retornoDesc - S.ref.v0, bom = Math.abs(dif) < 2;
  el.innerHTML = `<dl class="metricas">` +
    metrica(t('tr.res.retDesc'), fmt(a.retornoDesc, 2), t('tr.res.vsOtimo', { v: fmt(S.ref.v0, 2), d: (dif > 0 ? '+' : '') + fmt(dif, 2) }), bom ? 'bom' : 'ruim') +
    metrica(t('tr.res.sucesso'), `${fmt(a.sucesso * 100, 1)}%`, '', a.sucesso > 0.99 ? 'bom' : 'ruim') +
    metrica(t('tr.res.passos'), fmt(a.passos, 1), `${t('ref.passos')}: ${fmt(S.ref.passos, 1)}`) + `</dl>`;
}

function renderStatus() {
  const T = S.treino;
  if (T.parando) { $('status').textContent = t('tr.parando'); return; }
  if (T.rodando) { $('status').textContent = t('tr.rodando', { ep: fmt(T.ultimoEp, 0), nEp: fmt(T.nEp, 0), pct: fmt((100 * T.ultimoEp) / T.nEp, 0) }); return; }
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

function renderTudo() { renderResumo(); renderRef(); renderResultados(); renderStatus(); renderGraficos(); desenharMapa(); }

// ---------------------------------------------------------------- treino (worker)
function lerTreino() {
  return { algo: $('t-algo').value === 'sarsa' ? 'sarsa' : 'q', alpha: num('t-alpha', 0.001, 1, 0.1), eps0: num('t-eps', 0, 1, 1), gamma: num('t-gamma', 0, 1, 0.95),
    nEp: num('t-nep', 100, 500000, 30000, true), seed: num('t-seed', 0, 4294967295, 0, true) };
}

function ligarBotoes() {
  const T = S.treino, ocupado = T.rodando;
  $('b-treinar').disabled = ocupado; $('b-parar').disabled = !ocupado || T.parando;
  document.querySelectorAll('#t-algo,#t-alpha,#t-eps,#t-gamma,#t-nep,#t-seed').forEach((el) => { el.disabled = ocupado; });
  $('c-aprendida').disabled = !T.pi;
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
  const T = S.treino, p = lerTreino();
  limparTreino(); T.erro = false;
  if (S.setas === 'aprendida') definirSetas(null);
  const cada = Math.max(10, Math.min(500, Math.floor(p.nEp / 20)));
  Object.assign(T, { params: { ...p, cada }, nEp: p.nEp, rodando: true, parando: false });
  try { T.worker = novoWorker(); } catch (_) { falhar(t('tr.semWorker')); return; }
  T.worker.onmessage = ({ data }) => {
    if (data.tipo === 'progresso') {
      T.ultimoEp = data.ep; T.x.push(data.ep); T.ret.push(data.retorno); T.suc.push(data.sucesso);
      $('barra').value = (100 * data.ep) / T.nEp;
      renderStatus(); renderGraficos();
    } else if (data.tipo === 'fim') finalizar(data);
    else if (data.tipo === 'erro') falhar(data.msg);
  };
  T.worker.postMessage({ env: S.opts, ...T.params });
  renderStatus(); renderGraficos(); ligarBotoes();
}

// Parar: o laço do worker é síncrono, então o worker é encerrado e a Q do último ponto reportado é
// recuperada por reexecução determinística (mesma semente) até esse episódio, também fora da thread principal.
function pararTreino(descartar = false) {
  const T = S.treino;
  if (!T.rodando) return;
  T.worker.terminate(); T.worker = null;
  if (descartar || T.ultimoEp === 0) { T.rodando = false; T.parando = false; limparTreino(); ligarBotoes(); return; }
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
  $('barra').value = (100 * episodios) / T.nEp;
  renderStatus(); renderResultados(); renderGraficos(); ligarBotoes();
}

// ---------------------------------------------------------------- eventos
function ligar() {
  document.querySelectorAll('[data-lang-btn]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.langBtn)));
  onLang(() => { if ($('aviso-amb').textContent) $('aviso-amb').textContent = ''; renderTudo(); });
  ['p-destrocos', 'p-corr', 'p-cap'].forEach((id) => $(id).addEventListener('change', () => reconstruir(true)));
  $('b-restaurar').addEventListener('click', () => {
    $('p-destrocos').value = PADRAO.rDestrocos; $('p-corr').value = PADRAO.pCorr; $('p-cap').value = PADRAO.capacidade;
    reconstruir(true);
  });
  $('c-otima').addEventListener('change', (e) => definirSetas(e.target.checked ? 'otima' : null));
  $('c-aprendida').addEventListener('change', (e) => definirSetas(e.target.checked ? 'aprendida' : null));
  $('c-log').addEventListener('change', renderGraficos);
  $('t-nep').addEventListener('change', () => { if (!S.treino.rodando && !S.treino.x.length) renderGraficos(); });
  $('b-treinar').addEventListener('click', treinar);
  $('b-parar').addEventListener('click', () => pararTreino(false));
}

i18nIniciar();
ligar();
reconstruir(false);
renderStatus(); ligarBotoes();
