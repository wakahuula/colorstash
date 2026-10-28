// Color Stash: image to palette extraction (100% on-device, canvas only).
//
// Loaded as a classic <script defer> after main.js. Dependencies come from the
// window.ColorStash contract rather than from bare globals.
// Destructuring into bare names does NOT work: classic scripts share one global
// scope, so `const { preview } = …` collides with main.js and throws.


const imageExtractButton = document.getElementById("imageExtractButton");
const imageFileInput = document.getElementById("imageFileInput");
const imageRow = document.getElementById("imageRow");

// Plain DOM lookups, not part of the ColorStash contract: an element id is not
// an application API, and main.js has no reason to re-export it.
const previewEl = document.getElementById("preview");
const colorInputEl = document.getElementById("colorInput");

// Downsample by total pixel count, not by longest edge. Scaling to a fixed
// longest edge collapsed anything wide and short. A 4000×300 banner became
// 120×9, i.e. 1080 pixels to pick six colors out of.
const TARGET_PIXELS = 16000;
const MIN_EDGE = 48;

function downsampleSize(width, height) {
  const scale = Math.min(1, Math.sqrt(TARGET_PIXELS / (width * height)));
  return {
    w: Math.max(MIN_EDGE, Math.round(width * scale)),
    h: Math.max(MIN_EDGE, Math.round(height * scale)),
  };
}

function handleImageFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = ""; // reset so the same file can be re-picked
  if (file) extractPaletteFromFile(file);
}

function setupImageDropAndPaste() {
  ["dragenter", "dragover"].forEach((type) => {
    previewEl.addEventListener(type, (event) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      previewEl.classList.add("drop-active");
    });
  });

  previewEl.addEventListener("dragleave", (event) => {
    if (previewEl.contains(event.relatedTarget)) return; // still inside the panel
    previewEl.classList.remove("drop-active");
  });

  previewEl.addEventListener("drop", (event) => {
    if (!dataTransferHasFiles(event.dataTransfer)) return;
    // Stop the browser from navigating to the dropped file, even if it isn't an image.
    event.preventDefault();
    previewEl.classList.remove("drop-active");
    const file = imageFileFromDataTransfer(event.dataTransfer);
    if (file) extractPaletteFromFile(file);
    else ColorStash.showToast("Drop an image file to extract its colors.", "error");
  });

  document.addEventListener("paste", (event) => {
    const file = imageFileFromDataTransfer(event.clipboardData);
    if (!file) return;
    // A pasted image must not hijack a text field: pasting a screenshot while
    // renaming a swatch used to fire an extraction and swallow the paste.
    const target = event.target;
    if (target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("input, textarea, select"))) {
      return;
    }
    extractPaletteFromFile(file);
  });
}

function dataTransferHasFiles(dt) {
  return !!dt && Array.from(dt.types || []).includes("Files");
}

function imageFileFromDataTransfer(dt) {
  if (!dt) return null;
  const fromFiles = dt.files ? Array.from(dt.files).find((f) => f.type.startsWith("image/")) : null;
  if (fromFiles) return fromFiles;
  const item = dt.items
    ? Array.from(dt.items).find((it) => it.kind === "file" && it.type.startsWith("image/"))
    : null;
  return item ? item.getAsFile() : null;
}

function extractPaletteFromFile(file) {
  if (!file.type.startsWith("image/")) {
    ColorStash.showToast("That doesn't look like an image.", "error");
    return;
  }

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    URL.revokeObjectURL(url);
    try {
      const colors = extractColors(img, 6);
      renderImagePalette(colors);
      if (colors.length) {
        ColorStash.showToast(`Found ${colors.length} colors.`, "success");
        ColorStash.setStatus(`Extracted ${colors.length} colors from the image.`, "success");
      } else {
        ColorStash.showToast("Couldn't read colors from that image.", "error");
        ColorStash.setStatus("Couldn't read colors from that image.", "error");
      }
    } catch {
      ColorStash.showToast("Couldn't read that image in this browser.", "error");
      ColorStash.setStatus("Couldn't read that image in this browser.", "error");
    }
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    ColorStash.showToast("Couldn't load that image.", "error");
    ColorStash.setStatus("Couldn't load that image.", "error");
  };

  img.src = url;
}

function extractColors(img, count) {
  const { w, h } = downsampleSize(img.naturalWidth, img.naturalHeight);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue; // skip mostly-transparent pixels
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (!pixels.length) return [];

  const seen = new Set();
  const hexes = [];
  medianCut(pixels, count).forEach((rgb) => {
    const hex = rgbArrayToHex(rgb);
    if (seen.has(hex)) return;
    seen.add(hex);
    hexes.push(hex);
  });

  // Light → dark reads as a tidy ramp.
  hexes.sort((a, b) => ColorStash.relativeLuminance(b) - ColorStash.relativeLuminance(a));
  return hexes;
}

