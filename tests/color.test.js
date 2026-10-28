// Color Stash: color maths.
//
//   node --test tests/
//
// No dependencies, no build step, no framework. Everything under test is a total
// function with no DOM access, which is why src/js/color.js exists as a separate
// file: main.js touches the document at module scope and cannot be required.
//
// Every expected value in here was produced by running the real implementation
// in a browser and reading the result, not by hand-computing it.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sanitizeHex, isValidHex, normalizeHex, formatHex,
  hexToRgbString, hexToRgbaString, mixHex,
  hexToHsl, hexToHslString, hslToHex,
  relativeLuminance, contrastRatio, gradeForRatio,
  hexToOklab, hexToOklch, oklchToHexClamped, luminanceToHex,
  compositeOver, ensureContrast,
  toStashEntry, mergeStashEntries, slugify, paletteSlugs,
} = require("../src/js/color.js");

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: got ${actual}, want ${expected} ±${tolerance}`);

test("sanitizeHex keeps only hex digits and caps at six", () => {
  assert.equal(sanitizeHex("#446CCF"), "446CCF");
  assert.equal(sanitizeHex("446ccf"), "446CCF");
  assert.equal(sanitizeHex("44 66 CF"), "4466CF");
  assert.equal(sanitizeHex("#1A1A1A1A1A1A"), "1A1A1A");
  assert.equal(sanitizeHex(""), "");
  assert.equal(sanitizeHex("zzz"), "");
  assert.equal(sanitizeHex(123), "123");
});

test("isValidHex accepts 3 and 6 digits only", () => {
  assert.equal(isValidHex("FFF"), true);
  assert.equal(isValidHex("#446CCF"), true);
  assert.equal(isValidHex("446CCF"), true);
  assert.equal(isValidHex("FF"), false);
  assert.equal(isValidHex("FFFF"), false);
  assert.equal(isValidHex("GGGGGG"), false);
  assert.equal(isValidHex(""), false);
  // Over-long input is truncated by sanitizeHex before the pattern is applied,
  // so this is true: the contract is "the first six hex digits are valid", not
  // "the string is exactly three or six characters". Every caller sanitizes
  // first, so the length can never reach here from the UI.
  assert.equal(isValidHex("FFFFFFF"), true);
  assert.equal(isValidHex("GGGGGGG"), false);
});

test("normalizeHex expands 3 digits and zero-pads short input", () => {
  assert.equal(normalizeHex("FFF"), "FFFFFF");
  assert.equal(normalizeHex("446CCF"), "446CCF");
  // Only exactly three digits expand. Four is not a valid CSS hex length, so it
  // falls through to zero padding, and isValidHex rejects it before that value
  // is ever committed as a color.
  assert.equal(normalizeHex("#1a1a"), "1A1A00");
  assert.equal(normalizeHex("4"), "400000");
  assert.equal(normalizeHex(""), "000000");
});

test("formatHex always yields a leading hash and six digits", () => {
  assert.equal(formatHex("fff"), "#FFFFFF");
  assert.equal(formatHex("446CCF"), "#446CCF");
  assert.equal(formatHex("#abc"), "#AABBCC");
});

test("hexToRgbString and hexToRgbaString", () => {
  assert.equal(hexToRgbString("446CCF"), "rgb(68, 108, 207)");
  assert.equal(hexToRgbString("FFFFFF"), "rgb(255, 255, 255)");
  assert.equal(hexToRgbString("000000"), "rgb(0, 0, 0)");
  assert.equal(hexToRgbaString("446CCF", 0.25), "rgba(68, 108, 207, 0.25)");
});

test("mixHex interpolates in byte space toward the target", () => {
  assert.equal(mixHex("000000", "FFFFFF", 1), "FFFFFF");
  assert.equal(mixHex("000000", "FFFFFF", 0), "000000");
  assert.equal(mixHex("000000", "FFFFFF", 0.5), "808080");
  assert.equal(mixHex("FFFFFF", "000000", 1), "000000");
  assert.equal(mixHex("FFFFFF", "000000", 0), "FFFFFF");
  // amount 0.8 toward white from the ramp's darkest shade of #1A1A1A
  assert.equal(mixHex("1A1A1A", "FFFFFF", 0.8), "D1D1D1");
});

test("hexToHsl on the primaries and achromatics", () => {
  const white = hexToHsl("FFFFFF");
  assert.equal(white.h, 0);
  assert.equal(white.s, 0);
  assert.equal(white.l, 1);

  const black = hexToHsl("000000");
  assert.equal(black.s, 0);
  assert.equal(black.l, 0);

  const red = hexToHsl("FF0000");
  near(red.h, 0, 1e-9, "red hue");
  near(red.s, 1, 1e-9, "red saturation");
  near(red.l, 0.5, 1e-9, "red lightness");

  const green = hexToHsl("00FF00");
  near(green.h, 120, 1e-9, "green hue");

  const blue = hexToHsl("0000FF");
  near(blue.h, 240, 1e-9, "blue hue");
});

test("hslToHex inverts hexToHsl for the primaries", () => {
  assert.equal(hslToHex(0, 1, 0.5), "FF0000");
  assert.equal(hslToHex(120, 1, 0.5), "00FF00");
  assert.equal(hslToHex(240, 1, 0.5), "0000FF");
  assert.equal(hslToHex(0, 0, 1), "FFFFFF");
  assert.equal(hslToHex(0, 0, 0), "000000");
});

test("hexToHslString rounds for display", () => {
  // 223, not 220. The old hardcoded placeholder in index.html said 220 and was
  // simply wrong. #446CCF is hue 222.73.
  assert.equal(hexToHslString("446CCF"), "hsl(223, 59%, 54%)");
  assert.equal(hexToHslString("FFFFFF"), "hsl(0, 0%, 100%)");
  assert.equal(hexToHslString("000000"), "hsl(0, 0%, 0%)");
});

test("relativeLuminance matches the WCAG reference points", () => {
  near(relativeLuminance("000000"), 0, 1e-12, "black");
  near(relativeLuminance("FFFFFF"), 1, 1e-12, "white");
  // Published reference value for mid grey.
  near(relativeLuminance("808080"), 0.2158605, 1e-6, "mid grey");
  near(relativeLuminance("446CCF"), 0.1645906, 1e-6, "the app's default blue");
});

test("contrastRatio is symmetric and reaches 21 at the extremes", () => {
  assert.equal(contrastRatio(0, 1), 21);
  assert.equal(contrastRatio(1, 0), 21);
  assert.equal(contrastRatio(0.5, 0.5), 1);
  assert.equal(contrastRatio(0.2, 0.6), contrastRatio(0.6, 0.2));
});

test("gradeForRatio maps the WCAG thresholds", () => {
  assert.deepEqual(gradeForRatio(7), { label: "AAA", tone: "pass" });
  assert.deepEqual(gradeForRatio(4.5), { label: "AA", tone: "pass" });
  assert.deepEqual(gradeForRatio(3), { label: "AA Large", tone: "" });
  assert.deepEqual(gradeForRatio(2.99), { label: "Fail", tone: "fail" });
  assert.deepEqual(gradeForRatio(21), { label: "AAA", tone: "pass" });
});

test("hexToOklab puts white and black at the documented corners", () => {
  const white = hexToOklab("FFFFFF");
  near(white.L, 1, 1e-6, "white L");
  near(white.a, 0, 1e-6, "white a");
  near(white.b, 0, 1e-6, "white b");

  const black = hexToOklab("000000");
  near(black.L, 0, 1e-6, "black L");

  // Mid grey sits near L = 0.6 in OKLab, which is the point of the space.
  near(hexToOklab("808080").L, 0.5998, 1e-3, "mid grey L");
});

test("hexToOklch gives achromatic colors zero chroma", () => {
  // Not exactly zero: the OKLab transform leaves ~4e-8 of floating-point residue
  // on pure white, so this asserts "effectively zero" rather than bit equality.
  near(hexToOklch("FFFFFF").C, 0, 1e-6, "white chroma");
  near(hexToOklch("000000").C, 0, 1e-6, "black chroma");
  near(hexToOklch("FF0000").C, 0.2576833, 1e-6, "red chroma");
});

test("toStashEntry accepts both the legacy string and the object form", () => {
  assert.deepEqual(toStashEntry("446CCF"), { hex: "446CCF", name: "" });
  assert.deepEqual(toStashEntry("#fff"), { hex: "FFFFFF", name: "" });
  assert.deepEqual(toStashEntry({ hex: "446CCF", name: "  Brand  " }), { hex: "446CCF", name: "Brand" });
  assert.deepEqual(toStashEntry({ hex: "446CCF" }), { hex: "446CCF", name: "" });
  assert.equal(toStashEntry("nope"), null);
  assert.equal(toStashEntry({}), null);
  assert.equal(toStashEntry(null), null);
});

test("mergeStashEntries prepends, dedupes and backfills names", () => {
  const existing = [{ hex: "AAAAAA", name: "Old" }];

  const added = mergeStashEntries(existing, [{ hex: "BBBBBB", name: "New" }]);
  assert.equal(added.added, 1);
  assert.deepEqual(added.entries.map((e) => e.hex), ["BBBBBB", "AAAAAA"]);

  const dupe = mergeStashEntries(existing, [{ hex: "AAAAAA", name: "ignored" }]);
  assert.equal(dupe.added, 0);
  assert.deepEqual(dupe.entries.map((e) => e.hex), ["AAAAAA"]);
  assert.equal(dupe.entries[0].name, "Old", "an existing name must win");

  const backfill = mergeStashEntries([{ hex: "CCCCCC", name: "" }], [{ hex: "CCCCCC", name: "Filled" }]);
  assert.equal(backfill.added, 0);
  assert.equal(backfill.entries[0].name, "Filled", "an empty name gets filled from the import");

  const empty = mergeStashEntries([], []);
  assert.deepEqual(empty.entries, []);
  assert.equal(empty.added, 0);
});

// ── Adaptive contrast helpers (added with the translucent preview card) ──

test("oklchToHexClamped inverts hexToOklch", () => {
  // Round-trip is the strongest check available: if the inverse matrices or the
  // gamut search were wrong, these would not land back on the input.
  for (const hex of ["FF0000", "00FF00", "0000FF", "FFFFFF", "000000",
                     "446CCF", "808080", "1D3557", "F1FAEE", "E63946"]) {
    assert.equal(oklchToHexClamped(hexToOklch(hex)), hex, `round trip ${hex}`);
  }
});

test("oklchToHexClamped pulls chroma down instead of clipping channels", () => {
  // Far outside sRGB at this lightness: the channels would be negative or over
  // 1, so chroma has to give rather than the result clipping to a flat color.
  const wild = oklchToHexClamped({ L: 0.5, C: 0.9, H: 30 });
  // Raw six-digit channels, no hash: the inverse-transform functions all return
  // hashless hex, and callers that need a CSS value add it (ensureContrast does).
  assert.match(wild, /^[0-9A-F]{6}$/);
  const { C } = hexToOklch(wild);
  assert.ok(C < 0.9, `chroma must be reduced, got ${C}`);
  assert.ok(C > 0, "some chroma should survive");
});

test("luminanceToHex is the inverse of relativeLuminance and hash-prefixed", () => {
  // The hash matters: without it the value is not a valid CSS color and any
  // `color: var(...)` using it is silently dropped. That bug shipped once.
  assert.equal(luminanceToHex(0), "#000000");
  assert.equal(luminanceToHex(1), "#FFFFFF");
  assert.equal(luminanceToHex(0.5), "#BCBCBC");
  assert.equal(luminanceToHex(0.2158605), "#808080");
  for (const L of [0, 0.05, 0.2, 0.5, 0.8, 1]) {
    // A hex value is 8 bits per channel, so the round trip can only be as exact
    // as the nearest quantized grey. Near white one channel step moves luminance
    // by ~0.009, hence a 5e-3 tolerance rather than an exact match.
    near(relativeLuminance(luminanceToHex(L)), L, 5e-3, `round trip L=${L}`);
  }
});

test("compositeOver reproduces what the preview card actually looks like", () => {
  // These four are the real backdrops the card sees for the extremes.
  assert.equal(compositeOver("0C0C0D", 0.6, "FFFFFF"), "6D6D6E");
  assert.equal(compositeOver("0C0C0D", 0.6, "000000"), "070708");
  assert.equal(compositeOver("FFFFFF", 0.56, "446CCF"), "ADBEEA");
  assert.equal(compositeOver("0C0C0D", 0, "446CCF"), "446CCF", "zero alpha is a no-op");
});

test("ensureContrast always clears the bar it was given", () => {
  const cases = [
    ["#4ade80", "6D6D6E"], ["#f87171", "6D6D6E"],
    ["#16a34a", "FFFFFF"], ["#4ade80", "808080"],
    ["#dc2626", "FDFDFE"], ["#4ade80", "070708"],
    ["#e63946", "ADBEEA"], ["#A8DADC", "6D6D6E"],
  ];
  for (const [color, backdrop] of cases) {
    const out = ensureContrast(color, backdrop, 4.55);
    const ratio = contrastRatio(relativeLuminance(out), relativeLuminance(backdrop));
    assert.ok(ratio >= 4.5, `${out} on ${backdrop} is only ${ratio.toFixed(3)}:1`);
  }
});

test("ensureContrast leaves a color that already passes alone", () => {
  assert.equal(ensureContrast("#4ade80", "000000", 4.55), "#4ADE80");
  assert.equal(ensureContrast("#F87171", "000000", 4.55), "#F87171");
});

test("ensureContrast keeps the hue, only the lightness moves", () => {
  const before = hexToOklch("#4ade80");
  const after = hexToOklch(ensureContrast("#4ade80", "6D6D6E", 4.55));
  // Hue survives to within a degree; chroma may shrink at the gamut edge.
  near(after.H, before.H, 1, "hue preserved");
  assert.ok(after.C <= before.C, "chroma should never increase");
});

test("ensureContrast returns a hash-prefixed hex either way", () => {
  assert.match(ensureContrast("#4ade80", "6D6D6E", 4.55), /^#[0-9A-F]{6}$/);
  assert.match(ensureContrast("#4ade80", "000000", 4.55), /^#[0-9A-F]{6}$/);
});

test("slugify transliterates diacritics instead of splitting on them", () => {
  // The regression this guards: "Grün" used to become "gr-n".
  assert.equal(slugify("Grün", "color", 0), "grun");
  assert.equal(slugify("Café Crème", "color", 0), "cafe-creme");
  assert.equal(slugify("Måns", "color", 0), "mans");
  assert.equal(slugify("Ångström", "color", 0), "angstrom");
  assert.equal(slugify("Brand Blue", "color", 0), "brand-blue");
  assert.equal(slugify("  --Trimmed--  ", "color", 0), "trimmed");
  // No Latin form available: fall back rather than emit an empty slug.
  assert.equal(slugify("青", "color", 2), "color-3");
  assert.equal(slugify("", "color", 0), "color-1");
  assert.equal(slugify(null, "color", 4), "color-5");
});

test("paletteSlugs dedupes collisions by index", () => {
  const entries = [
    { hex: "AAAAAA", name: "Blue" },
    { hex: "BBBBBB", name: "Blue" },
    { hex: "CCCCCC", name: "" },
    { hex: "DDDDDD", name: "Grün" },
  ];
  assert.deepEqual(paletteSlugs(entries, "color"), ["blue", "blue-2", "color-3", "grun"]);
});