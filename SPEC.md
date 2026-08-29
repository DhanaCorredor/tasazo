# Specification · Tasazo

**Version:** 1.1
**Status:** current
**Last revised:** 2026-08-19

This document is the source of truth for *what* Tasazo does and what counts as correct. The code implements this specification, not the other way round: where the two disagree, either the code is fixed or this document is amended deliberately — never silently.

Requirements carry identifiers (`CALC-1`, `RATE-3`, …) so that tests, issues and commit messages can point at them.

---

## 1. Purpose

Venezuelan prices are quoted in foreign currency but charged in bolívares. Tasazo answers the question that comes up several times a day: **how much is this in dollars and euros?**

Type the bolívar amount and read the conversion at the official BCV rate and at the parallel rate, in both currencies, without touching anything else. The rates fetch themselves.

A second, optional question follows from the first: when a shop applies its own rate, how far is it from the reference? That comparison is available on demand but stays out of the way, because it is not why most people open the app.

### 1.1 Who it is for

Someone with a phone and ten seconds. Three design constraints follow:

- **One input.** Typing the amount is the whole interaction. Rates fetch themselves; nothing else is required to get an answer.
- **Immediate answer.** No calculate button; results follow every keystroke.
- **Progressive disclosure.** Everything beyond "what is this in dollars" — the merchant's rate, the overcharge gauge, editing rates by hand — is collapsed until asked for.

The interface is written in Venezuelan Spanish because that is who uses it. Everything else — identifiers, comments, commits, documentation — is in English, so the codebase stays legible to a wider audience. All user-facing copy is isolated in `src/strings.js`.

### 1.2 Non-goals

Deliberately out of scope for this version:

- History of past queries or of individual merchants.
- Recommending where to pay, or comparing establishments.
- Acting as financial advice, or claiming any rate is legally "correct".
- A backend, user accounts, or sync across devices.
- Currencies beyond USD and EUR.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Amount** | The bolívar sum the merchant wants to charge. |
| **Rate** | Bolívares per unit of foreign currency. Always entered as Bs/$. |
| **Merchant rate** | The rate the establishment applies. The one figure the user must type. |
| **Official rate** | Published by the Banco Central de Venezuela (BCV). |
| **Parallel rate** | Average of the unofficial market. |
| **Reference** | The rate the overcharge is measured against: official, parallel or worst case. |
| **Overcharge** | The percentage excess of foreign currency handed over versus the reference. |
| **Infartómetro** | The gauge translating that overcharge into an alarm level. |
| **Auto / manual mode** | Per-reference state: fed by the live source, or typed by the user. |

---

## 3. Calculation rules

The rule everything rests on, and the source of most confusion about it: **the bolívar amount is fixed**. A *lower* rate makes nothing cheaper — it means the customer surrenders *more* foreign currency. Overcharging therefore appears as a merchant rate **below** the reference.

**CALC-1 · Conversion.**

```text
foreign currency = amount ÷ rate
```

**CALC-2 · Overcharge percentage.**

```text
overcharge % = (reference rate ÷ merchant rate − 1) × 100
```

Positive means the customer overpays; negative means they come out ahead. The formula depends only on the two rates, so **the gauge produces a reading before any amount is typed** — the amount is needed for the money figures alone.

**CALC-3 · Absolute difference.**

```text
difference = merchant currency − reference currency
```

Reported in both dollars and euros.

**CALC-4 · Euro conversion.** Each reference carries its own Bs/€ rate, published by the source or typed by the user, and euros are converted with it directly — never derived. This matters to anyone paying from the euro zone, where the parallel euro rate is the figure that applies and is not a function of the dollar one.

Only the merchant's rate needs deriving, because a shop quotes in dollars alone. It uses the cross rate taken from the official pair **as those fields currently stand**, so the derivation holds up offline with hand-typed rates:

```text
EUR/USD cross = official EUR rate ÷ official USD rate
derived Bs/€   = Bs/$ rate × cross
euros          = amount ÷ Bs/€
```

