const DEFAULT_COLOR = "446CCF";
const STORAGE_KEY = "savedColorStash";
const THEME_KEY = "colorStashTheme";
// Four tints, the color itself, four shades, expressed as a mix toward white
// (positive) or black (negative). Shades go deeper than tints because mixing
// toward black darkens perceptually faster than mixing toward white lightens.
// Absolute HSL lightness stops only ever produced tints for dark colors.
const RAMP_MIXES = [0.8, 0.6, 0.4, 0.2, 0, -0.15, -0.3, -0.5, -0.7];
const WHITE_HEX = "FFFFFF";
const BLACK_HEX = "000000";
const HARMONIES = [
  { label: "Comp", offset: 180 },
  { label: "Triad", offset: 120 },
  { label: "Triad", offset: 240 },
  { label: "Analog", offset: -30 },
  { label: "Analog", offset: 30 },
];
const THEME_COLORS = {
  dark: "#0c0c0d",
  light: "#f0f0f4",
};

const savedColorsEl = document.getElementById("savedColors");
const preview = document.getElementById("preview");
const previewSwatch = document.getElementById("previewSwatch");
const previewSwatchMeta = document.querySelector(".preview-swatch-meta");
const colorInput = document.getElementById("colorInput");
const colorPickerInput = document.getElementById("colorPickerInput");
const activeHexLabel = document.getElementById("activeHexLabel");
const activeRgbLabel = document.getElementById("activeRgbLabel");
const activeHslLabel = document.getElementById("activeHslLabel");
const statusMessage = document.getElementById("statusMessage");
const stashCount = document.getElementById("stashCount");
const saveColorButton = document.getElementById("saveColorButton");
const copyColorButton = document.getElementById("copyColorButton");
const randomColorButton = document.getElementById("randomColorButton");
const clearColorsButton = document.getElementById("clearColorsButton");
const shareColorsButton = document.getElementById("shareColorsButton");
const exportColorsButton = document.getElementById("exportColorsButton");
const importColorsButton = document.getElementById("importColorsButton");
const importFileInput = document.getElementById("importFileInput");
const eyeDropperButton = document.getElementById("eyeDropperButton");
const contrastRow = document.getElementById("contrastRow");
const shadesRow = document.getElementById("shadesRow");
const harmonyRow = document.getElementById("harmonyRow");
const themeToggleButton = document.getElementById("themeToggleButton");
const themeToggleIcon = document.getElementById("themeToggleIcon");
const liveThemeButton = document.getElementById("liveThemeButton");
const colorCardTemplate = document.getElementById("colorCardTemplate");
const toastContainer = document.getElementById("toastContainer");
const themeMeta = document.querySelector('meta[name="theme-color"]');

const LIVE_THEME_KEY = "colorStashLiveTheme";
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

let savedColorStash = loadColorStash();
let themePreference = loadThemePreference();
let liveTheme = loadLiveTheme();
let draggedHex = null;

// The whole cross-file contract, in one place. Feature files reference
// `ColorStash.x` at the call site instead of reaching for bare globals, so
// renaming anything below shows up as exactly one undefined reference instead
// of a silent breakage inside hexle.js the first time somebody clicks an
// option. Note that this must stay a property access: destructuring it into a
// bare name throws, because classic scripts share one global scope.
window.ColorStash = {
  // color maths (color.js), used by the export pack and Hexle
  sanitizeHex, isValidHex, normalizeHex, formatHex,
  hexToRgbString, hexToRgbaString, mixHex,
  hexToHsl, hexToHslString, hslToHex,
  relativeLuminance, contrastRatio, gradeForRatio,
  hexToOklab, hexToOklch, oklchToHexClamped, luminanceToHex,
  compositeOver, ensureContrast,
  // stash plumbing
  toStashEntry, mergeStashEntries, slugify, paletteSlugs,
  persistColorStash, renderSavedColors, addSavedColor,
  // ui
  applyColor, showToast, setStatus,
  toggleLiveTheme,
  // live stash reference; read via ColorStash.stash
  get stash() { return savedColorStash; },
  replaceStash(next) { savedColorStash = next; },
};

init();
registerServiceWorker();

