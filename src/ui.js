/**
 * Everything that touches the DOM.
 *
 * Rendering functions receive plain data and write it to the page; they never
 * calculate anything and never reach for state. That keeps `calculator.js`
 * testable in Node and confines browser knowledge to this file.
 */

import { GAUGE_MAX_PERCENT, GAUGE_ZONES, STALE_AFTER_MS } from './config.js';
import {
  formatCrossRate,
  formatDate,
  formatMoney,
  formatPercent,
  formatRate,
  timeAgo,
} from './format.js';
import { strings } from './strings.js';

const byId = (id) => document.getElementById(id);

export const elements = {
  amount: byId('amountInput'),
  merchantRate: byId('merchantRateInput'),
  priceUsd: byId('priceUsdInput'),
  impliedNote: byId('impliedNote'),
  officialRate: byId('officialRateInput'),
  officialEuro: byId('officialEuroInput'),
  parallelRate: byId('parallelRateInput'),
  parallelEuro: byId('parallelEuroInput'),

  statusBar: byId('statusBar'),
  statusTitle: byId('statusTitle'),
  statusDetail: byId('statusDetail'),
  refreshButton: byId('refreshButton'),
  clearButton: byId('clearButton'),
  euroNote: byId('euroNote'),

  persistToggle: byId('persistToggle'),
  autoRefreshToggle: byId('autoRefreshToggle'),
  referenceModes: byId('referenceModes'),

  merchantDisclosure: byId('merchantDisclosure'),
  ratesDisclosure: byId('ratesDisclosure'),
  themeToggle: byId('themeToggle'),

  gauge: byId('gauge'),
  gaugeTrack: byId('gaugeTrack'),
  gaugeZones: byId('gaugeZones'),
  gaugeTicks: byId('gaugeTicks'),
  gaugeNeedle: byId('gaugeNeedle'),
  readingValue: byId('readingValue'),
  readingLabel: byId('readingLabel'),

  verdictBox: byId('verdictBox'),
  verdictEmoji: byId('verdictEmoji'),
  verdictTitle: byId('verdictTitle'),
  verdictDetail: byId('verdictDetail'),

  resultsList: byId('resultsList'),
  comparisonCards: {
    official: document.querySelector('[data-reference="official"]'),
    parallel: document.querySelector('[data-reference="parallel"]'),
  },

  toast: byId('toast'),
};

/**
 * Rate inputs, grouped by source. Each source carries both currencies: the
 * feed publishes a euro rate of its own, and deriving one from the dollar rate
 * would throw that away.
 */
export const rateFields = {
  official: { usd: elements.officialRate, eur: elements.officialEuro },
  parallel: { usd: elements.parallelRate, eur: elements.parallelEuro },
};

/* ------------------------------------------------------------------ Gauge */

const CENTER_X = 150;
const CENTER_Y = 150;
const RADIUS = 120;

/** Point on the arc, measured in degrees from the left-hand end. */
function pointAt(degrees, radius = RADIUS) {
  const radians = (degrees * Math.PI) / 180;
  return [CENTER_X - radius * Math.cos(radians), CENTER_Y - radius * Math.sin(radians)];
}

function arcPath(fromDegrees, toDegrees, radius = RADIUS) {
  const [startX, startY] = pointAt(fromDegrees, radius);
  const [endX, endY] = pointAt(toDegrees, radius);
  return `M ${startX.toFixed(2)} ${startY.toFixed(2)} A ${radius} ${radius} 0 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`;
}

const toDegrees = (percent) => (percent / GAUGE_MAX_PERCENT) * 180;

