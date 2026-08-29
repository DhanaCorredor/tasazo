/**
 * The domain logic, kept free of any dependency on the DOM, the network or
 * the clock so that every rule below can be verified in isolation.
 *
 * The rule the whole app rests on: the bolívar amount is fixed, so a *lower*
 * exchange rate does not make anything cheaper — it means the customer hands
 * over *more* foreign currency for the same purchase. Overcharging therefore
 * shows up as a merchant rate below the reference.
 */

import {
  BARGAIN_THRESHOLD_PERCENT,
  BARGAIN_VERDICT,
  REFERENCE_MODES,
  VERDICT_LEVELS,
} from './config.js';

const isPositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Converts a bolívar amount into foreign currency at a given rate.
 *
 * @returns {number|null} null when either input is missing or non-positive
 */
export function convert(amount, rate) {
  if (!isPositive(amount) || !isPositive(rate)) return null;
  return amount / rate;
}

/**
 * How many dollars one euro is worth, according to the pair of rates the
 * central bank publishes for the same day.
 */
export function crossRate(euroRate, dollarRate) {
  if (!isPositive(euroRate) || !isPositive(dollarRate)) return null;
  return euroRate / dollarRate;
}

/**
 * Expresses a Bs/$ rate as Bs/€.
 *
 * Used for rates that exist only in dollars — the merchant's, and any rate
 * the user typed by hand — since no euro figure is published for them.
 */
export function toEuroRate(dollarRate, cross) {
  if (!isPositive(dollarRate) || !isPositive(cross)) return null;
  return dollarRate * cross;
}

/**
 * The rate a merchant is actually applying, recovered from the two figures a
 * customer is given at the till: the price quoted in foreign currency and the
 * bolívares charged for it.
 *
 * Nobody announces their Bs/$ rate, but everyone quotes a price, so this is
 * usually the only way to get at the number the comparison needs.
 */
export function impliedRate(amount, foreignPrice) {
  if (!isPositive(amount) || !isPositive(foreignPrice)) return null;
  return amount / foreignPrice;
}

/**
 * The excess the customer pays relative to a reference rate.
 *
 * Positive means the merchant charges more than the reference; negative means
 * the customer comes out ahead. Independent of the amount, so the gauge can
 * read a verdict from the two rates alone.
 */
export function overchargePercent(merchantRate, referenceRate) {
  if (!isPositive(merchantRate) || !isPositive(referenceRate)) return null;
  return (referenceRate / merchantRate - 1) * 100;
}

/**
 * Maps an overcharge percentage onto an alarm level.
 *
 * Anything within half a point either way counts as the same rate: that much
 * spread is rounding and timing, not an overcharge.
 */
export function findVerdict(percent) {
  if (percent === null || !Number.isFinite(percent)) return null;
  if (percent < BARGAIN_THRESHOLD_PERCENT) return BARGAIN_VERDICT;

  const normalized = Math.abs(percent) < 0.5 ? 0 : percent;
  return VERDICT_LEVELS.find((level) => normalized <= level.maxPercent) ?? VERDICT_LEVELS.at(-1);
}

/** The extra currency handed over, in the same unit as its inputs. */
export function difference(merchantValue, referenceValue) {
  if (merchantValue === null || referenceValue === null) return null;
  return merchantValue - referenceValue;
}

/**
 * Chooses which reading the gauge displays.
 *
 * In `worst` mode the harsher of the two references wins, with ties resolved
 * in favour of the official rate. When the requested reference has no data,
 * the other one is used and reported back so the label can say which.
 *
 * @returns {{percent: number, reference: string}|null}
 */
export function selectReading({ official, parallel, mode }) {
  const candidates = [
    { percent: official, reference: REFERENCE_MODES.official },
    { percent: parallel, reference: REFERENCE_MODES.parallel },
  ].filter((candidate) => candidate.percent !== null);

  if (candidates.length === 0) return null;

  if (mode === REFERENCE_MODES.worst) {
    return candidates.reduce((worst, candidate) =>
      candidate.percent > worst.percent ? candidate : worst,
    );
  }

  return candidates.find((candidate) => candidate.reference === mode) ?? candidates[0];
}