function registerServiceWorker() {
  // Needs a secure context (https or localhost), silently skipped on file://.
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Registration failure is non-fatal, the app still works online.
    });
  });
}

function init() {
  applyTheme(getResolvedTheme(), false);
  applyLiveTheme();

  colorInput.value = DEFAULT_COLOR;
  colorPickerInput.value = formatHex(DEFAULT_COLOR).toLowerCase();
  colorInput.addEventListener("input", handleInput);
  colorInput.addEventListener("keydown", handleInputKeydown);
  colorPickerInput.addEventListener("input", handleColorPickerInput);
  activeRgbLabel.addEventListener("click", copyActiveRgb);
  activeRgbLabel.addEventListener("keydown", handleCopyableKeydown);
  if (activeHslLabel) {
    activeHslLabel.addEventListener("click", copyActiveHsl);
    activeHslLabel.addEventListener("keydown", handleCopyableKeydown);
  }
  saveColorButton.addEventListener("click", saveCurrentColor);
  copyColorButton.addEventListener("click", copyCurrentColor);
  randomColorButton.addEventListener("click", applyRandomColor);
  clearColorsButton.addEventListener("click", clearAllColors);
  shareColorsButton.addEventListener("click", sharePalette);
  exportColorsButton.addEventListener("click", exportPalette);
  importColorsButton.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", handleImportFile);
  themeToggleButton.addEventListener("click", cycleThemePreference);
  liveThemeButton.addEventListener("click", toggleLiveTheme);
  systemThemeQuery.addEventListener("change", handleSystemThemeChange);
  document.addEventListener("keydown", handleGlobalKeydown);

  setupEyeDropper();

  const startColor = importPaletteFromHash() || DEFAULT_COLOR;
  renderSavedColors();
  colorInput.value = startColor;
  applyColor(startColor);
  colorInput.focus();
}

function handleInput(event) {
  const sanitized = sanitizeHex(event.target.value);
  event.target.value = sanitized;

  if (isValidHex(sanitized)) {
    applyColor(sanitized, false);
    setStatus("Valid color.");
    return;
  }

  // Incomplete input: show what was typed, but leave the preview, the picker and
  // every derived panel on the last valid color. Committing the padded value
  // used to flip the whole app's accent through greys on every keystroke, and
  // left the contrast badges and shade strip describing a different color than
  // the headline hex.
  activeHexLabel.textContent = `#${sanitized}`;
  activeRgbLabel.textContent = "…";
  if (activeHslLabel) activeHslLabel.textContent = "…";

  if (!sanitized) {
    setStatus("Enter a 3 or 6 digit hex color.");
  } else {
    setStatus("Keep going, hex colors use 3 or 6 characters.", "error");
  }
}

function handleColorPickerInput(event) {
  const pickedColor = sanitizeHex(event.target.value);
  colorInput.value = pickedColor;
  applyColor(pickedColor, false);
  setStatus("Color picked.");
}

function handleInputKeydown(event) {
  if (event.key === "Enter") {
    saveCurrentColor();
  }
}

// Matches any open dialog regardless of which feature owns it, so new dialogs
// inherit the shortcut guard for free.
function isDialogOpen() {
  const modal = document.getElementById("hexleModal");
  return !!document.querySelector('[role="dialog"]:not([hidden])') || (modal && modal.open);
}

function handleGlobalKeydown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  // Single-key shortcuts must not reach through an open dialog. Hexle is a
  // full-screen overlay, so S/C/R would save or copy the color behind it.
  if (isDialogOpen()) return;

  // Don't hijack typing in fields (the hex input accepts "c", etc.).
  const target = event.target;
  if (target instanceof HTMLElement && (target.closest("input, textarea, select") || target.isContentEditable)) {
    return;
  }

  // Arrow keys move focus between saved-color swatches when one is focused.
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const swatch = target instanceof HTMLElement ? target.closest(".saved-color-swatch") : null;
    if (!swatch) return;
    event.preventDefault();
    const swatches = [...savedColorsEl.querySelectorAll(".saved-color-swatch")];
    const next = swatches[swatches.indexOf(swatch) + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) next.focus();
    return;
  }

  switch (event.key.toLowerCase()) {
    case "s":
      event.preventDefault();
      saveCurrentColor();
      break;
    case "c":
      event.preventDefault();
      copyCurrentColor();
      break;
    case "r":
      event.preventDefault();
      applyRandomColor();
      break;
  }
}