/** Draws the static parts of the meter: track, coloured bands and ticks. */
export function buildGauge() {
  elements.gaugeTrack.setAttribute('d', arcPath(0, 180));

  let lowerBound = 0;
  elements.gaugeZones.innerHTML = GAUGE_ZONES.map((zone) => {
    // A hair of padding keeps neighbouring bands from bleeding into each other.
    const start = toDegrees(lowerBound) + (lowerBound === 0 ? 0 : 1.2);
    const end = toDegrees(zone.maxPercent);
    lowerBound = zone.maxPercent;
    return `<path class="gauge-zone" data-tone="${zone.tone}" d="${arcPath(start, end)}"/>`;
  }).join('');

  const ticks = [];
  for (let percent = 0; percent <= GAUGE_MAX_PERCENT; percent += 5) {
    const isMajor = percent % 15 === 0;
    const [outerX, outerY] = pointAt(toDegrees(percent), RADIUS - 12);
    const [innerX, innerY] = pointAt(toDegrees(percent), RADIUS - (isMajor ? 22 : 18));
    ticks.push(
      `<line x1="${outerX.toFixed(1)}" y1="${outerY.toFixed(1)}" x2="${innerX.toFixed(1)}" y2="${innerY.toFixed(1)}" opacity="${isMajor ? 0.9 : 0.4}"/>`,
    );
  }
  elements.gaugeTicks.innerHTML = ticks.join('');
}

let lastVerdictKey = null;

/**
 * Points the needle and writes the verdict.
 *
 * @param {{percent: number|null, referenceName: string, verdict: object|null}} reading
 */
export function renderGauge({ percent, referenceName, verdict }) {
  if (percent === null || verdict === null) {
    elements.gaugeNeedle.style.transform = 'rotate(0deg)';
    elements.readingValue.innerHTML = '—<small>%</small>';
    delete elements.readingValue.dataset.tone;
    elements.readingLabel.textContent = strings.gauge.idle;
    elements.gauge.setAttribute('aria-label', strings.gauge.ariaLabel(null));

    applyVerdict(strings.verdicts.waiting, null);
    lastVerdictKey = null;
    return;
  }

  const clamped = Math.min(Math.max(percent, 0), GAUGE_MAX_PERCENT);
  elements.gaugeNeedle.style.transform = `rotate(${toDegrees(clamped).toFixed(2)}deg)`;

  const magnitude = formatPercent(Math.abs(percent));
  const sign = percent < 0 ? '−' : '';
  elements.readingValue.innerHTML = `${sign}${magnitude}<small>%</small>`;
  elements.readingValue.dataset.tone = verdict.tone;

  elements.readingLabel.textContent =
    percent >= 0
      ? strings.gauge.overchargeAgainst(referenceName)
      : strings.gauge.discountAgainst(referenceName);
  elements.gauge.setAttribute('aria-label', strings.gauge.ariaLabel(magnitude, referenceName));

  applyVerdict(strings.verdicts[verdict.key], verdict);

  const escalated = lastVerdictKey !== null && lastVerdictKey !== verdict.key;
  if (escalated && verdict.tone === 'critical') {
    elements.verdictBox.classList.remove('is-alarming');
    void elements.verdictBox.offsetWidth; // restart the animation
    elements.verdictBox.classList.add('is-alarming');
  }
  lastVerdictKey = verdict.key;
}

function applyVerdict(copy, verdict) {
  elements.verdictEmoji.textContent = copy.emoji;
  elements.verdictTitle.textContent = copy.title;
  elements.verdictDetail.textContent = copy.detail;

  elements.verdictTitle.className = `verdict-title${verdict ? ` tone-${verdict.tone}` : ''}`;

  if (verdict) elements.verdictBox.dataset.tone = verdict.tone;
  else delete elements.verdictBox.dataset.tone;
}

/* ---------------------------------------------------------------- Results */

/** Rows shown last pass, so only genuinely new ones animate in. */
let renderedRowKeys = [];

/**
 * @param {Array<{key: string, dollarRate: number, euroRate: number|null,
 *                usd: number, eur: number|null}>} rows
 */
