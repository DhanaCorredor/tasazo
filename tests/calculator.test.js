import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  convert,
  crossRate,
  difference,
  findVerdict,
  impliedRate,
  overchargePercent,
  selectReading,
  suspectTypo,
  toEuroRate,
} from '../src/calculator.js';
import { REFERENCE_MODES } from '../src/config.js';

/** Real figures published on 2026-08-19, used across the spec's scenarios. */
const BCV_USD = 775.3356;
const PARALLEL_USD = 881.054062;
const BCV_EUR = 897.82311808;

const close = (actual, expected, tolerance = 1e-4) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );

describe('convert', () => {
  it('divides the amount by the rate', () => {
    close(convert(10_000, 700), 14.285714);
    close(convert(10_000, BCV_USD), 12.897641);
  });

  it('refuses to produce a number from missing or invalid input', () => {
    assert.equal(convert(null, 700), null);
    assert.equal(convert(10_000, null), null);
    assert.equal(convert(10_000, 0), null);
    assert.equal(convert(0, 700), null);
    assert.equal(convert(10_000, Number.NaN), null);
  });
});

describe('impliedRate', () => {
  it('recovers the rate from the price quoted and the bolivares charged', () => {
    // 14.000 Bs for something priced at 20 $ is 700 Bs/$.
    close(impliedRate(14_000, 20), 700);
    close(impliedRate(10_000, 12.897641), BCV_USD);
  });

  it('is the inverse of a conversion', () => {
    close(impliedRate(10_000, convert(10_000, 823.5)), 823.5);
  });

  it('refuses to produce a rate from missing or invalid input', () => {
    assert.equal(impliedRate(null, 20), null);
    assert.equal(impliedRate(14_000, null), null);
    assert.equal(impliedRate(14_000, 0), null);
    assert.equal(impliedRate(0, 20), null);
    assert.equal(impliedRate(14_000, Number.NaN), null);
  });
});

describe('overchargePercent', () => {
  it('reports a merchant rate below the reference as an overcharge', () => {
    close(overchargePercent(700, BCV_USD), 10.762228);
  });

  it('reports a merchant rate above the reference as favourable', () => {
    close(overchargePercent(800, BCV_USD), -3.083051);
  });

  it('reports no difference when the rates match', () => {
    assert.equal(overchargePercent(BCV_USD, BCV_USD), 0);
  });

  it('does not depend on the amount being known', () => {
    assert.equal(typeof overchargePercent(700, BCV_USD), 'number');
  });

  it('returns null when either rate is missing', () => {
    assert.equal(overchargePercent(null, BCV_USD), null);
    assert.equal(overchargePercent(700, null), null);
    assert.equal(overchargePercent(0, BCV_USD), null);
  });
});

describe('crossRate and toEuroRate', () => {
  it('derives how many dollars a euro is worth', () => {
    close(crossRate(BCV_EUR, BCV_USD), 1.157980);
  });

  it('expresses a dollar rate in euros', () => {
    const cross = crossRate(BCV_EUR, BCV_USD);
    close(toEuroRate(700, cross), 810.586);
  });

  it('leaves the official euro rate untouched by the round trip', () => {
    const cross = crossRate(BCV_EUR, BCV_USD);
    close(toEuroRate(BCV_USD, cross), BCV_EUR, 1e-6);
  });

  it('returns null without both published rates', () => {
    assert.equal(crossRate(null, BCV_USD), null);
    assert.equal(toEuroRate(700, null), null);
  });
});

