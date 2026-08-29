/**
 * Application entry point: holds the state, wires the events and drives a
 * single recalculation pass whenever anything changes.
 */

import {
  convert,
  crossRate,
  difference,
  findVerdict,
  impliedRate,
  overchargePercent,
  selectReading,
  toEuroRate,
} from './calculator.js';
import { REFERENCE_MODES, REFRESH_INTERVAL_MS, STORAGE_KEYS } from './config.js';
import { formatRate, parseAmount } from './format.js';
import { cacheRates, fetchRates, loadCachedRates } from './rates.js';
import { readJson, remove, writeJson } from './storage.js';
import { strings } from './strings.js';
import { initTheme, toggleTheme } from './theme.js';
import {
  buildGauge,
  elements,
  markInvalid,
  rateFields,
  renderComparison,
  renderGauge,
  renderResults,
  renderStatus,
  setImpliedRate,
  setRateMode,
  setRateValue,
  setReferenceMode,
  setRefreshBusy,
  setThemeToggle,
  showToast,
} from './ui.js';

const STATUS_TICK_MS = 30_000;

const state = {
  referenceMode: REFERENCE_MODES.official,
  /** Whether each reference rate follows the live feed or the user. */
  autoRates: { official: true, parallel: true },
  /** @type {import('./rates.js').RateSnapshot|null} */
  snapshot: null,
  isLoading: false,
  refreshTimer: null,
};

/* ----------------------------------------------------------- Persistence */

function savePreferences() {
  if (!elements.persistToggle.checked) return;

  writeJson(STORAGE_KEYS.preferences, {
    referenceMode: state.referenceMode,
    autoRates: state.autoRates,
    autoRefresh: elements.autoRefreshToggle.checked,
    amount: elements.amount.value,
    merchantRate: elements.merchantRate.value,
    priceUsd: elements.priceUsd.value,
    // Automatic rates come back from the feed, so only manual ones are kept.
    rates: {
      official: state.autoRates.official ? null : readRateGroup('official'),
      parallel: state.autoRates.parallel ? null : readRateGroup('parallel'),
    },
  });
}

const readRateGroup = (reference) => ({
  usd: rateFields[reference].usd.value,
  eur: rateFields[reference].eur.value,
});

function restorePreferences() {
  const saved = readJson(STORAGE_KEYS.preferences);
  if (!saved) return;

  state.referenceMode = Object.values(REFERENCE_MODES).includes(saved.referenceMode)
    ? saved.referenceMode
    : REFERENCE_MODES.official;

  state.autoRates = {
    official: saved.autoRates?.official !== false,
    parallel: saved.autoRates?.parallel !== false,
  };

  elements.autoRefreshToggle.checked = saved.autoRefresh !== false;
  elements.amount.value = saved.amount ?? '';
  elements.merchantRate.value = saved.merchantRate ?? '';
  elements.priceUsd.value = saved.priceUsd ?? '';

  for (const reference of Object.keys(rateFields)) {
    const group = saved.rates?.[reference];
    if (state.autoRates[reference] || !group) continue;
    rateFields[reference].usd.value = group.usd ?? '';
    rateFields[reference].eur.value = group.eur ?? '';
  }

  revealGroupsHoldingState();
}

/**
 * Restored input must never sit hidden behind a closed group: a value the user
 * typed last time is exactly the thing they expect to find again (UI-9).
 */
function revealGroupsHoldingState() {
  elements.merchantDisclosure.open =
    elements.merchantRate.value.trim() !== '' || elements.priceUsd.value.trim() !== '';
  elements.ratesDisclosure.open = !state.autoRates.official || !state.autoRates.parallel;
}

/* ------------------------------------------------------------ Live rates */

/** Copies the latest snapshot into whichever fields are still automatic. */
function applySnapshotToInputs({ flash = false } = {}) {
  if (!state.snapshot) return;

  for (const [reference, fields] of Object.entries(rateFields)) {
    if (!state.autoRates[reference]) continue;

    const published = {
      usd: state.snapshot.usd[reference],
      eur: state.snapshot.eur[reference],
    };

    for (const [currency, input] of Object.entries(fields)) {
      if (published[currency] === null) continue;
      setRateValue(input, formatRate(published[currency]), { flash });
    }
  }
}

