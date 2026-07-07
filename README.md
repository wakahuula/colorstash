# 🎨 Color Stash

A tiny, private color tool for prototyping. Build a personal bank of hex colors,
preview them live, and jump back to them instantly.

**Live:** [colorstash.kosta.lol](https://colorstash.kosta.lol/)

## Why

- **Lightweight & static** — plain HTML/CSS/JS, no build step, no framework.
- **Private** — no tracking, no accounts. Your palette lives in your browser's
  `localStorage` and never leaves the device.
- **Installable & offline** — a PWA with a service worker; make zero external
  network requests and works with no connection at all.
- **Deploy anywhere** — it's just files. GitHub Pages, Glitch, or any static host.

## Features

- Hex input with live validation, plus a native color picker
- Big live preview with HEX / RGB / HSL readouts (click any value to copy)
- WCAG contrast ratings (against white and black, AA / AAA)
- Shades & tints strip generated from the current color
- Color harmonies (complementary, triadic, analogous), one click to apply
- Eyedropper to pick any color on screen (where supported)
- Save, copy, and delete colors from a personal stash
- Share a palette via a link (colors encoded in the URL hash)
- Export / import your palette as a JSON file
- Random color generator
- Three-way theme toggle: system · dark · light
- Toast notifications and smooth micro-animations (respects
  `prefers-reduced-motion`)
- Fully responsive, keyboard-accessible, installable as a PWA

## Run locally

No dependencies to install. Serve the folder with any static server, e.g.:

```sh
python -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly works too.

## Project structure

```
index.html               # markup, document head, inline SVG icon sprite
manifest.json            # PWA manifest
sw.js                    # service worker (cache-first, offline)
src/css/styles.css       # all styling (custom-property theming)
src/js/main.js           # all behaviour (vanilla JS)
src/assets/fonts/        # self-hosted JetBrains Mono (woff2)
src/assets/icons/        # PWA / app icons (PNG)
```

Icons are an inline SVG sprite (from [Lucide](https://lucide.dev), ISC) and the
font is self-hosted — so the app makes **zero external network requests**.

> **Deploy note:** the service worker precaches assets under `CACHE_NAME` in
> `sw.js`. Bump that version string whenever you change any cached file, so
> returning visitors pick up the new build instead of a stale cache.

## Roadmap

Planned improvements are tracked in [`IMPROVEMENTS.md`](./IMPROVEMENTS.md)
(named colors, JSON export/import, color harmonies, drag-to-reorder, and more).

## License

See [`LICENSE.md`](./LICENSE.md).
