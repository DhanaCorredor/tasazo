/**
 * The defence against a slip of the thumb: a rate far enough from every
 * reference is flagged, and nothing else about the page changes.
 * Covers CALC-8, UI-12 and AC-14.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { bootApp } from './helpers.js';

describe('implausible merchant rate', () => {
  let app;

  before(async () => {
    app = await bootApp();
    await app.type(app.$('amountInput'), '10000');
    await app.type(app.$('merchantRateInput'), '70');
  });

  it('names the figure that was probably meant', () => {
    assert.equal(app.$('typoWarning').hidden, false);
    assert.match(app.$('typoWarning').textContent, /¿Querías escribir 700,00\?/);
  });

  it('changes nothing it was not asked to change', () => {
    // The app cannot tell a typo from a robbery, so it reports both.
    assert.equal(app.$('merchantRateInput').value, '70');
    assert.equal(app.$('readingValue').textContent, '1.007,6%');
    assert.equal(app.$('verdictTitle').textContent, 'Código azul, traigan el desfibrilador');
    assert.equal(app.row('merchant').querySelector('.result-usd').textContent, '$142,86');
  });

  it('stays quiet for a harsh but believable charge', async () => {
    await app.type(app.$('merchantRateInput'), '400');

    assert.equal(app.$('typoWarning').hidden, true);
    // Still the worst verdict there is: nothing about the alarm was softened.
    assert.equal(app.$('readingValue').textContent, '93,8%');
    assert.equal(app.$('verdictTitle').textContent, 'Código azul, traigan el desfibrilador');
  });

  it('flags a rate mistyped upwards too', async () => {
    await app.type(app.$('merchantRateInput'), '7753');

    assert.equal(app.$('typoWarning').hidden, false);
    assert.match(app.$('typoWarning').textContent, /775,3/);
  });

  it('goes quiet when the field is emptied', async () => {
    await app.type(app.$('merchantRateInput'), '');

    assert.equal(app.$('typoWarning').hidden, true);
  });

  it('watches a rate derived from a price just the same', async () => {
    await app.type(app.$('priceUsdInput'), '143');

    assert.equal(app.$('merchantRateInput').value, '69,9301');
    assert.equal(app.$('typoWarning').hidden, false);
  });
});