// Median-cut quantization: repeatedly split the most-varied color box until we have `count` boxes.
function medianCut(pixels, count) {
  let boxes = [pixels];

  while (boxes.length < count) {
    boxes.sort((a, b) => boxWeight(b) - boxWeight(a));
    const largest = boxes.shift();
    if (!largest || largest.length < 2) {
      if (largest) boxes.unshift(largest);
      break;
    }
    const channel = dominantChannel(largest);
    largest.sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(largest.length / 2);
    boxes.push(largest.slice(0, mid), largest.slice(mid));
  }

  return boxes.map(averageColor);
}

function channelRange(box, channel) {
  let lo = 255;
  let hi = 0;
  for (const pixel of box) {
    if (pixel[channel] < lo) lo = pixel[channel];
    if (pixel[channel] > hi) hi = pixel[channel];
  }
  return hi - lo;
}

// Weight by population so large, flat regions get their own swatch.
function boxWeight(box) {
  return Math.max(channelRange(box, 0), channelRange(box, 1), channelRange(box, 2)) * box.length;
}

function dominantChannel(box) {
  let best = 0;
  let bestRange = -1;
  for (let channel = 0; channel < 3; channel++) {
    const range = channelRange(box, channel);
    if (range > bestRange) {
      bestRange = range;
      best = channel;
    }
  }
  return best;
}

function averageColor(box) {
  const sum = [0, 0, 0];
  for (const pixel of box) {
    sum[0] += pixel[0];
    sum[1] += pixel[1];
    sum[2] += pixel[2];
  }
  return sum.map((total) => Math.round(total / box.length));
}

function rgbArrayToHex(rgb) {
  return rgb.map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function renderImagePalette(hexes) {
  const fragment = document.createDocumentFragment();

  hexes.forEach((hex) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "image-swatch";
    button.title = `Use #${hex}`;
    button.setAttribute("aria-label", `Use #${hex}`);

    const chip = document.createElement("span");
    chip.className = "image-chip";
    chip.style.backgroundColor = `#${hex}`;

    const label = document.createElement("span");
    label.className = "image-label";
    label.textContent = `#${hex}`;

    button.append(chip, label);
    button.addEventListener("click", () => {
      colorInputEl.value = hex;
      ColorStash.applyColor(hex);
      ColorStash.setStatus(`#${hex} loaded.`);
    });
    fragment.appendChild(button);
  });

  if (hexes.length) fragment.appendChild(buildImagePaletteActions(hexes));

  imageRow.replaceChildren(fragment);
}

// Clicking six swatches one by one to keep a palette was the obvious missing
// button. These close the loop: save the whole extraction, or drop it.
function buildImagePaletteActions(hexes) {
  const bar = document.createElement("div");
  bar.className = "image-row-actions";

  const saveAll = document.createElement("button");
  saveAll.type = "button";
  saveAll.className = "ghost-button image-row-action";
  saveAll.innerHTML = '<svg class="icon button-icon" aria-hidden="true"><use href="#i-bookmark"></use></svg>'
    + `<span>Save all ${hexes.length}</span>`;
  saveAll.addEventListener("click", () => saveExtractedPalette(hexes));

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "icon-button image-row-clear";
  clear.setAttribute("aria-label", "Clear extracted colors");
  clear.title = "Clear";
  clear.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-x"></use></svg>';
  clear.addEventListener("click", clearImagePalette);

  bar.append(saveAll, clear);
  return bar;
}

function saveExtractedPalette(hexes) {
  const current = ColorStash.stash;
  const fresh = hexes
    .map((hex) => ({ hex: ColorStash.normalizeHex(hex), name: "" }))
    .filter((entry) => !current.some((existing) => existing.hex === entry.hex));

  if (!fresh.length) {
    ColorStash.showToast("Those colors are already in your stash.", "error");
    ColorStash.setStatus("Those colors are already in your stash.", "error");
    return;
  }

  const merged = ColorStash.mergeStashEntries(current, fresh);
  ColorStash.replaceStash(merged.entries);
  ColorStash.persistColorStash();
  ColorStash.renderSavedColors();

  const label = `Saved ${merged.added} color${merged.added === 1 ? "" : "s"} from the image.`;
  ColorStash.showToast(label, "success");
  ColorStash.setStatus(label, "success");
  clearImagePalette();
}

function clearImagePalette() {
  // Back to :empty, so the drop-hint pseudo-element returns.
  imageRow.replaceChildren();
}

// A shared image arrives as a POST the service worker parked in a cache. The file
// is claimed exactly once, so reloading afterwards does not re-trigger it.
async function consumeSharedImage() {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open("colorstash-share");
    const parked = await cache.match("/__shared-image");
    if (!parked) return;
    await cache.delete("/__shared-image");

    const blob = await parked.blob();
    extractPaletteFromFile(new File([blob], "shared-image", { type: blob.type || "image/png" }));
    ColorStash.showToast("Image received.", "success");
  } catch {
    // No share in flight, or storage refused. Nothing to do.
  }
}

imageExtractButton.addEventListener("click", () => imageFileInput.click());
imageFileInput.addEventListener("change", handleImageFile);
setupImageDropAndPaste();
consumeSharedImage();