**CALC-7 · Implied merchant rate.** A till states a price, never a rate. Where the price is quoted in dollars, the rate being applied falls out of the two figures the customer already has:

```text
merchant Bs/$ = amount ÷ price in dollars
```

The result is written into the merchant rate field itself, so everything downstream — gauge, verdict, comparison cards — keeps reading the single field it always read. While a price is present the derivation **owns** that field: losing the figures it needs empties the rate rather than leaving a stale one to go on driving the verdict. Typing directly into the rate discards the price and returns the field to the user, mirroring how typing over an automatic reference takes it manual (`AC-8`).

**CALC-8 · Implausible merchant rate.** A rate far enough from every reference is far likelier to be a slip of the thumb than a real charge, and the slip is almost always a digit: `70` for `700`.

A merchant rate is *implausible* when it sits a factor of five or more away from the **nearest** reference in either direction. The nearest is chosen on a logarithmic scale, so being ten times under and ten times over count as equally far. Both references are considered, so a single hand-typed reference that is itself wrong cannot on its own condemn the merchant's.

The correction offered is the power of ten that brings the rate closest to that reference:

```text
ratio      = nearest reference ÷ merchant rate
implausible = ratio ≥ 5  or  ratio ≤ 1/5
suggestion = merchant rate × 10 ^ round(log₁₀ ratio)
```

The threshold is deliberately far out. Real merchants charge harshly, not absurdly: a rate of `400` against a BCV of `775.3356` is a 93.8 % overcharge and stays unflagged, because it is a charge someone could genuinely make.

Detection **never changes a figure and never blocks anything** (`UI-2`). The reading, the verdict and every conversion stand exactly as they would without it; the app says what it suspects and leaves the decision to the person holding the phone.

**CALC-5 · Precision.** Calculations run in floating point with no intermediate rounding. Rounding happens only on display (`UI-6`).

**CALC-6 · Insufficient data.** A result depending on a missing, zero or unreadable value is omitted, never shown as zero. An amount without a merchant rate produces no rows; a merchant rate without any reference produces no gauge reading.

---

## 4. Rate acquisition

**RATE-1 · Source.** `https://ve.dolarapi.com/v1/dolares` and `/v1/euros`, reading the `promedio` field of the `oficial` and `paralelo` entries.

**RATE-2 · Why a mirror and not the BCV.** `bcv.org.ve` is not consumable from a browser: its TLS chain is incomplete and it sends no CORS headers, so a `fetch()` fails before reading a byte. Reading the BCV directly would require a backend of our own, which contradicts §1.2. **Revisit if an official CORS-enabled source appears.**

**RATE-3 · When rates are fetched.**

- on page load;
- every 10 minutes, while automatic refresh is on;
- on returning to the tab, if more than 10 minutes have passed since the last success;
- on regaining connectivity, subject to the same automatic-refresh switch;
- whenever the user presses Refresh.

**RATE-4 · Timeout.** Each request aborts after 9 seconds. A request in flight suppresses any new one.

**RATE-5 · Freshness states.**

| State | Condition | Signal |
|---|---|---|
| Live | last success ≤ 45 min ago | green |
| Stale | last success > 45 min ago | amber |
| No source | never fetched, nothing cached | red |

The status strip always shows the rate in force, its age in plain language, and the BCV valuation date.

**RATE-6 · Auto/manual state machine.** Each reference is a *pair* of rates — Bs/$ and Bs/€ — governed by one switch, since both come from the same source and are trusted or replaced together. Each reference is independently auto or manual:

- Starts **auto**, receiving every new value with a brief visual flash.
- Typing in the field switches it to **manual** at once; it stops updating and its value persists between sessions.
- The toggle beside the label switches modes. Returning to auto repopulates the field from the live source.
- The merchant rate is outside this machine — always manual.

**RATE-7 · Cache.** The last successful snapshot is stored locally and loaded before the first request, so the app is usable offline with the last known rate, flagged per `RATE-5`.

**RATE-8 · Failed request.** A network error never discards the current snapshot: the previous value stays and keeps ageing towards stale. Only a user-initiated refresh reports the failure.

