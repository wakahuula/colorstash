// Color Stash: pure color maths.
//
// No DOM, no storage, no state. Every function here is a total function of its
// arguments, which is what makes `tests/color.test.js` possible at all: the rest
// of main.js touches the document at module scope and cannot be required.
//
// Loaded as a classic <script defer> before main.js, so the names land on the
// global object for the feature files. The module.exports tail at the bottom is
// for Node only and is a no-op in the browser.

// ── Parsing and formatting ───────────────────────

// Everything that is not a hex digit is dropped, which also strips a leading "#".
// Nothing beyond that has to be special-cased: the first replace already removed
// every character the second one used to look for.
function sanitizeHex(value) {
  return String(value).replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
}

function isValidHex(color) {
  return /^[0-9A-F]{3}([0-9A-F]{3})?$/.test(sanitizeHex(color));
}

function normalizeHex(color) {
  const sanitized = sanitizeHex(color);
  if (sanitized.length === 3) {
    return sanitized.split("").map((c) => c + c).join("");
  }
  return sanitized.padEnd(6, "0");
}

function formatHex(color) {
  return `#${normalizeHex(color)}`;
}

function hexToRgbString(color) {
  const n = normalizeHex(color);
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgbaString(color, alpha) {
  const n = normalizeHex(color);
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Byte-space mix toward `target`. Predictable and monotonic in lightness, which
// an OKLab mix would also be, at lower cost.
function mixHex(color, target, amount) {
  const from = normalizeHex(color);
  const to = normalizeHex(target);
  const channel = (i) => {
    const a = parseInt(from.slice(i, i + 2), 16);
    const b = parseInt(to.slice(i, i + 2), 16);
    return Math.round(a + (b - a) * amount).toString(16).padStart(2, "0").toUpperCase();
  };
  return [0, 2, 4].map(channel).join("");
}

// ── HSL ──────────────────────────────────────────

function hexToHsl(color) {
  const n = normalizeHex(color);
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / delta + 2) / 6;
    else h = ((r - g) / delta + 4) / 6;
  }

  return { h: h * 360, s, l };
}

function hexToHslString(color) {
  const { h, s, l } = hexToHsl(color);
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0").toUpperCase();
  return `${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ── Contrast (WCAG 2.x) ──────────────────────────

function relativeLuminance(color) {
  const n = normalizeHex(color);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(n.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(lumA, lumB) {
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function gradeForRatio(ratio) {
  if (ratio >= 7) return { label: "AAA", tone: "pass" };
  if (ratio >= 4.5) return { label: "AA", tone: "pass" };
  if (ratio >= 3) return { label: "AA Large", tone: "" };
  return { label: "Fail", tone: "fail" };
}

// ── OKLab / OKLCH (Björn Ottosson's matrices) ─────

function hexToOklab(hex) {
  const n = normalizeHex(hex);
  const [lr, lg, lb] = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function hexToOklch(hex) {
  const { L, a, b } = hexToOklab(hex);
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

// Inverse of hexToOklab. Returns channels that may fall outside [0,1] when the
// requested color is outside the sRGB gamut; oklchToHexClamped handles that.
function oklchToLinearSrgb({ L, C, H }) {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function oklchInGamut({ L, C, H }) {
  return oklchToLinearSrgb({ L, C, H }).every(
    (c) => linearToSrgb(c) >= -1e-4 && linearToSrgb(c) <= 1 + 1e-4
  );
}

// Binary search on chroma: at a given lightness and hue, some saturations simply
// do not exist in sRGB. Pulling chroma down until it fits is the only way to keep
// a hue while forcing a luminance.
function oklchToHexClamped({ L, C, H }) {
  let lo = 0;
  let hi = C;
  if (!oklchInGamut({ L, C, H })) {
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (oklchInGamut({ L, C: mid, H })) lo = mid;
      else hi = mid;
    }
    C = lo;
  }
  return oklchToLinearSrgb({ L, C, H })
    .map((c) => Math.max(0, Math.min(255, Math.round(linearToSrgb(c) * 255))))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

// Inverse of the relativeLuminance transfer, for a neutral grey. Returns a
// "#rrggbb" string: without the hash the value is not a valid CSS color and any
// `color: var(...)` referencing it is silently dropped.
function luminanceToHex(L) {
  const c = L <= 0.0031308 ? 12.92 * L : 1.055 * Math.pow(L, 1 / 2.4) - 0.055;
  const v = Math.max(0, Math.min(255, Math.round(c * 255)));
  return `#${v.toString(16).padStart(2, "0").repeat(3)}`.toUpperCase();
}