// Adds to the top of the stash without re-rendering. A full render on every save
// destroyed focus if you were typing a name into another card, and re-played the
// entry animation on every existing card.
function addSavedColor(entry) {
  savedColorStash.unshift(entry);
  persistColorStash();

  const emptyState = savedColorsEl.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  savedColorsEl.insertBefore(createColorCard(entry), savedColorsEl.firstChild);
  updateStashCount();
}

function saveCurrentColor() {
  const color = sanitizeHex(colorInput.value);

  if (!isValidHex(color)) {
    showToast("That color is incomplete. Use 3 or 6 hex digits.", "error");
    setStatus("That color is incomplete. Use 3 or 6 hex digits.", "error");
    return;
  }

  const normalized = normalizeHex(color);
  if (savedColorStash.some((entry) => entry.hex === normalized)) {
    showToast(`${formatHex(normalized)} is already in your stash.`, "error");
    setStatus(`${formatHex(normalized)} is already in your stash.`, "error");
    return;
  }

  addSavedColor({ hex: normalized, name: "" });
  applyColor(normalized);
  showToast(`${formatHex(normalized)} added to your stash.`, "success");
  setStatus(`${formatHex(normalized)} added to your stash.`, "success");
}

async function copyCurrentColor() {
  if (!isValidHex(colorInput.value)) {
    showToast("Choose a valid color before copying it.", "error");
    setStatus("Choose a valid color before copying it.", "error");
    return;
  }

  await copyText(formatHex(normalizeHex(colorInput.value)));
}

async function copyActiveRgb() {
  if (!isValidHex(colorInput.value)) return;
  await copyText(hexToRgbString(colorInput.value));
}

async function copyActiveHsl() {
  if (!isValidHex(colorInput.value)) return;
  await copyText(hexToHslString(colorInput.value));
}

function handleCopyableKeydown(event) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.currentTarget.click();
  }
}

function applyRandomColor() {
  const randomColor = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")
    .toUpperCase();

  colorInput.value = randomColor;
  applyColor(randomColor);
  setStatus("Random color.");
}

function clearAllColors() {
  if (!savedColorStash.length) {
    showToast("Your stash is already empty.");
    setStatus("Your stash is already empty.");
    return;
  }

  const snapshot = savedColorStash;
  savedColorStash = [];
  persistColorStash();
  renderSavedColors();

  showToast("All saved colors removed.", "success", {
    label: "Undo",
    onClick: () => {
      savedColorStash = snapshot;
      persistColorStash();
      renderSavedColors();
      showToast("Colors restored.", "success");
      setStatus("Colors restored.", "success");
    },
  });
  setStatus("All saved colors removed.", "success");
}

function cycleThemePreference() {
  if (themePreference === "system") {
    themePreference = getSystemTheme() === "dark" ? "light" : "dark";
  } else if (themePreference === "dark") {
    themePreference = "light";
  } else {
    themePreference = "system";
  }

  persistThemePreference();
  applyTheme(getResolvedTheme(), true);
}

function handleSystemThemeChange() {
  if (themePreference === "system") {
    applyTheme(getResolvedTheme(), false);
  }
}

function applyTheme(theme, announceChange) {
  document.documentElement.dataset.theme = theme;

  if (themeMeta) {
    themeMeta.setAttribute("content", THEME_COLORS[theme]);
  }

  updateThemeToggle(theme);

  if (announceChange) {
    const label = themePreference === "system" ? `Auto (${capitalize(theme)})` : capitalize(theme);
    showToast(`Theme: ${label}`, "success");
    setStatus(`Theme set to ${label}.`, "success");
  }
}

function updateThemeToggle(theme) {
  const modeLabel = themePreference === "system" ? `Auto (${capitalize(theme)})` : capitalize(theme);
  const iconName = themePreference === "system"
    ? "contrast"
    : theme === "dark" ? "moon" : "sun";

  themeToggleIcon.querySelector("use").setAttribute("href", `#i-${iconName}`);
  themeToggleButton.setAttribute("aria-label", `Theme: ${modeLabel}. Click to switch.`);
  themeToggleButton.setAttribute("title", `Theme: ${modeLabel}`);
}

