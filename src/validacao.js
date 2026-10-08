// Validação de mapas para o editor (lógica pura, sem DOM; testada em Node).
// Map validation for the editor (pure logic, no DOM; tested in Node).
//
// Alfabeto do mapa (o mesmo de env.js): '.' água livre · '~' correnteza · 'x' destroços · '#' bloqueio · 'H' abrigo · 'P' pessoa.
//
// Regras (todas coerentes com `criarAmbiente`):
//  1. tamanho: o mapa é quadrado, de 4×4 a 8×8 (`TAM_MIN`..`TAM_MAX`); todas as linhas têm o mesmo comprimento;
//  2. só os símbolos do alfabeto acima;
//  3. exatamente 1 abrigo (H): é onde o barco começa e onde as pessoas são deixadas;
//  4. de 1 a 3 pessoas (P): o estado guarda a situação (ilhada, a bordo, salva) de cada pessoa, então 3 é o limite
//     que mantém |S| pequeno (no máximo 8×8×27 = 1728 estados) e a capacidade do barco vai de 1 a 3;
//  5. pessoas e abrigo ficam sempre em água livre: cada célula tem um único símbolo, portanto uma pessoa ou o abrigo
//     nunca coincide com bloqueio, correnteza ou destroços (o editor troca o símbolo ao pintar por cima);
//  6. todas as pessoas são alcançáveis a partir do abrigo por busca em largura (BFS) em 4 direções, passando por
//     qualquer célula que não seja bloqueio e ignorando a estocasticidade da correnteza;
//  7. o abrigo tem de ter pelo menos uma célula vizinha que não seja bloqueio (caso contrário o barco fica preso;
//     já está implícito na regra 6, mas a mensagem dedicada é mais clara).
// Códigos de erro (traduzidos na interface com a chave `val.<codigo>`):
//   formato, tamanho, simbolo, semAbrigo, variosAbrigos, semPessoas, muitasPessoas, inalcancavel, abrigoPreso.

export const TAM_MIN = 4;
export const TAM_MAX = 8;
export const SIMBOLOS = '.~x#HP';
export const MAX_PESSOAS = 3;

// Número de situações possíveis das pessoas: escolhe-se quem está a bordo (no máximo `capacidade`);
// as demais estão ilhadas ou salvas (2 opções cada). Fórmula idêntica à enumeração de env.js.
export function contarSituacoes(nPes, capacidade) {
  const comb = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); };
  let total = 0;
  for (let k = 0; k <= Math.min(nPes, capacidade); k++) total += comb(nPes, k) * 2 ** (nPes - k);
  return total;
}

// Alcançáveis a partir de `ini` ([i,j]) por BFS em 4 direções ignorando bloqueios. Devolve um Set de "i,j".
export function alcancaveis(linhas, ini) {
  const nl = linhas.length, nc = linhas[0].length, visto = new Set([`${ini[0]},${ini[1]}`]), fila = [ini];
  for (let h = 0; h < fila.length; h++) {
    const [i, j] = fila[h];
    for (const [di, dj] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj, k = `${a},${b}`;
      if (a < 0 || a >= nl || b < 0 || b >= nc || visto.has(k) || linhas[a][b] === '#') continue;
      visto.add(k); fila.push([a, b]);
    }
  }
  return visto;
}

// linhas: string[] (como `MAPA_PADRAO`). Devolve:
//   { ok, erros: [{ codigo, ...dados }], nl, nc, nPessoas, nAbrigos, nCelulas (livres), nSituacoes, nS, inalcancaveis: [[i,j],...] }
export function validarMapa(linhas, { capacidade = 2 } = {}) {
  const erros = [];
  const base = { ok: false, erros, nl: 0, nc: 0, nPessoas: 0, nAbrigos: 0, nCelulas: 0, nSituacoes: 0, nS: 0, inalcancaveis: [] };
  if (!Array.isArray(linhas) || linhas.length === 0 || linhas.some((l) => typeof l !== 'string')) {
    erros.push({ codigo: 'formato' }); return base;
  }
  const nl = linhas.length, nc = linhas[0].length;
  base.nl = nl; base.nc = nc;
  if (linhas.some((l) => l.length !== nc)) { erros.push({ codigo: 'formato' }); return base; }
  if (nl !== nc || nl < TAM_MIN || nl > TAM_MAX) erros.push({ codigo: 'tamanho', nl, nc, min: TAM_MIN, max: TAM_MAX });
  const invalidos = new Set();
  for (const l of linhas) for (const c of l) if (!SIMBOLOS.includes(c)) invalidos.add(c);
  if (invalidos.size) erros.push({ codigo: 'simbolo', simbolos: [...invalidos].join(' ') });
  if (erros.length) return base;

  const abrigos = [], pessoas = [];
  let bloqueios = 0;
  linhas.forEach((l, i) => [...l].forEach((c, j) => { if (c === 'H') abrigos.push([i, j]); else if (c === 'P') pessoas.push([i, j]); else if (c === '#') bloqueios++; }));
  base.nAbrigos = abrigos.length; base.nPessoas = pessoas.length; base.nCelulas = nl * nc - bloqueios;
  if (abrigos.length === 0) erros.push({ codigo: 'semAbrigo' });
  else if (abrigos.length > 1) erros.push({ codigo: 'variosAbrigos', n: abrigos.length });
  if (pessoas.length === 0) erros.push({ codigo: 'semPessoas' });
  else if (pessoas.length > MAX_PESSOAS) erros.push({ codigo: 'muitasPessoas', n: pessoas.length, max: MAX_PESSOAS });
  if (abrigos.length === 1) {
    const [hi, hj] = abrigos[0];
    const livre = [[-1, 0], [1, 0], [0, 1], [0, -1]].some(([di, dj]) => { const a = hi + di, b = hj + dj; return a >= 0 && a < nl && b >= 0 && b < nc && linhas[a][b] !== '#'; });
    if (!livre) erros.push({ codigo: 'abrigoPreso' });
    else {
      const ok = alcancaveis(linhas, abrigos[0]);
      base.inalcancaveis = pessoas.filter(([i, j]) => !ok.has(`${i},${j}`));
      if (base.inalcancaveis.length) erros.push({ codigo: 'inalcancavel', n: base.inalcancaveis.length, lista: base.inalcancaveis.map(([i, j]) => `(${i + 1},${j + 1})`).join(' ') });
    }
  }
  if (pessoas.length >= 1 && pessoas.length <= MAX_PESSOAS) {
    base.nSituacoes = contarSituacoes(pessoas.length, capacidade);
    base.nS = base.nCelulas * base.nSituacoes;
  }
  base.ok = erros.length === 0;
  return base;
}

// Redimensiona o rascunho para n×n: mantém o que cabe e preenche o resto com água. / Resize keeping what fits.
export function redimensionar(linhas, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let l = '';
    for (let j = 0; j < n; j++) l += i < linhas.length && j < linhas[i].length ? linhas[i][j] : '.';
    out.push(l);
  }
  return out;
}

// Coloca o símbolo `c` em (i,j). O abrigo é único: ao pôr um H novo, o antigo vira água. / Place a symbol; the shelter is unique.
export function pintar(linhas, i, j, c) {
  const g = linhas.map((l) => [...l]);
  if (c === 'H') for (const l of g) for (let k = 0; k < l.length; k++) if (l[k] === 'H') l[k] = '.';
  g[i][j] = c;
  return g.map((l) => l.join(''));
}
