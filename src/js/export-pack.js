// Color Stash — developer export pack.
// Turns the saved stash into copy-paste developer tokens in several formats.
// Loaded as a classic <script defer> after main.js, so it shares main.js's
// globals: savedColorStash, normalizeHex, hexToOklch, showToast, setStatus.

const exportCssButton = document.getElementById("exportCssButton");
const exportMenu = document.getElementById("exportMenu");

function setupExportMenu() {
  exportCssButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleExportMenu();
  });

  exportMenu.querySelectorAll(".export-menu-item").forEach((item) => {
    item.addEventListener("click", () => {
      closeExportMenu();
      exportPaletteAs(item.dataset.format);
    });
  });

  document.addEventListener("click", (event) => {
    if (!exportMenu.hidden && !event.target.closest(".menu-anchor")) closeExportMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !exportMenu.hidden) {
      closeExportMenu();
      exportCssButton.focus();
    }
  });
}

function toggleExportMenu() {
  if (exportMenu.hidden) openExportMenu();
  else closeExportMenu();
}

function openExportMenu() {
  if (!savedColorStash.length) {
    showToast("Save some colors first, then export them.");
    setStatus("Save some colors first, then export them.");
    return;
  }
  exportMenu.hidden = false;
  exportCssButton.setAttribute("aria-expanded", "true");
}

function closeExportMenu() {
  exportMenu.hidden = true;
  exportCssButton.setAttribute("aria-expanded", "false");
}

function exportPaletteAs(format) {
  if (!savedColorStash.length) {
    showToast("Save some colors first, then export them.");
    setStatus("Save some colors first, then export them.");
    return;
  }

  const generators = {
    css: buildCssVars,
    oklch: buildOklch,
    scss: buildScss,
    tailwind: buildTailwind,
    tokens: buildTokensJson,
  };
  const { text, label } = (generators[format] || buildCssVars)();
  copyExport(text, label);
}

async function copyExport(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Copied ${savedColorStash.length} colors as ${label}.`, "success");
    setStatus(`Palette copied as ${label}.`, "success");
  } catch {
    showToast("Couldn't copy to your clipboard.", "error");
    setStatus("Couldn't copy to your clipboard.", "error");
  }
}

// Turns a color's name into a token-safe slug; falls back to color-N, deduped across the stash.
function paletteSlugs(prefix) {
  const seen = new Set();
  return savedColorStash.map((entry, index) => {
    const base = (entry.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    let slug = base || `${prefix}-${index + 1}`;
    if (seen.has(slug)) slug = `${slug}-${index + 1}`;
    seen.add(slug);
    return slug;
  });
}

function buildCssVars() {
  const slugs = paletteSlugs("color");
  const lines = savedColorStash.map((entry, i) => `  --${slugs[i]}: #${entry.hex};`);
  return { text: `:root {\n${lines.join("\n")}\n}`, label: "CSS variables" };
}

function buildScss() {
  const slugs = paletteSlugs("color");
  const lines = savedColorStash.map((entry, i) => `$${slugs[i]}: #${entry.hex};`);
  return { text: lines.join("\n"), label: "SCSS variables" };
}

function buildTailwind() {
  const slugs = paletteSlugs("color");
  const entries = savedColorStash.map((entry, i) => `        '${slugs[i]}': '#${entry.hex}',`);
  const text = `/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
${entries.join("\n")}
      },
    },
  },
};`;
  return { text, label: "Tailwind config" };
}

function buildTokensJson() {
  const slugs = paletteSlugs("color");
  const tokens = {};
  savedColorStash.forEach((entry, i) => {
    tokens[slugs[i]] = {
      $type: "color",
      $value: `#${entry.hex}`,
      ...(entry.name ? { $description: entry.name } : {}),
    };
  });
  return { text: JSON.stringify({ color: tokens }, null, 2), label: "design tokens (JSON)" };
}

function buildOklch() {
  const slugs = paletteSlugs("color");
  const lines = savedColorStash.map((entry, i) => {
    const { L, C, H } = hexToOklch(entry.hex);
    return `  --${slugs[i]}: oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${H.toFixed(1)});`;
  });
  return { text: `:root {\n${lines.join("\n")}\n}`, label: "OKLCH" };
}

setupExportMenu();