function getResolvedTheme() {
  return themePreference === "system" ? getSystemTheme() : themePreference;
}

function getSystemTheme() {
  return systemThemeQuery.matches ? "dark" : "light";
}

// Storage can throw outright when blocked (embedded webviews, aggressive privacy
// settings). This runs at module scope, before init(), so an unguarded throw here
// would leave the page blank. The theme still applies; only persistence is lost.
function loadThemePreference() {
  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    return savedTheme === "dark" || savedTheme === "light" ? savedTheme : "system";
  } catch {
    return "system";
  }
}

function loadLiveTheme() {
  try {
    return localStorage.getItem(LIVE_THEME_KEY) === "true";
  } catch {
    return false;
  }
}

function persistLiveTheme() {
  try {
    localStorage.setItem(LIVE_THEME_KEY, liveTheme ? "true" : "false");
  } catch {
    // Non-fatal, the mode applies for this session either way.
  }
}

// The palette has no color of its own until the user picks one. This lets the
// whole chrome adopt whatever is currently selected, which is the moment a color
// tool stops being a lookup table. It only re-points tokens, no component needs
// to know about it.
function toggleLiveTheme() {
  liveTheme = !liveTheme;
  persistLiveTheme();
  applyLiveTheme();
  const label = liveTheme ? "Live theme on" : "Live theme off";
  showToast(`${label}.`, "success");
  setStatus(`${label}.`, "success");
}

function applyLiveTheme() {
  document.documentElement.dataset.liveTheme = liveTheme ? "on" : "off";
  liveThemeButton.setAttribute("aria-pressed", liveTheme ? "true" : "false");
}

function persistThemePreference() {
  try {
    if (themePreference === "system") {
      localStorage.removeItem(THEME_KEY);
      return;
    }
    localStorage.setItem(THEME_KEY, themePreference);
  } catch {
    // Non-fatal, the theme applies for this session either way.
  }
}

function renderSavedColors() {
  savedColorsEl.innerHTML = "";

  if (!savedColorStash.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.innerHTML = `<svg class="icon empty-state-icon" aria-hidden="true"><use href="#i-palette"></use></svg>No saved colors yet.`;
    savedColorsEl.appendChild(emptyState);
    updateStashCount();
    return;
  }

  const fragment = document.createDocumentFragment();
  savedColorStash.forEach((entry) => {
    fragment.appendChild(createColorCard(entry));
  });

  savedColorsEl.appendChild(fragment);
  updateStashCount();
}

