<p align="center">
  <img src="logo.svg" width="72" height="72" alt="">
</p>

<h1 align="center">Tasazo</h1>

<p align="center">
  <em>How much is that in dollars?</em><br>
  A web calculator that turns a Venezuelan bolívar amount into dollars and euros
  at the official and parallel rates, which it fetches on its own.<br>
  No framework, no bundler, no runtime dependencies.
</p>

<p align="center">
  <a href="https://tasazo.vercel.app"><strong>Live demo →</strong></a>
</p>

<p align="center">
  <a href="https://github.com/DhanaCorredor/tasazo/actions/workflows/ci.yml">
    <img src="https://github.com/DhanaCorredor/tasazo/actions/workflows/ci.yml/badge.svg" alt="CI status">
  </a>
  <img src="https://img.shields.io/badge/tests-84-brightgreen" alt="84 tests">
  <img src="https://img.shields.io/badge/dependencies-0%20runtime-brightgreen" alt="No runtime dependencies">
  <img src="https://img.shields.io/badge/licence-MIT-blue" alt="MIT licence">
</p>

<p align="center">
  <a href="https://tasazo.vercel.app">Demo</a> ·
  <a href="SPEC.md">Specification</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#getting-started">Getting started</a>
</p>

---

<!--
  Screenshots go here. Drop two PNGs about 800px wide into docs/ — the light
  theme showing a conversion, and the dark theme with the Infartómetro open —
  then delete the comment markers around the block below.

## What it looks like

<p align="center">
  <img src="docs/screenshot-light.png" width="800" alt="Tasazo converting a bolívar amount into dollars and euros">
  <img src="docs/screenshot-dark.png" width="800" alt="The Infartómetro showing an overcharge against the official rate">
</p>

---
-->

## The problem

Venezuelan prices are quoted in foreign currency but charged in bolívares, so the same question comes up several times a day: *how much is this actually worth?*

Tasazo answers it in one step. Type the bolívar amount and read it in dollars and euros, at both the official BCV rate and the parallel rate. Nothing else to fill in — the rates fetch themselves.

## Features

- **One input.** Type the amount; both conversions appear in both currencies as you type.
- **Works out the shop's rate for you.** Nobody at a till announces a Bs/$ rate. Give the price they quoted in dollars and the rate they are applying falls out of it.
- **Rates that fetch themselves.** Official and parallel rates load on open and refresh every ten minutes, on tab focus and on regaining connectivity.
- **Works offline.** The last successful snapshot is cached and clearly flagged once stale.
- **Progressive disclosure.** Two collapsed groups hold everything beyond the basic question: comparing against a shop's own rate, and editing rates by hand.
- **Light and dark.** Light by default whatever the device prefers; dark is one tap away and the choice sticks.
- **Built for a phone at a till.** Mobile-first, 44 px targets, inputs that never trigger iOS zoom, and a layout that respects the safe area.
- **Accessible.** The gauge announces its reading, results and status are live regions, and `prefers-reduced-motion` switches every animation off.
- **Remembers your session**, and lets you switch that off.

## The optional half: is this shop overcharging?

Shops apply their own rate, and a rate *below* the reference means you hand over more currency for the same goods. Open *"¿Te cobran a otra tasa?"* and the **Infartómetro** maps the gap onto an alarm level — from *"todo legal, respira"* to *"código azul"*.

You are rarely told a rate, though. You are told a price. So the group asks for the figure you actually have — *"cuesta 20 $"* — and works the rate out against the bolívares on screen: 14.000 Bs for a 20 $ item is 700 Bs/$, which against a BCV of 775,34 is a 10,8 % overcharge. The derived rate lands in the rate field itself, so everything below it reads exactly as if you had typed it. If you do know the rate, type it and the price steps aside.

It stays collapsed because it is not why most people open the app.

## The rule it all rests on

The bolívar amount is fixed, so a *lower* rate makes nothing cheaper — it means you surrender *more* foreign currency. Overcharging shows up as a merchant rate **below** the reference:

```text
foreign currency = amount ÷ rate
overcharge %     = (reference rate ÷ merchant rate − 1) × 100
```

Charged at 700 Bs/$ while the BCV sits at 775.34, you are paying about 10.8 % over the odds.

| Overcharge | Verdict |
|---|---|
| ≤ 3 % | 🟢 Todo legal, respira |
| 3–10 % | 🟡 Te están clavando un poquito |
| 10–25 % | 🟠 Ay papá, eso duele |
| 25–50 % | 🔴 ¡Llamen a la ambulancia! |
| > 50 % | 💀 Código azul, traigan el desfibrilador |

## Language

