# Color Stash — Verbesserungs-Backlog

Analyse & Priorisierung (Stand 2026-07-07). Leitplanke bei **jedem** Punkt:
Die App bleibt **lightweight & statisch** — Vanilla-JS, kein Build-Step, weiterhin
als reine Dateien via GitHub Pages / Glitch deploybar.

Status-Legende: ✅ erledigt · ⬜ offen

---

## Tier 1 — Quick Wins (Minuten)

| Status | Punkt | Ort |
|--------|-------|-----|
| ✅ | Canonical-URL auf `colorstash.kosta.lol` korrigieren (zeigte auf `glitch.me`) | `index.html` |
| ✅ | `meta description` + Open-Graph/Twitter-Card-Tags ergänzen (fehlten komplett) | `index.html` |
| ✅ | Inline-SVG-Favicon (`data:`-URI) statt Fremd-Icon von `cdn.glitch.com` | `index.html` |
| ✅ | Ungültigen `apple-mobile-web-app-status-bar-style`-Wert korrigieren | `index.html` |
| ✅ | Paste-Bug: `maxlength="6"` schnitt `#446CCF` auf `#446CC` → entfernt (Kappung passiert in `sanitizeHex`) | `index.html` |
| ✅ | Toter Code entfernen: `toastQueue`, `currentColor` | `main.js` |
| ✅ | `persistColorStash` in try/catch (LocalStorage kann bei Quota/Privacy-Modus werfen) | `main.js` |
| ✅ | `@media (prefers-reduced-motion: reduce)`-Block | `styles.css` |
| ✅ | Klick auf RGB-/HSL-Label kopiert im jeweiligen Format (waren tote Anzeige) | `main.js` / `index.html` |
| ✅ | README mit Screenshot-Platzhalter, Feature-Liste, Selling Points füllen; „PWA"-Behauptung vorerst raus | `README.md` |

## Tier 2 — Mittel (je 1–3 h)

| Status | Punkt | Nutzen |
|--------|-------|--------|
| ✅ | **Delete-Refactor**: Array sofort mutieren/persistieren, nur DOM gezielt via `card.remove()` animieren statt Full-Re-Render | Fixt Delete-Race (verlorene Löschung) **und** das Neu-Einflackern aller Karten |
| ✅ | Kontrast-/WCAG-Badge in der Preview (Ratio vs. Weiß/Schwarz + AA/AAA) | Macht aus dem Merker ein Werkzeug |
| ✅ | Palette teilen via URL-Hash (`#446CCF,FF6B35,…`) + Share-Button; Import beim Laden mergt & löscht den Hash | Sozial/verlinkbar, kein Backend |
| ✅ | Shades/Tints-Leiste unter der Preview (9 klickbare Abstufungen) | „Designer-Tool"-Eindruck |
| ✅ | EyeDropper-API-Button (feature-detected, degradiert sauber) | Farbe vom Bildschirm picken |
| ✅ | Font Awesome durch Inline-SVG-Sprite (10 Lucide-Icons, ISC) ersetzen + JetBrains Mono self-hosten (1 variable woff2, 31 KB, deckt 400–800 ab) | **Null externe Requests** → wirklich lightweight, DSGVO-sauber, offline |
| ✅ | Undo-Toast für „Clear all" (6s-Snapshot, Action-Button) statt destruktivem Ein-Klick-Löschen | Datenschutz vor Fehlklick |
| ✅ | Keyboard-Shortcuts (`S`/`C`/`R`) + Hint im Intro-Panel; ignoriert Eingabe in Feldern | Power-User-Feel |
| ✅ | `execCommand`-Clipboard-Fallback entfernt (reine `navigator.clipboard`-API) | Fixt Copy-falsche-Farbe-Bug bei Stash-Karten |
| ✅ | `html { font-size: 13px }` → `81.25%` (= 13px bei 16px-Default, skaliert aber mit Nutzer-Einstellung) | a11y (Respekt vor Browser-Default) |
| ✅ | Doppelte Screenreader-Ansagen behoben: Toast-Container `aria-hidden`, `#statusMessage` (polite) ist alleinige Live-Region | a11y |
| ✅ | `↑/↓` durch den Stash navigieren (Fokus wandert zwischen den Swatches) | Power-User-Feel |