describe('suspectTypo', () => {
  const REFERENCES = [BCV_USD, PARALLEL_USD];

  it('spots a dropped digit and names what was meant', () => {
    const suspicion = suspectTypo(70, REFERENCES);

    close(suspicion.suggestion, 700);
    close(suspicion.reference, BCV_USD);
  });

  it('spots a doubled digit just as readily', () => {
    close(suspectTypo(7753, REFERENCES).suggestion, 775.3);
  });

  it('leaves a harsh but believable charge alone', () => {
    // 400 against the BCV is a 93.8 % overcharge — cruel, not impossible.
    assert.equal(suspectTypo(400, REFERENCES), null);
    assert.equal(suspectTypo(500, REFERENCES), null);
    assert.equal(suspectTypo(BCV_USD, REFERENCES), null);
  });

  it('measures distance logarithmically, so both directions are equal', () => {
    assert.notEqual(suspectTypo(BCV_USD / 10, REFERENCES), null);
    assert.notEqual(suspectTypo(BCV_USD * 10, REFERENCES), null);
  });

  it('judges against the nearest reference, not every one', () => {
    // A hand-typed reference that is itself wrong must not condemn a rate the
    // other reference vouches for.
    assert.equal(suspectTypo(700, [90, PARALLEL_USD]), null);
  });

  it('says nothing without a rate or a reference to weigh it against', () => {
    assert.equal(suspectTypo(70, []), null);
    assert.equal(suspectTypo(70, [null, Number.NaN]), null);
    assert.equal(suspectTypo(null, REFERENCES), null);
    assert.equal(suspectTypo(0, REFERENCES), null);
  });
});

describe('difference', () => {
  it('measures the extra currency handed over', () => {
    const merchant = convert(10_000, 700);
    const reference = convert(10_000, BCV_USD);
    close(difference(merchant, reference), 1.388074);
  });

  it('goes negative when the merchant charges less', () => {
    assert.ok(difference(convert(10_000, 800), convert(10_000, BCV_USD)) < 0);
  });

  it('returns null when either side is unknown', () => {
    assert.equal(difference(null, 12), null);
    assert.equal(difference(12, null), null);
  });
});

describe('findVerdict', () => {
  const keyFor = (percent) => findVerdict(percent).key;

  it('treats a spread of under half a point as the same rate', () => {
    assert.equal(keyFor(0), 'safe');
    assert.equal(keyFor(0.4), 'safe');
    assert.equal(keyFor(-0.4), 'safe');
  });

  it('climbs through the alarm levels', () => {
    assert.equal(keyFor(2), 'fair');
    assert.equal(keyFor(10.76), 'painful');
    assert.equal(keyFor(30), 'severe');
    assert.equal(keyFor(80), 'critical');
  });

  it('places each threshold in the milder band', () => {
    assert.equal(keyFor(3), 'fair');
    assert.equal(keyFor(10), 'mild');
    assert.equal(keyFor(25), 'painful');
    assert.equal(keyFor(50), 'severe');
  });

  it('flags a genuine discount as favourable', () => {
    assert.equal(keyFor(-3.08), 'bargain');
  });

  it('has no verdict without a reading', () => {
    assert.equal(findVerdict(null), null);
    assert.equal(findVerdict(Number.NaN), null);
  });
});

describe('selectReading', () => {
  const official = overchargePercent(700, BCV_USD);
  const parallel = overchargePercent(700, PARALLEL_USD);

  it('honours the requested reference', () => {
    assert.deepEqual(selectReading({ official, parallel, mode: REFERENCE_MODES.official }), {
      percent: official,
      reference: REFERENCE_MODES.official,
    });
  });

  it('picks the harsher reference in worst mode', () => {
    const reading = selectReading({ official, parallel, mode: REFERENCE_MODES.worst });
    assert.equal(reading.reference, REFERENCE_MODES.parallel);
    close(reading.percent, 25.864866);
  });

  it('resolves a tie in worst mode towards the official rate', () => {
    const reading = selectReading({ official: 10, parallel: 10, mode: REFERENCE_MODES.worst });
    assert.equal(reading.reference, REFERENCE_MODES.official);
  });

  it('falls back to the available reference and says which it used', () => {
    const reading = selectReading({
      official: null,
      parallel,
      mode: REFERENCE_MODES.official,
    });
    assert.equal(reading.reference, REFERENCE_MODES.parallel);
  });

  it('returns nothing when no reference is available', () => {
    assert.equal(selectReading({ official: null, parallel: null, mode: REFERENCE_MODES.worst }), null);
  });
});
