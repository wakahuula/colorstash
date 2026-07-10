// Color Stash — image → palette extraction (100% on-device, canvas only).
// Loaded as a classic <script defer> after main.js, so it shares main.js's
// globals: preview, colorInput, applyColor, relativeLuminance, showToast, setStatus.

const imageExtractButton = document.getElementById("imageExtractButton");
const imageFileInput = document.getElementById("imageFileInput");
const imageRow = document.getElementById("imageRow");

function handleImageFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = ""; // reset so the same file can be re-picked
  if (file) extractPaletteFromFile(file);
}

function setupImageDropAndPaste() {
  ["dragenter", "dragover"].forEach((type) => {
    preview.addEventListener(type, (event) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      preview.classList.add("drop-active");
    });
  });

  preview.addEventListener("dragleave", (event) => {
    if (preview.contains(event.relatedTarget)) return; // still inside the panel
    preview.classList.remove("drop-active");
  });

  preview.addEventListener("drop", (event) => {
    if (!dataTransferHasFiles(event.dataTransfer)) return;
    // Stop the browser from navigating to the dropped file, even if it isn't an image.
    event.preventDefault();
    preview.classList.remove("drop-active");
    const file = imageFileFromDataTransfer(event.dataTransfer);
    if (file) extractPaletteFromFile(file);
    else showToast("Drop an image file to extract its colors.", "error");
  });

  document.addEventListener("paste", (event) => {
    const file = imageFileFromDataTransfer(event.clipboardData);
    if (file) extractPaletteFromFile(file);
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
    showToast("That doesn't look like an image.", "error");
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
        showToast(`Found ${colors.length} colors — the image never left your device.`, "success");
        setStatus(`Extracted ${colors.length} colors from the image.`, "success");
      } else {
        showToast("Couldn't read colors from that image.", "error");
        setStatus("Couldn't read colors from that image.", "error");
      }
    } catch {
      showToast("Couldn't read that image in this browser.", "error");
      setStatus("Couldn't read that image in this browser.", "error");
    }
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    showToast("Couldn't load that image.", "error");
    setStatus("Couldn't load that image.", "error");
  };

  img.src = url;
}

function extractColors(img, count) {
  const maxDim = 120; // downsample: enough signal, stays instant
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

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
  hexes.sort((a, b) => relativeLuminance(b) - relativeLuminance(a));
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
      colorInput.value = hex;
      applyColor(hex);
      setStatus(`#${hex} loaded from the image palette.`);
    });
    fragment.appendChild(button);
  });

  imageRow.replaceChildren(fragment);
}

imageExtractButton.addEventListener("click", () => imageFileInput.click());
imageFileInput.addEventListener("change", handleImageFile);
setupImageDropAndPaste();