## Tier 3 — Größer (halber Tag+)

| Status | Punkt | Hinweis zur Lightweight-Constraint |
|--------|-------|-----------------------------------|
| ✅ | Echte PWA: `manifest.json` + Cache-First-Service-Worker (`sw.js`) + PNG-Icons (192/512, „any maskable" + Apple-Touch); offline verifiziert | Bleibt 100% statisch/GitHub-Pages-tauglich; **Sorgfaltspflicht**: `CACHE_NAME` in `sw.js` bei jedem Deploy hochzählen |
| ✅ | Export/Import JSON (Blob-Download + FileReader; Import validiert, mergt, dedupliziert) | Reines Blob-Download/FileReader, kein Backend |
| ✅ | Farb-Harmonien (Komplementär/Triade/Analog) als klickbare, beschriftete Chips | Vanilla-Mathe |
| ✅ | CSS-Variables-Export der Palette (`:root { --color-1: … }`, Namen als Kommentare) — kopiert in die Zwischenablage | Ergänzung zum JSON-Export |
| ✅ | Benannte Farben pro Farbe (Inline-Namensfeld je Karte); Namen in Export/Import erhalten | Datenmodell `string[]` → `{hex, name}[]`; rückwärtskompatible LocalStorage-Migration (alte Daten & Share-Links) |
| ✅ | Drag-to-reorder (native HTML5-DnD, keine Lib, Insert-Indikator) | Desktop-Feature; Touch-DnD bleibt eingeschränkt (bewusst keine Lib, um lightweight zu bleiben) |

## Design-Politur (nachträglich)

| Status | Punkt | Ort |
|--------|-------|-----|
| ✅ | Themen-adaptive Elevation-Tokens (`--shadow-panel/-float/-hover`); Light-Theme mit weichen, mehrschichtigen, kühl-neutralen Schatten statt harter schwarzer + unsichtbarer weißer Insets | `styles.css` |
| ✅ | Swatch-Rand von hartem `rgba(255,255,255,.12)` auf adaptives `var(--line)` (definiert Farbkacheln auch im Light-Theme) | `styles.css` |
| ✅ | Mobile-Fix: Toolbar-Actions als horizontale Reihe gleich großer 44px-Touch-Buttons statt vertikaler full-width Spalte | `styles.css` |
| ✅ | Mobile: Farbkarten konsistent 3-spaltig (kein Overflow bei 360/390px); Tastatur-Hinweis auf Touch (`hover:none`) ausgeblendet | `styles.css` |
| ✅ | Alle Hover-`transform`s entfernt (Theme-Switcher-Tilt, Karten-/Swatch-/Shade-/Harmony-/Picker-/EyeDropper-Bewegung); ruhiges Hover-Feedback über Rahmen + Schatten (`:active`-Press-Skalierung bleibt) | `styles.css` |

---

## Bug-Register (aus Code-Review)

| # | Ort | Problem | Status |
|---|-----|---------|--------|
| 1 | `index.html` (Input) | `maxlength="6"` bricht Paste von `#446CCF` | ✅ behoben (Quick Win) |
| 2 | `main.js` `deleteSavedColor` | Delete-Race: schnelles Doppel-Löschen verliert die zweite Löschung | ✅ behoben (Delete-Refactor) |
| 3 | `main.js` `renderSavedColors` | Full-Re-Render lässt alle Karten nach jedem Delete neu einflackern | ✅ behoben (Delete-Refactor) |
| 4 | `main.js` `copyText` Fallback | `execCommand`-Fallback kopiert falsche Farbe bei Stash-Karten, ohne `#` | ✅ behoben (Fallback entfernt) |
| 5 | `main.js` | `toastQueue` + `currentColor` toter Code | ✅ entfernt (Quick Win) |
| 6 | `styles.css` | Kein `prefers-reduced-motion` | ✅ ergänzt (Quick Win) |
| 7 | `main.js` `persistColorStash` | LocalStorage-Write ungeschützt (Quota/Privacy) | ✅ behoben (Quick Win) |
| 8 | `index.html` | Toast + Status = doppelte Screenreader-Ansagen | ✅ behoben (Toast `aria-hidden`) |