**RATE-9 · Partial payloads.** The official dollar rate is the one figure the app cannot work without; its absence is treated as a failed request. Any other missing figure degrades that column only.

---

## 5. Interface and verdict

**UI-1 · Alarm levels.**

| Overcharge | Colour | Verdict (as shown) |
|---|---|---|
| < −0.5 % | Cyan | ¡Te están dando chance! 🤑 |
| ≤ 0.5 % | Green | Todo legal, respira 😇 |
| ≤ 3 % | Green | Cobro justo 🙂 |
| ≤ 10 % | Yellow | Te están clavando un poquito 🤨 |
| ≤ 25 % | Orange | Ay papá, eso duele 😰 |
| ≤ 50 % | Red | ¡Llamen a la ambulancia! 🚑 |
| > 50 % | Red | Código azul, traigan el desfibrilador 💀 |

The humour is functional rather than decorative: a percentage gets read, a verdict gets understood. No wording may imply the merchant is committing a crime — a freely set rate is not illegal, and the app reports differences, not offences.

**UI-2 · Needle.** Sweeps a semicircle over a 0–60 % domain. Readings beyond it saturate the needle while the printed figure keeps its true value: the needle clips, the number never lies.

**UI-3 · Reference selection.** The user picks official, parallel or **worst case** (the harsher of the two, ties resolving to the official rate). If the chosen reference has no data, the other is used and the label names whichever was applied.

**UI-4 · Recalculation.** Every result updates on each keystroke and on every arrival of new rates. There is no explicit calculate action.

**UI-5 · Forgiving input.** Comma and dot are both accepted as decimal mark and as thousands separator (`1.234,56` and `1,234.56` are one number). Currency symbols and whitespace are discarded. Input that is not fully numeric afterwards is rejected — `100abc` is a typo, not a hundred — and marks the field without blocking the rest of the app.

**UI-6 · Output formatting.** `es-VE` locale. Money to two decimals; rates to between two and four, so the BCV's published precision is not truncated; percentages to one.

**UI-7 · Mobile-first.** The phone is the design, not a fallback. Every base style targets a narrow screen and the breakpoints only ever add; there is no horizontal scrolling at any width. Specifically:

- Interactive targets are at least 44 px in their smallest dimension. Where a control is deliberately small, its hit area is enlarged without changing its appearance.
- Text inputs never fall below 16 px, because iOS Safari zooms the viewport on focus for anything smaller and does not zoom back out.
- Layout respects `env(safe-area-inset-*)` so nothing lands under a home indicator.
- Decorative work is cheapest on the smallest screens: blur radii and animated backdrops scale up with the viewport rather than down.
- `prefers-reduced-motion` is honoured.

**UI-12 · Warning, not correction.** An implausible merchant rate (`CALC-8`) raises a warning beside the field, naming the figure that was probably meant. It is a live region, it never fills the field on the user's behalf, and it never suppresses a result: the app cannot tell a typo from a robbery, so it says which one it suspects rather than deciding.

**UI-8 · Accessibility.** The gauge carries a text alternative that includes the current reading and its reference. The verdict and the status strip are live regions, so a screen reader hears results change without the user hunting for them.

**UI-9 · Progressive disclosure.** The page opens on the amount field and the conversion, and nothing else competes with them. Two groups sit collapsed beneath:

| Group | Contains |
|---|---|
| *¿Te cobran a otra tasa?* | price in dollars, merchant rate, gauge, verdict, comparison cards, reference selector |
| *Ajustar las tasas a mano* | the reference rate fields and their auto/manual toggles |

Both are ordinary disclosure elements, so they work without JavaScript, are keyboard operable and are searchable by the browser's find-in-page. A group reopens on load when it holds a value the user left behind — a merchant rate or a quoted price typed earlier reopens its group, so restored state is never hidden from the person who entered it.

Collapsed content is still rendered and kept current; disclosure governs visibility, never correctness.

**UI-10 · Theme.** Light is the default and does not follow the operating system: a calculator read in daylight at a till should look the same whatever the phone happens to be set to. Dark is available on request through the toggle, and the request is remembered.

