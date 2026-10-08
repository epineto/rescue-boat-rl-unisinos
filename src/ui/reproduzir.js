// Seção "Reproduzir a pesquisa": Comparação (20 sementes) + Sensibilidade completa + Busca completa, em sequência.
// "Reproduce the study" section: Comparison (20 seeds) + full Sensitivity + full Search, run in sequence.
import { t, fmt } from './i18n.js';
import { $, textoEta, limitador } from './util.js';
import { baixarZip } from './zip.js';

const BOM = '﻿';

// ctx: { exec, restaurarAmbientePadrao (), etapas: [{ id, prepara (), custo () => episódios, rodar (onFrac) => Promise<boolean> }],
//        arquivosCsv () => [{ nome, texto }], temResultado () }
export function criarReproducao(ctx) {
  const R = { rodando: false, cancelado: false, estados: {}, atual: null, statusFn: null, ultimaFalha: null };
  const ETAPAS = ctx.etapas.map((e) => e.id);
  ETAPAS.forEach((id) => { R.estados[id] = 'espera'; });
  const lim = limitador(300);
  const status = (fn) => { R.statusFn = fn; $('rep-status').textContent = fn ? fn() : ''; };

  function renderEtapas() {
    $('rep-etapas').innerHTML = ETAPAS.map((id, i) => {
      const e = R.estados[id];
      return `<li class="etapa ${e}"><span class="marca" aria-hidden="true">${{ espera: '○', andamento: '▶', ok: '✓', cancelada: '✕', erro: '✕' }[e]}</span>` +
        `<span><strong>${i + 1}. ${t(`rep.etapa.${id}`)}</strong> <span class="estado">— ${t(`rep.estado.${e}`)}</span></span></li>`;
    }).join('');
  }

  function ligarBotoes() {
    $('b-rep').disabled = R.rodando || ctx.exec.ocupado;
    $('b-rep-cancelar').disabled = !R.rodando;
    $('b-rep-zip').disabled = R.rodando || !ctx.temResultado();
  }

  function render() {
    renderEtapas(); ligarBotoes();
    if (R.statusFn) $('rep-status').textContent = R.statusFn();
  }

  async function iniciar() {
    if (R.rodando || ctx.exec.ocupado) return;
    ctx.restaurarAmbientePadrao();
    R.rodando = true;                 // a pesquisa vale para o ambiente e o mapa padrão
    ETAPAS.forEach((id) => { R.estados[id] = 'espera'; });
    R.cancelado = false; R.atual = null;
    ctx.etapas.forEach((e) => e.prepara());        // restaura os padrões da pesquisa em cada cartão (20 / 10 / grade completa)
    const custos = ctx.etapas.map((e) => e.custo()), total = custos.reduce((a, b) => a + b, 0), t0 = performance.now();
    $('rep-barra').value = 0; renderEtapas(); ligarBotoes();
    $('rep-anuncio').textContent = t('rep.iniciada');
    let base = 0, ok = true, falhou = null;
    for (let i = 0; i < ctx.etapas.length; i++) {
      const e = ctx.etapas[i], peso = custos[i] / total;
      if (R.cancelado) { ok = false; falhou = e.id; R.estados[e.id] = 'cancelada'; break; }
      R.atual = e.id; R.estados[e.id] = 'andamento'; renderEtapas();
      status(() => t('rep.rodando', { etapa: i + 1, n: ctx.etapas.length, nome: t(`rep.etapa.${e.id}`), pct: fmt(base * 100, 0), eta: '…' }));
      $('rep-anuncio').textContent = t('rep.anuncioEtapa', { etapa: i + 1, n: ctx.etapas.length, nome: t(`rep.etapa.${e.id}`) });
      await ctx.exec.livre();
      if (R.cancelado) { ok = false; falhou = e.id; R.estados[e.id] = 'cancelada'; break; }
      const b0 = base;
      const feito = await e.rodar((frac) => {
        const g = b0 + peso * frac;
        lim(() => {
          $('rep-barra').value = g * 100;
          status(() => t('rep.rodando', { etapa: i + 1, n: ctx.etapas.length, nome: t(`rep.etapa.${e.id}`), pct: fmt(g * 100, 0), eta: textoEta(g, t0) }));
        });
      });
      if (!feito) { ok = false; falhou = e.id; R.estados[e.id] = R.cancelado ? 'cancelada' : 'erro'; break; }
      R.estados[e.id] = 'ok'; base += peso; $('rep-barra').value = base * 100;
    }
    R.rodando = false; R.atual = null;
    const seg = (performance.now() - t0) / 1000;
    if (ok) {
      $('rep-barra').value = 100;
      status(() => t('rep.concluida', { seg: fmt(seg, 0) }));
      $('rep-anuncio').textContent = t('rep.concluida', { seg: fmt(seg, 0) });
    } else {
      status(() => t(R.cancelado ? 'rep.cancelada' : 'rep.erro', { nome: t(`rep.etapa.${falhou}`) }));
      $('rep-anuncio').textContent = $('rep-status').textContent;
    }
    render();
  }

  // Cancela a etapa em andamento (o pool é encerrado) e interrompe a sequência.
  function cancelar() {
    if (!R.rodando) return;
    R.cancelado = true; ctx.exec.cancelar();
  }

  function baixarPacote() {
    const arquivos = ctx.arquivosCsv();
    if (!arquivos.length) return;
    baixarZip('pesquisa-barco-resgate-csv', arquivos.map((a) => ({ nome: a.nome, texto: a.nome.endsWith('.csv') ? BOM + a.texto : a.texto })));
    $('rep-anuncio').textContent = t('rep.zipBaixado', { n: arquivos.length });
  }

  function ligar() {
    $('b-rep').addEventListener('click', iniciar);
    $('b-rep-cancelar').addEventListener('click', cancelar);
    $('b-rep-zip').addEventListener('click', baixarPacote);
    ctx.exec.onMudanca(ligarBotoes);
    status(() => t('rep.ocioso')); render();
  }

  return { ligar, render, iniciar, cancelar, ligarBotoes, get rodando() { return R.rodando; } };
}