function createColorCard(entry) {
  const hex = entry.hex;
  const card = colorCardTemplate.content.firstElementChild.cloneNode(true);
  const swatchButton = card.querySelector(".saved-color-swatch");
  const nameInput = card.querySelector(".saved-color-name");
  const hexLabel = card.querySelector(".saved-color-hex");
  const rgbLabel = card.querySelector(".saved-color-rgb");
  const hslLabel = card.querySelector(".saved-color-hsl");
  const copyButton = card.querySelector(".copy-button");
  const deleteButton = card.querySelector(".delete-button");

  swatchButton.style.backgroundColor = formatHex(hex);
  swatchButton.setAttribute("aria-label", `Use ${formatHex(hex)}`);
  hexLabel.textContent = formatHex(hex);
  rgbLabel.textContent = hexToRgbString(hex);
  if (hslLabel) hslLabel.textContent = hexToHslString(hex);
  card.dataset.color = hex;

  if (nameInput) {
    nameInput.value = entry.name || "";
    nameInput.setAttribute("aria-label", `Name for ${formatHex(hex)}`);
    nameInput.addEventListener("change", () => renameSavedColor(hex, nameInput.value));
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") nameInput.blur();
    });
  }

  const glow = hexToRgbaString(hex, 0.25);
  card.style.setProperty("--card-color", formatHex(hex));
  card.style.setProperty("--card-glow", glow);

  swatchButton.addEventListener("click", () => {
    colorInput.value = hex;
    applyColor(hex);
    setStatus(`${formatHex(hex)} loaded.`);
  });

  hexLabel.addEventListener("click", () => copyText(formatHex(hex)));
  hexLabel.addEventListener("keydown", handleCopyableKeydown);
  rgbLabel.addEventListener("click", () => copyText(hexToRgbString(hex)));
  rgbLabel.addEventListener("keydown", handleCopyableKeydown);
  if (hslLabel) {
    hslLabel.addEventListener("click", () => copyText(hexToHslString(hex)));
    hslLabel.addEventListener("keydown", handleCopyableKeydown);
  }

  copyButton.addEventListener("click", async () => {
    await copyText(formatHex(hex));
  });

  deleteButton.addEventListener("click", () => {
    deleteSavedColor(hex, card);
  });

  card.addEventListener("dragstart", (event) => {
    // Don't start a reorder drag from the name field or the copy/delete buttons.
    if (event.target.closest("input, .card-button")) {
      event.preventDefault();
      return;
    }
    draggedHex = hex;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", hex);
  });

  card.addEventListener("dragover", (event) => {
    if (!draggedHex || draggedHex === hex) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = card.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    card.classList.toggle("drag-after", after);
    card.classList.toggle("drag-before", !after);
  });

  card.addEventListener("dragleave", () => {
    card.classList.remove("drag-before", "drag-after");
  });

  card.addEventListener("drop", (event) => {
    if (!draggedHex || draggedHex === hex) return;
    event.preventDefault();
    const insertAfter = card.classList.contains("drag-after");
    card.classList.remove("drag-before", "drag-after");
    reorderSavedColor(draggedHex, hex, insertAfter);
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    savedColorsEl.querySelectorAll(".drag-before, .drag-after")
      .forEach((el) => el.classList.remove("drag-before", "drag-after"));
    draggedHex = null;
  });

  return card;
}

function reorderSavedColor(fromHex, toHex, insertAfter) {
  if (!fromHex || fromHex === toHex) return;

  const fromIndex = savedColorStash.findIndex((entry) => entry.hex === fromHex);
  if (fromIndex < 0) return;

  const [moved] = savedColorStash.splice(fromIndex, 1);
  let toIndex = savedColorStash.findIndex((entry) => entry.hex === toHex);
  if (toIndex < 0) {
    savedColorStash.splice(fromIndex, 0, moved); // target vanished, undo the removal
    return;
  }
  if (insertAfter) toIndex += 1;

  savedColorStash.splice(toIndex, 0, moved);
  persistColorStash();
  renderSavedColors();
  setStatus(`Reordered ${formatHex(fromHex)}.`);
}

function renameSavedColor(hex, name) {
  const entry = savedColorStash.find((c) => c.hex === hex);
  if (!entry) return;
  const trimmed = name.trim();
  if (entry.name === trimmed) return;
  entry.name = trimmed;
  persistColorStash();
  setStatus(trimmed ? `Named ${formatHex(hex)} “${trimmed}”.` : `Cleared the name for ${formatHex(hex)}.`);
}

function deleteSavedColor(hex, cardEl) {
  // Mutate + persist synchronously so rapid deletes never race on the animation callback.
  savedColorStash = savedColorStash.filter((c) => c.hex !== hex);
  persistColorStash();
  updateStashCount();

  if (cardEl && cardEl.isConnected) {
    cardEl.style.animation = "cardOut 180ms cubic-bezier(0.4, 0, 0.2, 1) both";
    cardEl.addEventListener("animationend", () => {
      cardEl.remove();
      if (!savedColorStash.length) renderSavedColors();
    }, { once: true });
  } else {
    renderSavedColors();
  }

  showToast(`${formatHex(hex)} removed.`, "success");
  setStatus(`${formatHex(hex)} removed from your stash.`, "success");
}

function applyColor(color, syncInput = true) {
  const normalized = normalizeHex(color);

  if (syncInput) {
    colorInput.value = normalized;
  }

  updatePreviewDisplay(normalized);
}

