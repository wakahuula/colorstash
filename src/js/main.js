const DEFAULT_COLOR = "446CCF";
const STORAGE_KEY = "savedColorStash";
const THEME_KEY = "colorStashTheme";
const SHADE_STOPS = [0.92, 0.82, 0.72, 0.6, 0.5, 0.4, 0.3, 0.2, 0.12];
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
const colorCardTemplate = document.getElementById("colorCardTemplate");
const toastContainer = document.getElementById("toastContainer");
const themeMeta = document.querySelector('meta[name="theme-color"]');

const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

let savedColorStash = loadColorStash();
let themePreference = loadThemePreference();
let draggedHex = null;

init();
registerServiceWorker();

function registerServiceWorker() {
  // Needs a secure context (https or localhost) — silently skipped on file://.
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Registration failure is non-fatal — the app still works online.
    });
  });
}

function init() {
  applyTheme(getResolvedTheme(), false);

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

  if (!sanitized) {
    setStatus("Enter a 3 or 6 digit hex color.");
    applyColor(DEFAULT_COLOR, false);
    return;
  }

  if (!isValidHex(sanitized)) {
    setStatus("Keep going — hex colors use 3 or 6 characters.", "error");
    updatePreviewDisplay(expandHexForPreview(sanitized), sanitized.toUpperCase(), false);
    activeRgbLabel.textContent = "—";
    if (activeHslLabel) activeHslLabel.textContent = "—";
    return;
  }

  applyColor(sanitized, false);
  setStatus("Ready to save this color.");
}

function handleColorPickerInput(event) {
  const pickedColor = sanitizeHex(event.target.value);
  colorInput.value = pickedColor;
  applyColor(pickedColor, false);
  setStatus("Color picked. Save it if you want to keep it.");
}

function handleInputKeydown(event) {
  if (event.key === "Enter") {
    saveCurrentColor();
  }
}

function handleGlobalKeydown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;

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

  savedColorStash.unshift({ hex: normalized, name: "" });
  persistColorStash();
  renderSavedColors();
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
  setStatus("Random color generated. Save it if you like it.");
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

function loadThemePreference() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  return savedTheme === "dark" || savedTheme === "light" ? savedTheme : "system";
}

function persistThemePreference() {
  if (themePreference === "system") {
    localStorage.removeItem(THEME_KEY);
    return;
  }
  localStorage.setItem(THEME_KEY, themePreference);
}

function renderSavedColors() {
  savedColorsEl.innerHTML = "";

  if (!savedColorStash.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.innerHTML = `<svg class="icon empty-state-icon" aria-hidden="true"><use href="#i-palette"></use></svg>No saved colors yet. Preview a shade, then save the ones worth keeping.`;
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
    setStatus(`${formatHex(hex)} loaded from your stash.`);
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
    savedColorStash.splice(fromIndex, 0, moved); // target vanished — undo the removal
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

  updatePreviewDisplay(normalized, normalized, true);
}

function updatePreviewDisplay(color, labelColor, isValid) {
  const formattedColor = `#${color}`;
  preview.style.backgroundColor = formattedColor;
  previewSwatch.style.backgroundColor = "transparent";
  colorPickerInput.value = formattedColor.toLowerCase();
  activeHexLabel.textContent = `#${labelColor}`;

  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const glowAlpha = 0.28;
  document.documentElement.style.setProperty("--current-color", formattedColor);
  document.documentElement.style.setProperty("--current-color-glow", `rgba(${r},${g},${b},${glowAlpha})`);

  if (isValid) {
    activeRgbLabel.textContent = hexToRgbString(color);
    if (activeHslLabel) activeHslLabel.textContent = hexToHslString(color);
    updateContrast(color);
    renderShades(color);
    renderHarmonies(color);
  }
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
function toStashEntry(value) {
  const raw = typeof value === "string" ? value : value && value.hex;
  if (!isValidHex(raw)) return null;
  const name = value && typeof value.name === "string" ? value.name.trim() : "";
  return { hex: normalizeHex(raw), name };
}

// Prepends new colors (newest-first), dedupes by hex, and fills empty names from imports.
// Returns how many colors were newly added.
function mergeStashEntries(incoming) {
  const byHex = new Map(savedColorStash.map((entry) => [entry.hex, entry]));
  const fresh = [];

  incoming.forEach((entry) => {
    const existing = byHex.get(entry.hex);
    if (existing) {
      if (!existing.name && entry.name) existing.name = entry.name;
      return;
    }
    const created = { hex: entry.hex, name: entry.name };
    byHex.set(entry.hex, created);
    fresh.push(created);
  });

  savedColorStash = [...fresh, ...savedColorStash];
  return fresh.length;
}

function persistColorStash() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedColorStash));
  } catch {
    showToast("Couldn't save — browser storage is full or blocked.", "error");
    setStatus("Couldn't save to browser storage.", "error");
  }
}

function sanitizeHex(value) {
  return value.replace(/[^0-9a-f]/gi, "").replace(/^#/, "").slice(0, 6).toUpperCase();
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

function expandHexForPreview(color) {
  const sanitized = sanitizeHex(color);
  if (sanitized.length >= 6) return sanitized.slice(0, 6);
  return sanitized.padEnd(6, sanitized[sanitized.length - 1] || "0");
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

/* ── Contrast (WCAG) ─────────────────────────── */

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

function renderShades(color) {
  const { h, s } = hexToHsl(color);
  const currentHex = normalizeHex(color);
  const fragment = document.createDocumentFragment();

  SHADE_STOPS.forEach((lightness) => {
    const shade = hslToHex(h, s, lightness);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shade-swatch";
    button.style.backgroundColor = `#${shade}`;
    button.title = `#${shade}`;
    button.setAttribute("aria-label", `Use #${shade}`);
    if (shade === currentHex) button.classList.add("is-current");
    button.addEventListener("click", () => {
      colorInput.value = shade;
      applyColor(shade);
      setStatus(`#${shade} loaded from shades.`);
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
      setStatus(`#${harmony} loaded from harmonies.`);
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
      setStatus("Color picked from screen. Save it if you like it.");
    } catch {
      // User dismissed the eyedropper — nothing to do.
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

  const url = new URL(window.location.href);
  url.hash = savedColorStash.map((entry) => entry.hex).join(",");
  window.history.replaceState(null, "", url.toString());

  try {
    await navigator.clipboard.writeText(url.toString());
    showToast(`Share link copied — ${savedColorStash.length} colors.`, "success");
    setStatus("Shareable link copied to your clipboard.", "success");
  } catch {
    showToast("Link is in the address bar — copy it manually.", "error");
    setStatus("Couldn't copy automatically; the link is in the address bar.", "error");
  }
}

function importPaletteFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;

  const incoming = hash.split(",").map(toStashEntry).filter(Boolean);
  // Always clear the hash so a refresh doesn't re-import the same palette.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  if (!incoming.length) return null;

  const added = mergeStashEntries(incoming);
  persistColorStash();
  const label = `Imported ${added} shared color${added === 1 ? "" : "s"}.`;
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

// sRGB hex → OKLCH.
function hexToOklch(hex) {
  const { L, a, b } = hexToOklab(hex);
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

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

      const added = mergeStashEntries(incoming);
      persistColorStash();
      renderSavedColors();

      const label = `Imported ${added} new color${added === 1 ? "" : "s"}.`;
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
    showToast("Copy failed — you can copy it manually.", "error");
    setStatus("Copy failed in this browser — you can copy it manually.", "error");
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
  toast.addEventListener("animationend", () => toast.remove(), { once: true });
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