async function refreshRates({ manual = false } = {}) {
  if (state.isLoading) return;

  state.isLoading = true;
  setRefreshBusy(true);
  renderStatus({ snapshot: state.snapshot, isLoading: true });

  try {
    state.snapshot = await fetchRates();
    cacheRates(state.snapshot);
    applySnapshotToInputs({ flash: true });
    if (manual) showToast(strings.toasts.ratesUpdated);
  } catch {
    // A failed request never discards what we already had: the previous
    // snapshot stays on screen and simply keeps ageing towards "stale".
    if (manual) {
      showToast(
        state.snapshot
          ? strings.toasts.ratesFailedWithCache
          : strings.toasts.ratesFailedNoCache,
      );
    }
  } finally {
    state.isLoading = false;
    setRefreshBusy(false);
    renderStatus({ snapshot: state.snapshot, isLoading: false });
    update();
  }
}

function scheduleAutoRefresh() {
  clearInterval(state.refreshTimer);
  if (!elements.autoRefreshToggle.checked) return;
  state.refreshTimer = setInterval(() => refreshRates(), REFRESH_INTERVAL_MS);
}

/* ---------------------------------------------------------------- Update */

/** Reads the form, recalculates everything and repaints. Cheap enough to run on every keystroke. */
function update() {
  const amount = readField(elements.amount);
  deriveMerchantRate(amount);
  const merchantRate = readField(elements.merchantRate);

  const rates = {
    official: {
      usd: readField(rateFields.official.usd),
      eur: readField(rateFields.official.eur),
    },
    parallel: {
      usd: readField(rateFields.parallel.usd),
      eur: readField(rateFields.parallel.eur),
    },
  };

  /*
   * The merchant quotes in dollars only, so its euro equivalent is derived
   * from the official pair. Reading the cross off the fields rather than the
   * snapshot means it survives offline, where the rates were typed by hand.
   */
  const cross = crossRate(rates.official.eur, rates.official.usd);

  const charges = {
    merchant: chargeFor(amount, merchantRate, toEuroRate(merchantRate, cross)),
    official: chargeFor(amount, rates.official.usd, rates.official.eur),
    parallel: chargeFor(amount, rates.parallel.usd, rates.parallel.eur),
  };

  renderResults(
    Object.entries(charges)
      .filter(([, charge]) => charge.usd !== null)
      .map(([key, charge]) => ({ key, ...charge })),
  );

  const percentages = {
    official: overchargePercent(merchantRate, rates.official.usd),
    parallel: overchargePercent(merchantRate, rates.parallel.usd),
  };

  for (const reference of ['official', 'parallel']) {
    renderComparison(reference, comparisonFor(charges, reference, percentages[reference]));
  }

  const reading = selectReading({ ...percentages, mode: state.referenceMode });
  renderGauge({
    percent: reading?.percent ?? null,
    referenceName: reading ? strings.referenceNames[reading.reference] : '',
    verdict: reading ? findVerdict(reading.percent) : null,
  });
}

/**
 * Fills the merchant's rate from a price quoted in dollars.
 *
 * At a till the rate is the one figure nobody states out loud, so asking for
 * it first is asking for what the customer does not have. The price they were
 * quoted and the bolívares on the screen are between them the same number.
 */
function deriveMerchantRate(amount) {
  const price = readField(elements.priceUsd);
  setImpliedRate(impliedRate(amount, price), {
    hasPrice: elements.priceUsd.value.trim() !== '',
  });
}

/** Parses a field and flags it when the text is there but unreadable. */
function readField(input) {
  const value = parseAmount(input.value);
  markInvalid(input, input.value.trim() !== '' && value === null);
  return value;
}

function chargeFor(amount, dollarRate, euroRate) {
  return {
    dollarRate,
    euroRate,
    usd: convert(amount, dollarRate),
    eur: convert(amount, euroRate),
  };
}

function comparisonFor(charges, reference, percent) {
  const verdict = findVerdict(percent);
  if (verdict === null) return null;

  return {
    percent,
    verdict,
    differenceUsd: difference(charges.merchant.usd, charges[reference].usd),
    differenceEur: difference(charges.merchant.eur, charges[reference].eur),
  };
}

/* ---------------------------------------------------------------- Events */

function toggleRateMode(reference, isAuto) {
  state.autoRates[reference] = isAuto;
  setRateMode(reference, isAuto);
  if (isAuto) applySnapshotToInputs({ flash: true });
}