// Only ever called for a valid, normalized color. This used to take an isValid
// flag so half-typed input could repaint the preview; that made the panel
// describe two different colors at once. Partial input now leaves it alone.
function updatePreviewDisplay(color) {
  const formattedColor = `#${color}`;
  preview.style.backgroundColor = formattedColor;
  colorPickerInput.value = formattedColor.toLowerCase();
  activeHexLabel.textContent = formattedColor;

  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const glowAlpha = 0.28;
  document.documentElement.style.setProperty("--current-color", formattedColor);
  document.documentElement.style.setProperty("--current-color-glow", `rgba(${r},${g},${b},${glowAlpha})`);

  activeRgbLabel.textContent = hexToRgbString(color);
  if (activeHslLabel) activeHslLabel.textContent = hexToHslString(color);
  updateContrast(color);
  updateCardContrast(color);
  renderShades(color);
  renderHarmonies(color);
}

// The preview card floats on a translucent overlay above the current color, so
// its backdrop is whatever the user happens to have picked. A fixed text color
// cannot be contrast-guaranteed against that range. Measured 1.6:1 for a dim
// grey on a white current color, and no overlay alpha fixes it without killing
// the glass. So the card's text colors are derived per color instead: keep the
// hue, move only the lightness, until it clears 4.5:1 against the real backdrop.
function updateCardContrast(color) {
  const styles = getComputedStyle(previewSwatchMeta);
  const overlay = parseRgba(styles.getPropertyValue("--overlay"));
  // The overlay goes *on top of* the color, so it is the foreground here.
  const overlayHex = [overlay.r, overlay.g, overlay.b]
    .map((v) => Math.round(v).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const backdrop = compositeOver(overlayHex, overlay.a, color);

  const bgLum = relativeLuminance(backdrop);
  const onDark = bgLum < 0.18;
  // 4.55 rather than 4.50: the derived value is quantised to 8 bits per channel,
  // and rounding can shave ~0.02 off the achieved ratio.
  const FLOOR = 4.55;
  const required = onDark
    ? Math.min(1, FLOOR * (bgLum + 0.05) - 0.05)
    : Math.max(0, (bgLum + 0.05) / FLOOR - 0.05);

  previewSwatchMeta.style.setProperty("--card-fg", luminanceToHex(onDark ? 1 : 0));
  // Secondary text sits exactly at the contrast floor, the primary gets the full
  // range. On a mid-tone backdrop the floor and the range nearly meet, so the two
  // converge rather than the secondary failing silently.
  previewSwatchMeta.style.setProperty("--card-fg-muted", luminanceToHex(required));
  previewSwatchMeta.style.setProperty(
    "--card-success",
    ensureContrast(styles.getPropertyValue("--color-success").trim() || "#4ade80", backdrop, FLOOR)
  );
  previewSwatchMeta.style.setProperty(
    "--card-error",
    ensureContrast(styles.getPropertyValue("--color-error").trim() || "#f87171", backdrop, FLOOR)
  );
}

function parseRgba(value) {
  const parts = String(value).match(/[\d.]+/g).map(Number);
  return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts[3] === undefined ? 1 : parts[3] };
}

function updateStashCount() {
  const total = savedColorStash.length;
  stashCount.textContent = `${total} color${total === 1 ? "" : "s"}`;
}

function loadColorStash() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return parsed.map(toStashEntry).filter(Boolean);
  } catch {
    return [];
  }
}

// Accepts the legacy string format ("446CCF") and the current object format ({hex, name}).
// Prepends new colors (newest-first), dedupes by hex, and fills empty names from imports.
// Returns how many colors were newly added.
function persistColorStash() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedColorStash));
  } catch {
    showToast("Couldn't save: browser storage is full or blocked.", "error");
    setStatus("Couldn't save to browser storage.", "error");
  }
}

/* ── Contrast (WCAG) ─────────────────────────── */

function updateContrast(color) {
  const lum = relativeLuminance(color);
  const versusLuminance = [1, 0]; // badge order: white, black
  contrastRow.querySelectorAll(".contrast-badge").forEach((badge, index) => {
    const ratio = contrastRatio(lum, versusLuminance[index]);
    const grade = gradeForRatio(ratio);
    badge.querySelector(".contrast-ratio").textContent = `${ratio.toFixed(2)}:1`;
    const gradeEl = badge.querySelector(".contrast-grade");
    gradeEl.textContent = grade.label;
    gradeEl.classList.remove("pass", "fail");
    if (grade.tone) gradeEl.classList.add(grade.tone);
  });
}

