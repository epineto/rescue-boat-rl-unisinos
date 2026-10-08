import test from 'node:test';
import assert from 'node:assert/strict';
import { lerNumero, formatarCampo } from '../src/numeros.js';

test('lerNumero aceita vírgula e ponto decimais', () => {
  assert.equal(lerNumero('0,25'), 0.25);
  assert.equal(lerNumero('0.25'), 0.25);
  assert.equal(lerNumero(' ,5 '), 0.5);
  assert.equal(lerNumero('−10'), -10);
  assert.equal(lerNumero('-12,5'), -12.5);
  assert.equal(lerNumero('0.001'), 0.001);
});

test('lerNumero trata milhares', () => {
  assert.equal(lerNumero('1.234,5'), 1234.5);
  assert.equal(lerNumero('1,234.5'), 1234.5);
  assert.equal(lerNumero('30.000', { inteiro: true }), 30000);
  assert.equal(lerNumero('30000', { inteiro: true }), 30000);
  assert.equal(lerNumero('30 000', { inteiro: true }), 30000);
});

test('lerNumero rejeita lixo', () => {
  for (const x of ['', 'abc', '1,2,3', '1..2', '--1', '1e5x', null, undefined]) assert.ok(Number.isNaN(lerNumero(x)), String(x));
});

test('formatarCampo respeita o idioma e não agrupa milhares', () => {
  assert.equal(formatarCampo(0.25, 'pt'), '0,25');
  assert.equal(formatarCampo(0.25, 'en'), '0.25');
  assert.equal(formatarCampo(30000, 'pt'), '30000');
  assert.equal(formatarCampo(-10, 'pt'), '-10');
});
