// Cartão "Editor de mapa": grade clicável com paleta, validação ao vivo e botões Aplicar / Restaurar.
// "Map editor" card: clickable grid with palette, live validation and Apply / Restore buttons.
import { MAPA_PADRAO } from '../env.js';
import { validarMapa, redimensionar, pintar, TAM_MIN, TAM_MAX } from '../validacao.js';
import { t, fmt } from './i18n.js';
import { $, esc } from './util.js';

// símbolo do mapa → { chave de texto, rótulo curto na célula }
const TIPOS = { '.': ['agua', ''], '~': ['corr', '≈'], x: ['destrocos', '✕'], '#': ['bloqueio', '■'], H: ['abrigo', 'H'], P: ['pessoa', 'P'] };
const PALETA = ['.', '~', 'x', '#', 'H', 'P'];

// ctx: { S (S.mapa = mapa aplicado, S.opts), aplicarMapa (linhas) }
export function criarEditor(ctx) {
  const E = { rascunho: MAPA_PADRAO.slice(), pincel: '~', foco: [0, 0], pintando: false, v: null };
  const grade = $('e-grade');

  const capacidade = () => (ctx.S.opts && ctx.S.opts.capacidade) || 2;
  const igual = (a, b) => a.length === b.length && a.every((l, i) => l === b[i]);
  const nomeTipo = (c) => t(`ed.tipo.${TIPOS[c][0]}`);

  function montarPaleta() {
    $('e-paleta').innerHTML = PALETA.map((c) => {
      const [k, rot] = TIPOS[c];
      return `<label class="pincel"><input type="radio" name="e-pincel" value="${c}"${c === E.pincel ? ' checked' : ''}><span class="amostra cel-${k}" aria-hidden="true">${rot}</span><span>${esc(nomeTipo(c))}</span></label>`;
    }).join('');
    $('e-paleta').querySelectorAll('input').forEach((r) => r.addEventListener('change', () => { E.pincel = r.value; }));
  }

  function desenharGrade() {
    const m = E.rascunho, n = m.length, inalc = new Set((E.v.inalcancaveis || []).map(([i, j]) => `${i},${j}`));
    const [fi, fj] = [Math.min(E.foco[0], n - 1), Math.min(E.foco[1], n - 1)];
    E.foco = [fi, fj];
    grade.style.setProperty('--n', n);
    grade.innerHTML = m.map((linha, i) => `<div role="row" class="e-linha">` + [...linha].map((c, j) => {
      const [k, rot] = TIPOS[c] || TIPOS['.'], ruim = inalc.has(`${i},${j}`);
      const rotulo = t('ed.celula', { i: i + 1, j: j + 1, tipo: nomeTipo(c) }) + (ruim ? ` — ${t('ed.inalcancavel')}` : '');
      return `<div role="gridcell"><button type="button" class="e-cel cel-${k}${ruim ? ' inalc' : ''}" data-i="${i}" data-j="${j}" tabindex="${i === fi && j === fj ? 0 : -1}" aria-label="${esc(rotulo)}">${rot}</button></div>`;
    }).join('') + `</div>`).join('');
  }

  function renderStatus() {
    const v = E.v;
    $('e-info').textContent = v.nS
      ? t('ed.info', { nl: v.nl, nc: v.nc, cel: fmt(v.nCelulas, 0), sit: fmt(v.nSituacoes, 0), nS: fmt(v.nS, 0), p: v.nPessoas, cap: capacidade() })
      : t('ed.infoSem', { nl: v.nl, nc: v.nc });
    $('e-erros').innerHTML = v.ok ? `<li class="ok">${t('ed.valido')}</li>` : v.erros.map((e) => `<li>${esc(t(`val.${e.codigo}`, e))}</li>`).join('');
    const aplicado = igual(E.rascunho, ctx.S.mapa);
    $('e-aplicar').disabled = !v.ok || aplicado;
    $('e-estado').textContent = aplicado ? t('ed.estadoAplicado') : t('ed.estadoRascunho');
  }

  function revalidar() {
    E.v = validarMapa(E.rascunho, { capacidade: capacidade() });
    desenharGrade(); renderStatus();
  }

  function pintarCelula(i, j) {
    const antes = E.rascunho[i][j], novo = E.pincel;
    if (antes === novo && novo !== 'H') return;
    E.rascunho = pintar(E.rascunho, i, j, novo); E.foco = [i, j];
    revalidar();
  }

  function focarCelula(i, j) {
    const n = E.rascunho.length; i = Math.max(0, Math.min(n - 1, i)); j = Math.max(0, Math.min(n - 1, j)); E.foco = [i, j];
    grade.querySelectorAll('.e-cel').forEach((b) => { b.tabIndex = Number(b.dataset.i) === i && Number(b.dataset.j) === j ? 0 : -1; });
    const b = grade.querySelector(`.e-cel[data-i="${i}"][data-j="${j}"]`); if (b) b.focus();
  }

  function ligarGrade() {
    // clique (e Enter/Espaço, que geram clique) pinta; arrastar com o mouse pinta várias células (menos o abrigo, que é único)
    grade.addEventListener('click', (ev) => { const b = ev.target.closest('.e-cel'); if (!b) return; pintarCelula(Number(b.dataset.i), Number(b.dataset.j)); focarCelula(Number(b.dataset.i), Number(b.dataset.j)); });
    grade.addEventListener('pointerdown', (ev) => { if (ev.pointerType === 'mouse' && ev.target.closest('.e-cel')) E.pintando = true; });
    grade.addEventListener('pointerover', (ev) => {
      const b = ev.target.closest('.e-cel');
      if (E.pintando && b && E.pincel !== 'H' && ev.buttons === 1) pintarCelula(Number(b.dataset.i), Number(b.dataset.j));
    });
    document.addEventListener('pointerup', () => { E.pintando = false; });
    grade.addEventListener('keydown', (ev) => {
      const b = ev.target.closest('.e-cel'); if (!b) return;
      const i = Number(b.dataset.i), j = Number(b.dataset.j), n = E.rascunho.length;
      const mov = { ArrowUp: [i - 1, j], ArrowDown: [i + 1, j], ArrowLeft: [i, j - 1], ArrowRight: [i, j + 1], Home: [i, 0], End: [i, n - 1] }[ev.key];
      if (mov) { ev.preventDefault(); focarCelula(mov[0], mov[1]); }
    });
  }

  function definir(linhas) {   // mapa aplicado mudou por fora (link, restauração)
    E.rascunho = linhas.slice(); $('e-tam').value = String(linhas.length); revalidar();
  }

  function ligar() {
    $('e-tam').innerHTML = Array.from({ length: TAM_MAX - TAM_MIN + 1 }, (_, k) => `<option value="${TAM_MIN + k}">${TAM_MIN + k}×${TAM_MIN + k}</option>`).join('');
    montarPaleta(); ligarGrade();
    $('e-tam').addEventListener('change', () => { E.rascunho = redimensionar(E.rascunho, Number($('e-tam').value)); revalidar(); });
    $('e-aplicar').addEventListener('click', () => { if (E.v.ok) ctx.aplicarMapa(E.rascunho.slice()); });
    $('e-restaurar').addEventListener('click', () => { definir(MAPA_PADRAO); ctx.aplicarMapa(MAPA_PADRAO.slice(), true); });
    definir(ctx.S.mapa);
  }

  // chamado quando muda o idioma ou a capacidade (|S| depende dela)
  function render() { montarPaleta(); revalidar(); }

  return { ligar, render, definir, get rascunho() { return E.rascunho; } };
}
