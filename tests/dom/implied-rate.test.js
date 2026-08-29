/**
 * The route into the comparison for someone who was never told a rate: the
 * price quoted in dollars plus the bolívares charged for it. Covers CALC-7 and AC-13.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { bootApp, STORAGE_KEYS } from './helpers.js';

describe('rate derived from a price', () => {
  let app;

  before(async () => {
    app = await bootApp({ preferences: { amount: '14000', priceUsd: '20' } });
  });

  it('brings a saved price back into an open group', () => {
    assert.equal(app.$('priceUsdInput').value, '20');
    assert.equal(app.$('merchantDisclosure').open, true);
  });

  it('works the merchant rate out of the two figures a till gives you', () => {
    assert.equal(app.$('merchantRateInput').value, '700,00');
    assert.match(app.$('merchantRateInput').className, /is-derived/);
  });

  it('says which rate it arrived at', () => {
    assert.match(app.$('impliedNote').textContent, /Bs\. 700,00 por dólar/);
  });

  it('feeds the gauge like any other merchant rate', () => {
    assert.equal(app.$('readingValue').textContent, '10,8%');
    assert.equal(app.$('verdictTitle').textContent, 'Ay papá, eso duele');
  });

  it('follows the amount as it is retyped', async () => {
    await app.type(app.$('amountInput'), '15000');

    assert.equal(app.$('merchantRateInput').value, '750,00');
    assert.equal(app.$('readingValue').textContent, '3,4%');
  });

  it('empties the rate it owns when the price stops being readable', async () => {
    await app.type(app.$('priceUsdInput'), '20abc');

    assert.match(app.$('priceUsdInput').className, /is-invalid/);
    assert.equal(app.$('merchantRateInput').value, '');
    assert.equal(app.$('readingValue').textContent, '—%');
  });

  it('hands the rate back the moment it is typed over', async () => {
    await app.type(app.$('priceUsdInput'), '20');
    await app.type(app.$('merchantRateInput'), '800');

    assert.equal(app.$('priceUsdInput').value, '');
    assert.doesNotMatch(app.$('merchantRateInput').className, /is-derived/);
    // 775,3356 ÷ 800 − 1 is negative: the shop is charging under the BCV.
    assert.equal(app.$('readingValue').textContent, '−3,1%');
  });

  it('keeps the price among the data it remembers', async () => {
    await app.type(app.$('priceUsdInput'), '25');

    assert.equal(app.stored(STORAGE_KEYS.preferences).priceUsd, '25');
  });
});