The dark palette is neutral black. Colour in the background - a tinted ground, coloured backdrop glows - casts over the whole page and reads as a hue rather than as dark; the accents carry the identity instead.

A stored choice is applied before the first paint, so no load shows a frame of the wrong palette.

**UI-11 · Legibility of the light palette.** Light is the default (`UI-10`), so it is the palette that has to hold up, and translucency is what breaks it: a 72 %-white panel over a near-white page has no edge to see. On light, surfaces are **opaque**, borders are drawn rather than implied, and the glass — backdrop blur, inset highlights — belongs to the dark palette alone, carried by a single `--surface-blur` token that resolves to `none`.

Every foreground token clears **4.5:1** against the surface it sits on, accents included, and no body copy is set below weight 400: a hairline weight in a muted grey is unreadable on white whatever its contrast figure says.

Colour is never named in JavaScript. The gauge bands and every verdict carry a *tone* — `good`, `warn`, `bad`, `critical`, `bargain` — and the stylesheet decides what a tone looks like in each palette. Accent colours are darkened for the light palette, where the neon values fail contrast against white.

---

## 6. Persistence

**STORE-1 · What is kept.** Amount, quoted price, merchant rate, reference rates *only while manual*, gauge reference and both switches.

**STORE-2 · User control.** Persistence can be switched off; doing so erases what was already stored.

**STORE-3 · Clear data.** Empties the amount, the quoted price and the merchant rate, returns both references to auto and repopulates them. It does **not** clear the rate cache: that is public data from the source, not the user's.

**STORE-4 · Storage unavailable.** Where the browser blocks local storage, the app works normally for the session and reports no error.

---

## 7. Acceptance criteria

Figures below are the real rates of 2026-08-19: official `775.3356`, parallel `881.054062`, official euro `897.82311808`.

**AC-1 · Typical overcharge.**
Given an amount of `10,000` Bs and a merchant rate of `700`, referenced to the official rate,
then `$14.29` is shown for the merchant and `$12.90` for the BCV,
the overcharge reads `10.8 %`, the difference `+$1.39`,
and the verdict is orange: *"Ay papá, eso duele"*.

**AC-2 · Euro equivalent.**
In the same scenario the cross rate is `1.1580`,
the merchant rate is equivalent to `810.59 Bs/€`,
and `€12.34` is shown against the BCV's `€11.14`, a difference of `+€1.20`.

**AC-3 · Fair charge.**
Given a merchant rate equal to the official rate,
then the overcharge reads `0.0 %`, the needle rests at the far left,
and the verdict is green: *"Todo legal, respira"*.

**AC-4 · Charge in the customer's favour.**
Given a merchant rate of `800` against an official rate of `775.3356`,
then the overcharge reads `−3.1 %`, the label reads *"Descuento vs. BCV"*,
and the verdict is *"¡Te están dando chance!"*.

**AC-5 · Needle saturation.**
Given a merchant rate of `500`, the reading is `55.1 %` with the *"Código azul"* verdict.
At `400` the figure rises to `93.8 %` while the needle stays at the stop.

**AC-6 · Worst case.**
Given overcharges of `10.8 %` (official) and `25.9 %` (parallel),
worst-case mode reads `25.9 %` and names the parallel rate.

**AC-7 · Reading without an amount.**
Given a merchant rate and a reference rate but no amount,
then the gauge and both percentages are shown, and the money figures read `—`.

**AC-7b · Conversion is the whole interaction.**
Given a freshly loaded page and an amount of `10,000` Bs,
then both conversions are shown without any further input,
and both disclosure groups remain closed.

**AC-7c · Restored state reopens its group.**
Given a merchant rate saved from an earlier session,
when the page loads, its disclosure group is open.

**AC-8 · Taking manual control.**
Given an official rate in auto mode, when the user types in the field,
then it switches to manual, stops updating on subsequent refreshes,
and keeps its value across a reload.