// Alpha-composite `color` over `backdrop`, both hex. Used to find out what the
// translucent preview card actually looks like once the current color is behind it.
function compositeOver(color, alpha, backdrop) {
  const fg = normalizeHex(color);
  const bg = normalizeHex(backdrop);
  const channel = (i) => {
    const a = parseInt(fg.slice(i, i + 2), 16);
    const b = parseInt(bg.slice(i, i + 2), 16);
    return Math.round(a * alpha + b * (1 - alpha));
  };
  return [0, 2, 4].map(channel)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

// Returns `color` unchanged if it already clears `ratio` against `backdrop`,
// otherwise the same hue pushed to the nearest luminance that does. This is what
// makes the translucent preview card legible without flattening the design: the
// hue is preserved, only its lightness moves.
function ensureContrast(color, backdrop, ratio) {
  const asHex = normalizeHex(color);
  const bgLum = relativeLuminance(backdrop);
  if (contrastRatio(relativeLuminance(asHex), bgLum) >= ratio) return `#${asHex}`;

  const { L: originL, C, H } = hexToOklch(asHex);

  // Solving for the lightness analytically lands a little short, because adding
  // chroma at a fixed OKLab L also moves the luminance. So scan the lightness axis
  // and keep the candidate closest to where the color started, which preserves
  // as much of the hue as the backdrop allows.
  const clears = (L) =>
    contrastRatio(relativeLuminance(oklchToHexClamped({ L, C, H })), bgLum) >= ratio;

  let bestL = null;
  let bestDistance = Infinity;
  for (let i = 0; i <= 48; i++) {
    const L = i / 48;
    if (!clears(L)) continue;
    const distance = Math.abs(L - originL);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestL = L;
    }
  }

  // Nothing clears the bar: the backdrop sits in the band where only a hue-less
  // extreme can pass. Take the pole that comes closest rather than giving up.
  if (bestL === null) bestL = bgLum > 0.5 ? 0 : 1;

  return `#${oklchToHexClamped({ L: bestL, C, H })}`;
}

// ── Stash helpers ───────────────────────────────
// Pure once the stash is passed in, so both are testable and neither reaches
// into module state.

function toStashEntry(value) {
  const raw = typeof value === "string" ? value : value && value.hex;
  if (!isValidHex(raw)) return null;
  const name = value && typeof value.name === "string" ? value.name.trim() : "";
  return { hex: normalizeHex(raw), name };
}

// Prepends new colors (newest-first), dedupes by hex, and fills empty names from
// incoming. Returns { entries, added } where `entries` is the new full stash.
function mergeStashEntries(existing, incoming) {
  const byHex = new Map(existing.map((entry) => [entry.hex, entry]));
  const fresh = [];

  incoming.forEach((entry) => {
    const hit = byHex.get(entry.hex);
    if (hit) {
      if (!hit.name && entry.name) hit.name = entry.name;
      return;
    }
    const created = { hex: entry.hex, name: entry.name };
    byHex.set(entry.hex, created);
    fresh.push(created);
  });

  return { entries: [...fresh, ...existing], added: fresh.length };
}

// Turns a color's name into a token-safe slug. Diacritics are decomposed and
// dropped rather than treated as separators, so "Grün" becomes "grun" and not
// "gr-n". Scripts without a Latin form (CJK, Cyrillic) fall back to the index
// prefix. Transliterating those would need a data table this app does not carry.
function slugify(value, prefix, index) {
  const base = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `${prefix}-${index + 1}`;
}

function paletteSlugs(entries, prefix) {
  const seen = new Set();
  return entries.map((entry, index) => {
    let slug = slugify(entry.name, prefix, index);
    if (seen.has(slug)) slug = `${slug}-${index + 1}`;
    seen.add(slug);
    return slug;
  });
}

// Node only. In the browser `module` is undefined and this whole block is dead.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    sanitizeHex, isValidHex, normalizeHex, formatHex,
    hexToRgbString, hexToRgbaString, mixHex,
    hexToHsl, hexToHslString, hslToHex,
    relativeLuminance, contrastRatio, gradeForRatio,
    hexToOklab, hexToOklch, oklchToHexClamped, luminanceToHex,
    compositeOver, ensureContrast,
    toStashEntry, mergeStashEntries, slugify, paletteSlugs,
  };
}
