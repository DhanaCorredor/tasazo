/**
 * Application-wide configuration.
 *
 * Thresholds, timings and endpoints live here so that tuning the app's
 * behaviour never requires touching calculation or rendering code.
 */

/** Locale used for every number the user reads. The UI targets Venezuela. */
export const LOCALE = 'es-VE';

/**
 * Exchange rate endpoints.
 *
 * The BCV website cannot be read from a browser: its TLS chain is incomplete
 * and it sends no CORS headers. This mirror republishes the official figures
 * with an open CORS policy. See SPEC.md, requirement RT-2.
 */
export const RATES_API = {
  usd: 'https://ve.dolarapi.com/v1/dolares',
  eur: 'https://ve.dolarapi.com/v1/euros',
};

export const REQUEST_TIMEOUT_MS = 9_000;
export const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/** Past this age, cached rates are shown but flagged as no longer fresh. */
export const STALE_AFTER_MS = 45 * 60 * 1000;

export const STORAGE_KEYS = {
  preferences: 'tasazo.preferences',
  ratesCache: 'tasazo.rates',
  // Also read by the inline script in index.html, which applies the stored
  // theme before first paint. Keep the two in step.
  theme: 'tasazo.theme',
};

export const THEMES = { light: 'light', dark: 'dark' };

/** Highest overcharge the needle can point at. Larger values saturate it. */
export const GAUGE_MAX_PERCENT = 60;

/**
 * Bands of the gauge arc, as upper bounds in overcharge percent.
 *
 * Bands and verdicts name a tone rather than a colour: the stylesheet decides
 * what each tone looks like, which is what lets a second theme exist without
 * JavaScript knowing about it.
 */
export const GAUGE_ZONES = [
  { maxPercent: 3, tone: 'good' },
  { maxPercent: 10, tone: 'warn' },
  { maxPercent: 25, tone: 'bad' },
  { maxPercent: 60, tone: 'critical' },
];

/**
 * How far a merchant rate may stray from the nearest reference before it is
 * read as a typo rather than a charge (`CALC-8`).
 *
 * Deliberately far out. Merchants charge harshly, not absurdly: at a BCV of
 * 775.3356 a rate of 400 is a 93.8 % overcharge and still a charge someone
 * could genuinely make, while a factor of five is a dropped digit.
 */
export const TYPO_FACTOR = 5;

/**
 * Below this percentage the merchant is charging under the reference, which
 * favours the customer rather than harming them.
 */
export const BARGAIN_THRESHOLD_PERCENT = -0.5;

/**
 * Alarm levels, ordered from mildest to worst. The first level whose
 * `maxPercent` is not exceeded wins. Wording lives in `strings.js`.
 */
export const VERDICT_LEVELS = [
  { key: 'safe', maxPercent: 0.5, tone: 'good' },
  { key: 'fair', maxPercent: 3, tone: 'good' },
  { key: 'mild', maxPercent: 10, tone: 'warn' },
  { key: 'painful', maxPercent: 25, tone: 'bad' },
  { key: 'severe', maxPercent: 50, tone: 'critical' },
  { key: 'critical', maxPercent: Infinity, tone: 'critical' },
];

export const BARGAIN_VERDICT = {
  key: 'bargain',
  tone: 'bargain',
};

/** Which reference rate the gauge measures the merchant against. */
export const REFERENCE_MODES = {
  official: 'official',
  parallel: 'parallel',
  worst: 'worst',
};
