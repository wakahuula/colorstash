const DEFAULT_COLOR = "446CCF";
const STORAGE_KEY = "savedColorStash";
const THEME_KEY = "colorStashTheme";
const THEME_COLORS = {
  dark: "#121212",
  light: "#ececec",
};

const savedColors = document.getElementById("savedColors");
const preview = document.getElementById("preview");
const previewSwatch = document.getElementById("previewSwatch");
const colorInput = document.getElementById("colorInput");
const colorPickerInput = document.getElementById("colorPickerInput");
const activeHexLabel = document.getElementById("activeHexLabel");
const activeRgbLabel = document.getElementById("activeRgbLabel");
const statusMessage = document.getElementById("statusMessage");
const stashCount = document.getElementById("stashCount");
const saveColorButton = document.getElementById("saveColorButton");
const copyColorButton = document.getElementById("copyColorButton");
const randomColorButton = document.getElementById("randomColorButton");
const clearColorsButton = document.getElementById("clearColorsButton");
const themeToggleButton = document.getElementById("themeToggleButton");
const themeToggleIcon = document.getElementById("themeToggleIcon");
const colorCardTemplate = document.getElementById("colorCardTemplate");
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
    setStatus("Keep going - hex colors use 3 or 6 characters.", "error");
    updatePreviewDisplay(expandHexForPreview(sanitized), sanitized.toUpperCase(), false);
    activeRgbLabel.textContent = "Waiting for a valid color";
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
    setStatus("That color is incomplete. Use 3 or 6 hex digits.", "error");
    return;
  }

  const normalized = normalizeHex(color);
  if (savedColorStash.includes(normalized)) {
    setStatus(`${formatHex(normalized)} is already in your stash.`, "error");
    return;
  }

  savedColorStash.unshift(normalized);
  persistColorStash();
  renderSavedColors();
  applyColor(normalized);
  setStatus(`${formatHex(normalized)} added to your stash.`, "success");
}

async function copyCurrentColor() {
  if (!isValidHex(colorInput.value)) {
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
    setStatus("Your stash is already empty.");
    return;
  }

  savedColorStash = [];
  persistColorStash();
  renderSavedColors();
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
    setStatus(`Theme set to ${label}.`, "success");
  }
}

function updateThemeToggle(theme) {
  const modeLabel = themePreference === "system" ? `Auto (${capitalize(theme)})` : capitalize(theme);
  const icon = themePreference === "system" ? "◐" : theme === "dark" ? "☾" : "☀";

  themeToggleIcon.textContent = icon;
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
  savedColors.innerHTML = "";

  if (!savedColorStash.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent =
      "No saved colors yet. Preview a shade, then save the ones worth keeping.";
    savedColors.appendChild(emptyState);
    updateStashCount();
    return;
  }

  const fragment = document.createDocumentFragment();
  savedColorStash.forEach((color) => {
    fragment.appendChild(createColorCard(color));
  });

  savedColors.appendChild(fragment);
  updateStashCount();
}

function createColorCard(color) {
  const card = colorCardTemplate.content.firstElementChild.cloneNode(true);
  const swatchButton = card.querySelector(".saved-color-swatch");
  const hexLabel = card.querySelector(".saved-color-hex");
  const rgbLabel = card.querySelector(".saved-color-rgb");
  const copyButton = card.querySelector(".copy-button");
  const deleteButton = card.querySelector(".delete-button");

  swatchButton.style.backgroundColor = formatHex(color);
  swatchButton.setAttribute("aria-label", `Use ${formatHex(color)}`);
  hexLabel.textContent = formatHex(color);
  rgbLabel.textContent = hexToRgbString(color);
  card.dataset.color = color;

  swatchButton.addEventListener("click", () => {
    colorInput.value = color;
    applyColor(color);
    setStatus(`${formatHex(color)} loaded from your stash.`);
  });

  copyButton.addEventListener("click", async () => {
    await copyText(formatHex(color));
  });

  deleteButton.addEventListener("click", () => {
    deleteSavedColor(color);
  });

  return card;
}

function deleteSavedColor(color) {
  savedColorStash = savedColorStash.filter((savedColor) => savedColor !== color);
  persistColorStash();
  renderSavedColors();
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

  if (isValid) {
    activeRgbLabel.textContent = hexToRgbString(color);
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
  } catch (error) {
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
    return sanitized
      .split("")
      .map((character) => character + character)
      .join("");
  }

  return sanitized.padEnd(6, "0");
}

function expandHexForPreview(color) {
  const sanitized = sanitizeHex(color);
  if (sanitized.length >= 6) {
    return sanitized.slice(0, 6);
  }

  return sanitized.padEnd(6, sanitized[sanitized.length - 1] || "0");
}

function formatHex(color) {
  return `#${normalizeHex(color)}`;
}

function hexToRgbString(color) {
  const normalized = normalizeHex(color);
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgb(${red}, ${green}, ${blue})`;
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

    setStatus(`${value} copied to your clipboard.`, "success");
  } catch (error) {
    setStatus("Copy failed in this browser. You can still copy manually.", "error");
  }
}

function setStatus(message, tone) {
  statusMessage.textContent = message;
  statusMessage.classList.remove("error", "success");

  if (tone) {
    statusMessage.classList.add(tone);
  }
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}