**AC-9 · Returning to automatic.**
Given a manual rate, when the user presses its mode toggle,
then it returns to auto, repopulates from the live source and stops being persisted.

**AC-10 · Offline.**
Given a previous successful fetch and no network,
the cached rates are shown on load, the state turns amber past 45 minutes,
and every calculation keeps working.

**AC-13 · A rate nobody stated.**
Given an amount of `14,000` Bs and a price quoted as `20 $`,
then the merchant rate reads `700.00`, marked as derived rather than typed,
and the gauge reads against it exactly as if it had been typed.
Retyping the amount as `15,000` moves the rate to `750.00`;
making the price unreadable empties the rate;
typing into the rate clears the price and hands the field back.

**AC-14 · A digit dropped.**
Given a merchant rate of `70` against an official rate of `775.3356`,
then the reading still says `1,007.6 %` and the verdict is still *"Código azul"*,
and a warning names `700.00` as the figure probably meant.
At `400` — a 93.8 % overcharge — no warning is raised.

**AC-11 · Ambiguous input.**
`1.234,56` and `1,234.56` are both read as `1234.56`.

**AC-12 · Invalid input.**
Given non-numeric text in a field, that field is marked, results depending on it are omitted,
and the rest of the interface stays usable.

---

## 8. Known gaps

Writing this specification after the fact exposed behaviour that existed by accident of implementation rather than by decision. Three were corrected while restructuring the project — lenient parsing, a missing text alternative on the gauge, and reconnection ignoring the refresh switch.

Identifiers here are stable: a gap that is closed stays listed as closed rather than being renumbered away, and a new one takes the next free number.

### Open

**GAP-2 · One verdict for every bargain.** −1 % and −40 % read identically. The alarm scale is graduated; the relief scale is not.

**GAP-3 · No retry after a failure.** A failed request waits the full ten-minute cycle. Backoff would cover the brief outages that are the common case.

**GAP-5 · No visual regression.** The DOM is covered by suites that boot the real application in jsdom, which catches wiring, rendering and state. What no test sees is how any of it *looks*: layout, contrast and motion are still verified by eye.

This has already cost two defects, both invisible to a suite that was entirely green at the time. The light palette shipped with translucent surfaces that left every panel edgeless against the page (`UI-11`), and the gauge needle carried a glow filter whose region was measured against a bounding box — zero pixels high for a horizontal line — so the needle was absent from the dial at every angle, in every theme, from the first commit. jsdom parses the SVG and reports the needle's rotation correctly; it renders nothing, and neither defect could fail a test.

**GAP-6 · Merchant euros depend on the official pair.** Every reference carries its own euro rate, but the merchant's is quoted in dollars alone, so its euro equivalent still comes from the official cross. Clearing the official euro field therefore removes the merchant's euro figure while leaving its dollar figure intact — correct, but unexplained on screen.

### Closed

**GAP-4 · No defence against typos.** ~~Entering `70` instead of `700` yields a thousand-percent overcharge and a catastrophic verdict, with nothing suggesting the input may be wrong.~~ Closed by flagging a rate a factor of five or more from every reference and naming the power of ten that was probably meant (`CALC-8`, `UI-12`). The figures themselves are left alone.

**GAP-1 · No euros on a first offline run.** ~~The cross rate depended on BCV data, so a first run with no network and hand-typed rates lost the euro column.~~ Closed by giving every reference its own euro rate (`CALC-4`).

---

## 9. Roadmap

Out of scope for 1.0, ordered by value against effort:

1. Visual regression, the one gap tests cannot close by reading the DOM.
2. Installable as a PWA with a service worker: the use case is a phone at a till, often without signal.
3. Share a result as text or an image.
4. Selectable rate providers, should a second CORS-enabled source appear.
5. Query history, which would enable comparing merchants over time — but it stores spending habits and deserves its own privacy decision.

---

## 10. Maintaining this document

Any behavioural change lands here **before** the code changes, and the commit references the affected requirement identifier. Should a formal SDD workflow be adopted, this becomes the root specification and each new feature gets `specs/NNN-name/` with its own plan and task breakdown.