/* ── Shades & tints ──────────────────────────── */

// mixHex lives in color.js, it is pure and tested there.

function renderShades(color) {
  const currentHex = normalizeHex(color);
  const fragment = document.createDocumentFragment();
  let previous = null;

  RAMP_MIXES.forEach((amount) => {
    const shade = amount === 0
      ? currentHex
      : mixHex(currentHex, amount > 0 ? WHITE_HEX : BLACK_HEX, Math.abs(amount));

    // Collapse identical steps so an extreme like #FFFFFF doesn't render as a
    // row of the same swatch.
    if (shade === previous) return;
    previous = shade;

    const label = amount === 0
      ? "Base"
      : `${amount > 0 ? "Tint" : "Shade"} ${Math.round(Math.abs(amount) * 100)}%`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "shade-swatch";
    button.style.backgroundColor = `#${shade}`;
    button.title = `${label} · #${shade}`;
    button.setAttribute("aria-label", `${label} #${shade}`);
    if (shade === currentHex) button.classList.add("is-current");
    button.addEventListener("click", () => {
      colorInput.value = shade;
      applyColor(shade);
      setStatus(`${label} applied.`);
    });
    fragment.appendChild(button);
  });

  shadesRow.replaceChildren(fragment);
}

/* ── Harmonies ───────────────────────────────── */

function renderHarmonies(color) {
  const { h, s, l } = hexToHsl(color);
  const fragment = document.createDocumentFragment();

  HARMONIES.forEach(({ label, offset }) => {
    const harmony = hslToHex(h + offset, s, l);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "harmony-swatch";
    button.title = `${label} · #${harmony}`;
    button.setAttribute("aria-label", `Use ${label} harmony #${harmony}`);

    const chip = document.createElement("span");
    chip.className = "harmony-chip";
    chip.style.backgroundColor = `#${harmony}`;

    const caption = document.createElement("span");
    caption.className = "harmony-label";
    caption.textContent = label;

    button.append(chip, caption);
    button.addEventListener("click", () => {
      colorInput.value = harmony;
      applyColor(harmony);
      setStatus(`${label} harmony applied.`);
    });
    fragment.appendChild(button);
  });

  harmonyRow.replaceChildren(fragment);
}

/* ── EyeDropper ──────────────────────────────── */

function setupEyeDropper() {
  if (typeof window.EyeDropper !== "function") return;

  eyeDropperButton.hidden = false;
  eyeDropperButton.addEventListener("click", async () => {
    try {
      const result = await new window.EyeDropper().open();
      const picked = sanitizeHex(result.sRGBHex);
      colorInput.value = picked;
      applyColor(picked);
      setStatus("Color picked from screen.");
    } catch {
      // User dismissed the eyedropper, nothing to do.
    }
  });
}

/* ── Palette sharing (URL hash) ──────────────── */

async function sharePalette() {
  if (!savedColorStash.length) {
    showToast("Save some colors first, then share them.");
    setStatus("Save some colors first, then share them.");
    return;
  }

  // Names go in the link: they are the part that makes a palette a palette rather
  // than a list of hex codes. Each part is encoded separately so commas and tildes
  // inside a name cannot break the split.
  const url = new URL(window.location.href);
  url.hash = savedColorStash
    .map((entry) => `${entry.hex}~${encodeURIComponent(entry.name || "")}`)
    .join(",");
  window.history.replaceState(null, "", url.toString());

  try {
    await navigator.clipboard.writeText(url.toString());
    showToast(`Share link copied: ${savedColorStash.length} colors.`, "success");
    setStatus("Shareable link copied to your clipboard.", "success");
  } catch {
    showToast("Link is in the address bar, copy it manually.", "error");
    setStatus("Couldn't copy automatically; the link is in the address bar.", "error");
  }
}

function importPaletteFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;

  const incoming = hash.split(",").map((part) => {
    const tilde = part.indexOf("~");
    const rawHex = tilde === -1 ? part : part.slice(0, tilde);
    const rawName = tilde === -1 ? "" : part.slice(tilde + 1);
    let hex;
    let name;
    try {
      hex = decodeURIComponent(rawHex);
      name = decodeURIComponent(rawName);
    } catch {
      return null; // malformed percent-encoding, skip rather than throw
    }
    return toStashEntry({ hex, name });
  }).filter(Boolean);

  // Always clear the hash so a refresh doesn't re-import the same palette.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  if (!incoming.length) return null;

  const merged = mergeStashEntries(savedColorStash, incoming);
  savedColorStash = merged.entries;
  persistColorStash();
  const label = `Imported ${merged.added} shared color${merged.added === 1 ? "" : "s"}.`;
  showToast(label, "success");
  setStatus(label, "success");
  return incoming[0].hex;
}

/* ── Export / import (JSON file) ─────────────── */

function exportPalette() {
  if (!savedColorStash.length) {
    showToast("Save some colors first, then export them.");
    setStatus("Save some colors first, then export them.");
    return;
  }

  const payload = {
    generator: "Color Stash",
    colors: savedColorStash.map((entry) => ({ hex: `#${entry.hex}`, name: entry.name })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "color-stash.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast(`Exported ${savedColorStash.length} colors.`, "success");
  setStatus(`Exported ${savedColorStash.length} colors to a file.`, "success");
}

// sRGB hex → OKLab (Björn Ottosson's matrices). Shared by the export pack (OKLCH).
function handleImportFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = ""; // reset so the same file can be re-imported
  if (!file) return;

  const reader = new FileReader();
  reader.onerror = () => {
    showToast("Couldn't read that file.", "error");
    setStatus("Couldn't read that file.", "error");
  };
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const list = Array.isArray(parsed) ? parsed : parsed.colors;
      if (!Array.isArray(list)) throw new Error("missing colors array");

      const incoming = list.map(toStashEntry).filter(Boolean);
      if (!incoming.length) {
        showToast("No valid colors found in that file.", "error");
        setStatus("No valid colors found in that file.", "error");
        return;
      }

      const merged = mergeStashEntries(savedColorStash, incoming);
      savedColorStash = merged.entries;
      persistColorStash();
      renderSavedColors();

      const label = `Imported ${merged.added} new color${merged.added === 1 ? "" : "s"}.`;
      showToast(label, "success");
      setStatus(label, "success");
    } catch {
      showToast("That file isn't a valid Color Stash export.", "error");
      setStatus("That file isn't a valid Color Stash export.", "error");
    }
  };
  reader.readAsText(file);
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(`${value} copied.`, "success");
    setStatus(`${value} copied to your clipboard.`, "success");
  } catch {
    showToast("Copy failed, you can copy it manually.", "error");
    setStatus("Copy failed in this browser, you can copy it manually.", "error");
  }
}

function setStatus(message, tone) {
  statusMessage.textContent = message;
  statusMessage.classList.remove("error", "success");
  if (tone) statusMessage.classList.add(tone);
}

function showToast(message, tone = "", action = null) {
  const toast = document.createElement("div");
  toast.className = `toast${tone ? ` ${tone}` : ""}`;

  // Decorative toasts stay out of the accessibility tree. A toast with an action
  // must not, or its button becomes focusable but unreachable by assistive tech.
  if (!action) toast.setAttribute("aria-hidden", "true");

  const dot = document.createElement("span");
  dot.className = "toast-dot";
  dot.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;

  toast.appendChild(dot);
  toast.appendChild(text);

  const timer = setTimeout(() => dismissToast(toast), action ? 6000 : 3000);

  if (action) {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "toast-action";
    actionButton.textContent = action.label;
    actionButton.addEventListener("click", (event) => {
      event.stopPropagation();
      clearTimeout(timer);
      action.onClick();
      dismissToast(toast);
    });
    toast.appendChild(actionButton);
  }

  toast.addEventListener("click", () => {
    clearTimeout(timer);
    dismissToast(toast);
  });

  toastContainer.appendChild(toast);
}

function dismissToast(toast) {
  toast.classList.add("dismissing");
  toast.addEventListener("animationend", () => {
    // An expiring toast must not drop focus on the floor. This only became
    // reachable when the Undo button moved outside aria-hidden.
    if (toast.contains(document.activeElement)) toastContainer.focus();
    toast.remove();
  }, { once: true });
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
