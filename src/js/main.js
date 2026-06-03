const DEFAULT_COLOR = "446CCF";
const STORAGE_KEY = "savedColorStash";
const THEME_KEY = "colorStashTheme";
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
const themeToggleButton = document.getElementById("themeToggleButton");
const themeToggleIcon = document.getElementById("themeToggleIcon");
const colorCardTemplate = document.getElementById("colorCardTemplate");
const toastContainer = document.getElementById("toastContainer");
const themeMeta = document.querySelector('meta[name="theme-color"]');

const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

let currentColor = DEFAULT_COLOR;
let savedColorStash = loadColorStash();
let themePreference = loadThemePreference();

init();

function init() {
  applyTheme(getResolvedTheme(), false);

  colorInput.value = DEFAULT_COLOR;
  colorPickerInput.value = formatHex(DEFAULT_COLOR).toLowerCase();
  colorInput.addEventListener("input", handleInput);
  colorInput.addEventListener("keydown", handleInputKeydown);
  colorPickerInput.addEventListener("input", handleColorPickerInput);
  saveColorButton.addEventListener("click", saveCurrentColor);
  copyColorButton.addEventListener("click", copyCurrentColor);
  randomColorButton.addEventListener("click", applyRandomColor);
  clearColorsButton.addEventListener("click", clearAllColors);
  themeToggleButton.addEventListener("click", cycleThemePreference);
  systemThemeQuery.addEventListener("change", handleSystemThemeChange);

  renderSavedColors();
  applyColor(DEFAULT_COLOR);
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

function saveCurrentColor() {
  const color = sanitizeHex(colorInput.value);

  if (!isValidHex(color)) {
    showToast("That color is incomplete. Use 3 or 6 hex digits.", "error");
    setStatus("That color is incomplete. Use 3 or 6 hex digits.", "error");
    return;
  }

  const normalized = normalizeHex(color);
  if (savedColorStash.includes(normalized)) {
    showToast(`${formatHex(normalized)} is already in your stash.`, "error");
    setStatus(`${formatHex(normalized)} is already in your stash.`, "error");
    return;
  }

  savedColorStash.unshift(normalized);
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
    return;
  }

  savedColorStash = [];
  persistColorStash();
  renderSavedColors();
  showToast("All saved colors removed.", "success");
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
  const iconClass = themePreference === "system"
    ? "fa-circle-half-stroke"
    : theme === "dark" ? "fa-moon" : "fa-sun";

  themeToggleIcon.className = `fa-solid ${iconClass}`;
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
    emptyState.innerHTML = `<i class="fa-solid fa-palette empty-state-icon" aria-hidden="true"></i>No saved colors yet. Preview a shade, then save the ones worth keeping.`;
    savedColorsEl.appendChild(emptyState);
    updateStashCount();
    return;
  }

  const fragment = document.createDocumentFragment();
  savedColorStash.forEach((color) => {
    fragment.appendChild(createColorCard(color));
  });

  savedColorsEl.appendChild(fragment);
  updateStashCount();
}

function createColorCard(color) {
  const card = colorCardTemplate.content.firstElementChild.cloneNode(true);
  const swatchButton = card.querySelector(".saved-color-swatch");
  const hexLabel = card.querySelector(".saved-color-hex");
  const rgbLabel = card.querySelector(".saved-color-rgb");
  const hslLabel = card.querySelector(".saved-color-hsl");
  const copyButton = card.querySelector(".copy-button");
  const deleteButton = card.querySelector(".delete-button");

  swatchButton.style.backgroundColor = formatHex(color);
  swatchButton.setAttribute("aria-label", `Use ${formatHex(color)}`);
  hexLabel.textContent = formatHex(color);
  rgbLabel.textContent = hexToRgbString(color);
  if (hslLabel) hslLabel.textContent = hexToHslString(color);
  card.dataset.color = color;

  const glow = hexToRgbaString(color, 0.25);
  card.style.setProperty("--card-color", formatHex(color));
  card.style.setProperty("--card-glow", glow);

  swatchButton.addEventListener("click", () => {
    colorInput.value = color;
    applyColor(color);
    setStatus(`${formatHex(color)} loaded from your stash.`);
  });

  copyButton.addEventListener("click", async () => {
    await copyText(formatHex(color));
  });

  deleteButton.addEventListener("click", () => {
    deleteSavedColor(color, card);
  });

  return card;
}

function deleteSavedColor(color, cardEl) {
  if (cardEl) {
    cardEl.style.animation = "cardOut 180ms cubic-bezier(0.4, 0, 0.2, 1) both";
    cardEl.addEventListener("animationend", () => {
      savedColorStash = savedColorStash.filter((c) => c !== color);
      persistColorStash();
      renderSavedColors();
    }, { once: true });
  } else {
    savedColorStash = savedColorStash.filter((c) => c !== color);
    persistColorStash();
    renderSavedColors();
  }
  showToast(`${formatHex(color)} removed.`, "success");
  setStatus(`${formatHex(color)} removed from your stash.`, "success");
}

function applyColor(color, syncInput = true) {
  const normalized = normalizeHex(color);
  currentColor = normalized;

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
  }
}

function updateStashCount() {
  const total = savedColorStash.length;
  stashCount.textContent = `${total} color${total === 1 ? "" : "s"}`;
}

function loadColorStash() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return parsed.filter(isValidHex).map(normalizeHex);
  } catch {
    return [];
  }
}

function persistColorStash() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedColorStash));
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

function hexToHslString(color) {
  const n = normalizeHex(color);
  let r = parseInt(n.slice(0, 2), 16) / 255;
  let g = parseInt(n.slice(2, 4), 16) / 255;
  let b = parseInt(n.slice(4, 6), 16) / 255;

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

  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

async function copyText(value) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      colorInput.select();
      document.execCommand("copy");
      colorInput.setSelectionRange(colorInput.value.length, colorInput.value.length);
    }
    showToast(`${value} copied.`, "success");
    setStatus(`${value} copied to your clipboard.`, "success");
  } catch {
    showToast("Copy failed. You can still copy manually.", "error");
    setStatus("Copy failed in this browser. You can still copy manually.", "error");
  }
}

function setStatus(message, tone) {
  statusMessage.textContent = message;
  statusMessage.classList.remove("error", "success");
  if (tone) statusMessage.classList.add(tone);
}

let toastQueue = [];

function showToast(message, tone = "") {
  const toast = document.createElement("div");
  toast.className = `toast${tone ? ` ${tone}` : ""}`;

  const dot = document.createElement("span");
  dot.className = "toast-dot";
  dot.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.textContent = message;

  toast.appendChild(dot);
  toast.appendChild(text);
  toastContainer.appendChild(toast);

  const timer = setTimeout(() => dismissToast(toast), 3000);

  toast.addEventListener("click", () => {
    clearTimeout(timer);
    dismissToast(toast);
  });
}

function dismissToast(toast) {
  toast.classList.add("dismissing");
  toast.addEventListener("animationend", () => toast.remove(), { once: true });
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