function clearEverything() {
  elements.amount.value = '';
  elements.merchantRate.value = '';
  elements.merchantRate.classList.remove('is-invalid');
  elements.priceUsd.value = '';
  elements.priceUsd.classList.remove('is-invalid');
  toggleRateMode('official', true);
  toggleRateMode('parallel', true);
  state.referenceMode = REFERENCE_MODES.official;
  setReferenceMode(state.referenceMode);
  revealGroupsHoldingState();

  // The rate cache is public data from the feed, not the user's, so it stays.
  remove(STORAGE_KEYS.preferences);

  update();
  elements.amount.focus();
  showToast(strings.toasts.cleared);
}

function bindEvents() {
  for (const input of [elements.amount, elements.priceUsd]) {
    input.addEventListener('input', () => {
      update();
      savePreferences();
    });
  }

  // Typing the rate by hand is how you overrule a rate derived from a price,
  // mirroring how typing over an automatic reference rate takes it manual.
  elements.merchantRate.addEventListener('input', () => {
    elements.priceUsd.value = '';
    elements.priceUsd.classList.remove('is-invalid');
    update();
    savePreferences();
  });

  for (const [reference, fields] of Object.entries(rateFields)) {
    for (const input of Object.values(fields)) {
      input.addEventListener('input', () => {
        // Typing over an automatic rate is how you take manual control of it.
        if (state.autoRates[reference]) toggleRateMode(reference, false);
        update();
        savePreferences();
      });
    }
  }

  for (const toggle of document.querySelectorAll('.mode-toggle[data-rate]')) {
    toggle.addEventListener('click', () => {
      const { rate } = toggle.dataset;
      const isAuto = !state.autoRates[rate];

      toggleRateMode(rate, isAuto);
      if (isAuto && !state.snapshot) refreshRates({ manual: true });

      update();
      savePreferences();
      showToast(isAuto ? strings.toasts.autoRateOn : strings.toasts.autoRateOff);
    });
  }

  elements.referenceModes.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-mode]');
    if (!button) return;

    state.referenceMode = button.dataset.mode;
    setReferenceMode(state.referenceMode);
    update();
    savePreferences();
  });

  elements.refreshButton.addEventListener('click', () => refreshRates({ manual: true }));
  elements.clearButton.addEventListener('click', clearEverything);
  elements.themeToggle.addEventListener('click', () => setThemeToggle(toggleTheme()));

  elements.persistToggle.addEventListener('change', (event) => {
    if (event.target.checked) {
      savePreferences();
      showToast(strings.toasts.persistenceOn);
    } else {
      remove(STORAGE_KEYS.preferences);
      showToast(strings.toasts.persistenceOff);
    }
  });

  elements.autoRefreshToggle.addEventListener('change', (event) => {
    scheduleAutoRefresh();
    savePreferences();
    showToast(
      event.target.checked ? strings.toasts.autoRefreshOn : strings.toasts.autoRefreshOff,
    );
  });

  document.addEventListener('visibilitychange', () => {
    const isOverdue = state.snapshot && Date.now() - state.snapshot.fetchedAt > REFRESH_INTERVAL_MS;
    if (!document.hidden && elements.autoRefreshToggle.checked && isOverdue) refreshRates();
  });

  // Regaining connectivity is worth a fresh read, but only if the user has
  // left automatic refreshing on.
  window.addEventListener('online', () => {
    if (elements.autoRefreshToggle.checked) refreshRates();
  });

  // Keeps the "3 min ago" line honest without recalculating anything.
  setInterval(() => {
    if (state.snapshot && !state.isLoading) {
      renderStatus({ snapshot: state.snapshot, isLoading: false });
    }
  }, STATUS_TICK_MS);
}

/* ------------------------------------------------------------------ Boot */

function start() {
  initTheme(setThemeToggle);
  buildGauge();
  restorePreferences();

  setReferenceMode(state.referenceMode);
  setRateMode('official', state.autoRates.official);
  setRateMode('parallel', state.autoRates.parallel);

  // Show cached rates immediately; the network request only improves on them.
  state.snapshot = loadCachedRates();
  applySnapshotToInputs();

  bindEvents();
  renderStatus({ snapshot: state.snapshot, isLoading: false });
  update();

  refreshRates();
  scheduleAutoRefresh();
}

start();
