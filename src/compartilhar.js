// Compartilhar configuração: JSON versionado codificado em base64url no hash da URL (lógica pura, testada em Node).
// Share configuration: versioned JSON encoded as base64url in the URL hash (pure logic, tested in Node).
//
//   https://…/index.html#cfg=<base64url>   com   { v: 1, mapa: ["P..P..", …], amb: { rDestrocos, pCorr, capacidade },
//                                                  treino: { algo, passo, alpha, eps0, gamma, nEp, seed } }
// Entradas inválidas (campo fora do intervalo, mapa que não passa em validarMapa, JSON ilegível…) são IGNORADAS e viram avisos
// ({ codigo, campo }); nunca lançam exceção. Campos ausentes simplesmente não mudam nada.
import { validarMapa } from './validacao.js';

export const VERSAO = 1;
export const PREFIXO = 'cfg=';
export const MAX_HASH = 6000;   // limite defensivo de tamanho

const ALGOS = ['q', 'sarsa', 'mc', 'ip'], PASSOS = ['media', 'const'];

export function paraBase64Url(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64Url(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/'), bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// cfg: { mapa, amb: {...}, treino: {...} } → "cfg=…" (sem o '#')
export function codificar(cfg) {
  return PREFIXO + paraBase64Url(JSON.stringify({ v: VERSAO, mapa: cfg.mapa, amb: cfg.amb, treino: cfg.treino }));
}

export const linkCom = (base, cfg) => `${base.split('#')[0]}#${codificar(cfg)}`;

const ehObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const ehNum = (x) => typeof x === 'number' && Number.isFinite(x);
const noIntervalo = (x, min, max, inteiro = false) => ehNum(x) && x >= min && x <= max && (!inteiro || Number.isInteger(x));

// Lê o hash (com ou sem '#') e devolve { cfg: { mapa?, amb?, treino? } | null, avisos: [{codigo, campo?}] }.
// Códigos: ilegivel (base64/JSON inválido ou grande demais), versao, campo (valor inválido em `campo`), mapa (mapa reprovado; `erros`).
export function decodificar(hash) {
  const avisos = [];
  const h = String(hash || '').replace(/^#/, '');
  if (!h) return { cfg: null, avisos };
  if (!h.startsWith(PREFIXO)) return { cfg: null, avisos };       // outro uso do hash (âncoras): não é nossa configuração
  if (h.length > MAX_HASH) return { cfg: null, avisos: [{ codigo: 'ilegivel' }] };
  let obj;
  try { obj = JSON.parse(deBase64Url(h.slice(PREFIXO.length))); } catch (_) { return { cfg: null, avisos: [{ codigo: 'ilegivel' }] }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { cfg: null, avisos: [{ codigo: 'ilegivel' }] };
  if (obj.v !== VERSAO) return { cfg: null, avisos: [{ codigo: 'versao', campo: String(obj.v) }] };

  const cfg = {};
  // ambiente
  if (obj.amb !== undefined) {
    const a = ehObj(obj.amb) ? obj.amb : {}, amb = {};
    if (!ehObj(obj.amb)) avisos.push({ codigo: 'campo', campo: 'amb' });
    const regras = [['rDestrocos', -100, 0, false], ['pCorr', 0, 1, false], ['capacidade', 1, 3, true]];
    for (const [k, min, max, inteiro] of regras) {
      if (a[k] === undefined) continue;
      if (noIntervalo(a[k], min, max, inteiro)) amb[k] = a[k]; else avisos.push({ codigo: 'campo', campo: `amb.${k}` });
    }
    if (Object.keys(amb).length) cfg.amb = amb;
  }
  // mapa (validado com a capacidade pedida, se válida)
  if (obj.mapa !== undefined) {
    const cap = cfg.amb && cfg.amb.capacidade ? cfg.amb.capacidade : 2, v = validarMapa(obj.mapa, { capacidade: cap });
    if (v.ok) cfg.mapa = obj.mapa.slice(); else avisos.push({ codigo: 'mapa', campo: 'mapa', erros: v.erros });
  }
  // treino
  if (obj.treino !== undefined) {
    const tr = ehObj(obj.treino) ? obj.treino : {}, treino = {};
    if (!ehObj(obj.treino)) avisos.push({ codigo: 'campo', campo: 'treino' });
    if (tr.algo !== undefined) { if (ALGOS.includes(tr.algo)) treino.algo = tr.algo; else avisos.push({ codigo: 'campo', campo: 'treino.algo' }); }
    if (tr.passo !== undefined) { if (PASSOS.includes(tr.passo)) treino.passo = tr.passo; else avisos.push({ codigo: 'campo', campo: 'treino.passo' }); }
    const regras = [['alpha', 0.001, 1, false], ['eps0', 0, 1, false], ['gamma', 0, 1, false], ['nEp', 100, 500000, true], ['seed', 0, 4294967295, true]];
    for (const [k, min, max, inteiro] of regras) {
      if (tr[k] === undefined) continue;
      if (noIntervalo(tr[k], min, max, inteiro)) treino[k] = tr[k]; else avisos.push({ codigo: 'campo', campo: `treino.${k}` });
    }
    if (Object.keys(treino).length) cfg.treino = treino;
  }
  return { cfg: Object.keys(cfg).length ? cfg : null, avisos };
}
