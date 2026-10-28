// Color Stash: developer export pack.
// Turns the saved stash into copy-paste developer tokens in several formats.
//
// Loaded as a classic <script defer> after main.js. Dependencies come from the
// window.ColorStash contract rather than from bare globals, so every borrow is
// greppable at the call site.
//
// NB: neither destructuring nor a shared `const` alias works between classic
// scripts: they share one global scope, so `const { showToast } = …` collides
// with main.js's own declarations and throws. Referencing the global property
// directly is the only shape that survives.

const exportCssButton = document.getElementById("exportCssButton");
const exportMenu = document.getElementById("exportMenu");
const exportMenuItems = [...exportMenu.querySelectorAll(".export-menu-item")];

function setupExportMenu() {
  exportCssButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleExportMenu();
  });

  exportMenuItems.forEach((item) => {
    item.addEventListener("click", () => {
      closeExportMenu({ restoreFocus: true });
      exportPaletteAs(item.dataset.format);
    });
  });

  document.addEventListener("click", (event) => {
    // Clicking away closes without stealing focus from wherever the user went.
    if (!exportMenu.hidden && !event.target.closest(".menu-anchor")) closeExportMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (exportMenu.hidden) return;

    if (event.key === "Escape") {
      closeExportMenu({ restoreFocus: true });
      return;
    }

    // role="menu" obliges the ARIA menu pattern: arrow keys move between items
    // with a roving tabindex, and only the active item is tabbable.
    const forward = event.key === "ArrowDown";
    const backward = event.key === "ArrowUp";
    if (!forward && !backward && event.key !== "Home" && event.key !== "End") return;

    event.preventDefault();
    const index = exportMenuItems.indexOf(document.activeElement);
    const last = exportMenuItems.length - 1;
    let next;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (index === -1) next = forward ? 0 : last;
    else next = (index + (forward ? 1 : -1) + exportMenuItems.length) % exportMenuItems.length;

    focusMenuItem(next);
  });
}

function focusMenuItem(index) {
  exportMenuItems.forEach((item, i) => {
    item.tabIndex = i === index ? 0 : -1;
  });
  exportMenuItems[index].focus();
}

function toggleExportMenu() {
  if (exportMenu.hidden) openExportMenu();
  else closeExportMenu();
}

function openExportMenu() {
  if (!ColorStash.stash.length) {
    ColorStash.showToast("Save some colors first, then export them.");
    ColorStash.setStatus("Save some colors first, then export them.");
    return;
  }
  exportMenu.hidden = false;
  exportCssButton.setAttribute("aria-expanded", "true");
  // Hand focus into the menu, otherwise a screen reader announces nothing.
  focusMenuItem(0);
}

function closeExportMenu({ restoreFocus = false } = {}) {
  exportMenu.hidden = true;
  exportCssButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) exportCssButton.focus();
}

function exportPaletteAs(format) {
  if (!ColorStash.stash.length) {
    ColorStash.showToast("Save some colors first, then export them.");
    ColorStash.setStatus("Save some colors first, then export them.");
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
    ColorStash.showToast(`Copied ${ColorStash.stash.length} colors as ${label}.`, "success");
    ColorStash.setStatus(`Palette copied as ${label}.`, "success");
  } catch {
    ColorStash.showToast("Couldn't copy to your clipboard.", "error");
    ColorStash.setStatus("Couldn't copy to your clipboard.", "error");
  }
}

function buildCssVars() {
  const entries = ColorStash.stash;
  const slugs = ColorStash.paletteSlugs(entries, "color");
  const lines = entries.map((entry, i) => `  --${slugs[i]}: #${entry.hex};`);
  return { text: `:root {\n${lines.join("\n")}\n}`, label: "CSS variables" };
}

function buildScss() {
  const entries = ColorStash.stash;
  const slugs = ColorStash.paletteSlugs(entries, "color");
  const lines = entries.map((entry, i) => `$${slugs[i]}: #${entry.hex};`);
  return { text: lines.join("\n"), label: "SCSS variables" };
}

function buildTailwind() {
  const entries = ColorStash.stash;
  const slugs = ColorStash.paletteSlugs(entries, "color");
  const lines = entries.map((entry, i) => `        '${slugs[i]}': '#${entry.hex}',`);
  const text = `/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
${lines.join("\n")}
      },
    },
  },
};`;
  return { text, label: "Tailwind config" };
}

function buildTokensJson() {
  const entries = ColorStash.stash;
  const slugs = ColorStash.paletteSlugs(entries, "color");
  const tokens = {};
  entries.forEach((entry, i) => {
    tokens[slugs[i]] = {
      $type: "color",
      $value: `#${entry.hex}`,
      ...(entry.name ? { $description: entry.name } : {}),
    };
  });
  return { text: JSON.stringify({ color: tokens }, null, 2), label: "design tokens (JSON)" };
}

function buildOklch() {
  const entries = ColorStash.stash;
  const slugs = ColorStash.paletteSlugs(entries, "color");
  const lines = entries.map((entry, i) => {
    const { L, C, H } = ColorStash.hexToOklch(entry.hex);
    return `  --${slugs[i]}: oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${H.toFixed(1)});`;
  });
  return { text: `:root {\n${lines.join("\n")}\n}`, label: "OKLCH" };
}

setupExportMenu();