The interface is in Venezuelan Spanish, because that is who uses it. Everything else — identifiers, comments, commits, documentation — is in English. All user-facing copy lives in [`src/strings.js`](src/strings.js), so wording can be reviewed without reading any logic, and a second locale would be an additive change.

## Architecture

No framework, no bundler and no runtime dependencies — jsdom, used only by the tests, is the single devDependency. Plain ES modules, split by responsibility so the domain logic can be tested in Node without a browser:

```text
index.html          markup and element hooks
styles.css          design tokens and components
src/
  config.js         endpoints, thresholds, timings
  strings.js        every user-facing string (Spanish)
  format.js         number parsing and formatting
  calculator.js     pure domain logic — conversion, overcharge, verdicts
  storage.js        forgiving localStorage wrapper
  rates.js          API client and snapshot cache
  ui.js             all DOM rendering, including the SVG gauge
  main.js           state, event wiring, refresh cycle
tests/
  calculator.test.js       pure logic
  format.test.js           parsing and formatting
  dom/                     the real app booted in jsdom
    conversion.test.js
    overcharge.test.js
    cold-start.test.js
    implied-rate.test.js
    restored-state.test.js
```

The dependency flow runs one way: `main` orchestrates, `ui` only draws, `calculator` and `format` know nothing about the DOM, the network or the clock. That is what makes the unit tests possible with no test framework at all. The DOM suites sit on top, booting the real `main.js` against the real `index.html` so the wiring is covered too — 84 tests in all.

### Where the rates come from

[`ve.dolarapi.com`](https://dolarapi.com), which republishes the [BCV](https://www.bcv.org.ve/)'s official figures alongside the parallel-market average.

The BCV's own site cannot be read from a browser: its TLS chain is incomplete and it sends no CORS headers, so a `fetch()` fails before reading a byte. Consuming it directly would require a backend, which this project deliberately does without. See `RATE-2` in the [specification](SPEC.md).

## Engineering notes

Things a reader might want to know without reading the diff:

- **The specification is the source of truth.** [`SPEC.md`](SPEC.md) carries numbered requirements (`CALC-2`, `RATE-6`, `UI-9`…), and every commit that changes behaviour names the one it touches. It was written retroactively over a working prototype, which is what exposed the three defects listed in its §8 — lenient number parsing, a gauge with no text alternative, and reconnection ignoring the refresh switch.
- **Colour never appears in JavaScript.** The renderer writes a *tone* — `good`, `warn`, `bad`, `critical`, `bargain` — and one block of CSS decides what a tone looks like. That is the whole reason a second theme cost nothing but variables.
- **The light palette is opaque on purpose.** Glassmorphism needs something behind it to be worth blurring. Over a near-white page it produces panels with no edge, which is how the default theme arrived unreadable; light now draws its surfaces and borders solid, and the blur lives behind a `--surface-blur` token that only the dark palette sets.
- **The domain layer knows nothing about the browser.** `calculator.js` and `format.js` are unaware of the DOM, the network and the clock, so they are tested in plain Node with no framework and no shim.
- **Every gap is written down.** §8 of the specification records what is knowingly unfinished, each with a proposal. Identifiers are stable: a gap that gets closed stays listed as closed rather than being renumbered away.

## Getting started

Requires Node 20+ and [pnpm](https://pnpm.io) 10+. The version is pinned in `packageManager`, so Corepack picks it up on its own:

```bash
corepack enable
pnpm install         # jsdom, for the tests — the app itself ships nothing
```

ES modules are served over HTTP, so opening the file directly will not work. Any static server does:

```bash
pnpm dev             # pnpm dlx serve .
# or, with nothing installed at all
python -m http.server 8000
```

Then open the address it prints.

### Tests

```bash
pnpm test            # node --test — 84 tests, no test framework
pnpm test:watch
```

Unit tests run in plain Node. The DOM suites boot the real `index.html` in
jsdom, one application instance per file.

### Deploying

A static site with no build step: publish the folder as it stands. The live
demo runs on [Vercel](https://vercel.com), which needs no configuration —
point it at the repository and it serves the root. GitHub Pages, Netlify or any
static host work the same way.

## Contributing

Behaviour changes are written into [`SPEC.md`](SPEC.md) before the code, and the commit names the requirement it touches.

Work happens on short-lived branches off `main` — `feat/*`, `fix/*`, `refactor/*`, `docs/*`, `test/*`, `ci/*` — one pull request each, commits kept atomic, Conventional Commits throughout. CI runs the suite on Node 20 and 24 for every pull request.

## Licence

MIT. See [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://www.instagram.com/asisstyp">@asisstyp</a> ·
  <a href="https://github.com/DhanaCorredor">GitHub</a>
</p>

<p align="center"><sub>A reference tool, not financial advice. Always check before you pay.</sub></p>