export function renderResults(rows) {
  if (rows.length === 0) {
    elements.resultsList.innerHTML = `<p class="empty">${strings.emptyResults}</p>`;
    renderedRowKeys = [];
    return;
  }

  const keys = rows.map((row) => row.key);
  // Every keystroke rebuilds this list. Animating all of it each time would be
  // strobing, so the entrance is reserved for rows that were not there before.
  const entering = new Set(keys.filter((key) => !renderedRowKeys.includes(key)));
  renderedRowKeys = keys;

  elements.resultsList.innerHTML = rows
    .map((row) => {
      const euroRate = row.euroRate === null ? '' : ` · Bs. ${formatRate(row.euroRate)} / €`;
      const euroAmount =
        row.eur === null ? '' : `<p class="result-eur">€${formatMoney(row.eur)}</p>`;

      return `
        <article class="result${entering.has(row.key) ? ' is-entering' : ''}" data-rate="${row.key}">
          <div>
            <p class="result-name">${strings.rateLabels[row.key]}</p>
            <p class="result-rate">${strings.rateCaptions[row.key]}<br>Bs. ${formatRate(row.dollarRate)} / $${euroRate}</p>
          </div>
          <div class="result-amounts">
            <p class="result-usd">$${formatMoney(row.usd)}</p>
            ${euroAmount}
          </div>
        </article>`;
    })
    .join('');
}

/* ------------------------------------------------------------- Comparison */

/**
 * @param {'official'|'parallel'} reference
 * @param {{percent: number, differenceUsd: number, differenceEur: number|null,
 *          verdict: object}|null} data
 */
export function renderComparison(reference, data) {
  const card = elements.comparisonCards[reference];
  const usd = card.querySelector('.comparison-usd');
  const eur = card.querySelector('.comparison-eur');
  const percent = card.querySelector('.comparison-percent');
  const bar = card.querySelector('.meter-bar span');

  if (data === null) {
    usd.textContent = '—';
    usd.className = 'comparison-usd';
    eur.textContent = '';
    percent.textContent = '—';
    percent.className = 'comparison-percent';
    bar.style.width = '0%';
    delete bar.dataset.tone;
    return;
  }

  // The percentage stands on the rates alone, so it is shown even before an
  // amount is typed; only the money figures wait for one.
  if (data.differenceUsd === null) {
    usd.textContent = '—';
    usd.className = 'comparison-usd';
    eur.textContent = '';
  } else {
    const sign = data.differenceUsd >= 0 ? '+' : '−';
    usd.textContent = `${sign}$${formatMoney(Math.abs(data.differenceUsd))}`;
    usd.className = `comparison-usd tone-${data.verdict.tone}`;
    eur.textContent =
      data.differenceEur === null ? '' : `${sign}€${formatMoney(Math.abs(data.differenceEur))}`;
  }

  const magnitude = formatPercent(Math.abs(data.percent));
  percent.textContent =
    data.percent >= 0
      ? strings.comparison.overcharge(magnitude)
      : strings.comparison.discount(magnitude);
  percent.className = `comparison-percent tone-${data.verdict.tone}`;

  bar.style.width = `${Math.min(100, (Math.abs(data.percent) / GAUGE_MAX_PERCENT) * 100)}%`;
  bar.dataset.tone = data.verdict.tone;
}

/* ------------------------------------------------------------ Rate status */

/**
 * @param {{snapshot: object|null, isLoading: boolean}} state
 */
export function renderStatus({ snapshot, isLoading }) {
  const bar = elements.statusBar;
  bar.classList.toggle('is-loading', isLoading);
  bar.classList.remove('is-live', 'is-stale', 'is-offline');

  if (snapshot === null) {
    elements.statusTitle.textContent = isLoading
      ? strings.status.loading
      : strings.status.offline;
    elements.statusDetail.textContent = isLoading
      ? strings.status.loadingDetail
      : strings.status.offlineDetail;
    if (!isLoading) bar.classList.add('is-offline');
    elements.euroNote.textContent = strings.status.euroPending;
    return;
  }

  const isStale = Date.now() - snapshot.fetchedAt > STALE_AFTER_MS;
  bar.classList.add(isStale ? 'is-stale' : 'is-live');
  elements.statusTitle.textContent = isStale ? strings.status.stale : strings.status.live;

  const parts = [`BCV ${formatRate(snapshot.usd.official)}`];
  if (snapshot.usd.parallel) parts.push(`Paralelo ${formatRate(snapshot.usd.parallel)}`);
  parts.push(timeAgo(snapshot.fetchedAt));
  if (snapshot.valuationDate) parts.push(`valor del ${formatDate(snapshot.valuationDate)}`);
  elements.statusDetail.textContent = parts.join(' · ');

  renderEuroNote(snapshot);
}

function renderEuroNote(snapshot) {
  const { official, parallel } = snapshot.eur;

  if (!official && !parallel) {
    elements.euroNote.textContent = strings.status.euroUnavailable;
    return;
  }

  const pieces = [`Euro: BCV ${official ? formatRate(official) : '—'} Bs/€`];
  if (parallel) pieces.push(`paralelo ${formatRate(parallel)} Bs/€`);

  const cross =
    official && snapshot.usd.official ? formatCrossRate(official / snapshot.usd.official) : '—';

  elements.euroNote.textContent =
    `${pieces.join(' · ')}. El cobro del comercio se pasa a euros con el cruce €/$ del BCV (${cross}).`;
}

/* ---------------------------------------------------------------- Inputs */

export function markInvalid(input, isInvalid) {
  input.classList.toggle('is-invalid', isInvalid);
}

/** Writes a rate into its field, optionally flagging that it just changed. */
export function setRateValue(input, text, { flash = false } = {}) {
  if (input.value === text) return;
  input.value = text;
  if (!flash) return;

  input.classList.remove('just-updated');
  void input.offsetWidth; // restart the animation
  input.classList.add('just-updated');
}

/**
 * Shows the rate worked out from a price quoted in dollars.
 *
 * The value lands in the merchant rate field itself rather than beside it, so
 * the rest of the app — gauge, verdict, comparison cards — keeps reading the
 * one field it always read.
 *
 * @param {number|null} rate null when there is nothing to derive from
 */
export function setImpliedRate(rate, { hasPrice = false } = {}) {
  const isDerived = rate !== null;
  elements.merchantRate.classList.toggle('is-derived', isDerived);

  if (isDerived) {
    // No flash: this recomputes on every keystroke of the amount, and a field
    // pulsing under the finger reads as an error rather than an update.
    setRateValue(elements.merchantRate, formatRate(rate));
    elements.impliedNote.innerHTML = strings.merchant.implied(formatRate(rate));
    return;
  }

  /*
   * While a price is on screen the derivation owns the rate field. Losing the
   * figure it needs — an unreadable price, an amount that was cleared — has to
   * empty that field too, or a rate derived a keystroke ago would go on
   * driving the verdict as if it were still true.
   */
  if (hasPrice) setRateValue(elements.merchantRate, '');
  elements.impliedNote.textContent = strings.merchant.impliedHint;
}

export function setRateMode(reference, isAuto) {
  const toggle = document.querySelector(`.mode-toggle[data-rate="${reference}"]`);

  for (const input of Object.values(rateFields[reference])) {
    input.classList.toggle('is-auto', isAuto);
  }
  toggle.classList.toggle('is-auto', isAuto);
  toggle.setAttribute('aria-pressed', String(isAuto));
  toggle.textContent = isAuto ? strings.rateModes.auto : strings.rateModes.manual;
  toggle.title = isAuto ? strings.rateModes.autoHint : strings.rateModes.manualHint;
}

export function setReferenceMode(mode) {
  for (const button of elements.referenceModes.querySelectorAll('button')) {
    const isSelected = button.dataset.mode === mode;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  }
}

export function setRefreshBusy(isBusy) {
  elements.refreshButton.disabled = isBusy;
}

/** The button offers the theme you would switch *to*, not the one you are in. */
export function setThemeToggle(theme) {
  const goingToLight = theme === 'dark';
  elements.themeToggle.textContent = goingToLight
    ? strings.theme.lightIcon
    : strings.theme.darkIcon;
  elements.themeToggle.setAttribute(
    'aria-label',
    goingToLight ? strings.theme.toLight : strings.theme.toDark,
  );
  elements.themeToggle.title = goingToLight ? strings.theme.toLight : strings.theme.toDark;
}

/* ----------------------------------------------------------------- Toast */

let toastTimer;

export function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
}
