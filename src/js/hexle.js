// Color Stash — Hexle, the daily color guess.
// Everyone gets the same mystery color each day (seeded from the date, no server).
// Read the color, then pick its hex from five options. Three wrong guesses lose the day.
// Loaded as a classic <script defer> after main.js, so it shares main.js's globals:
// hslToHex, normalizeHex, isValidHex, formatHex, savedColorStash,
// persistColorStash, renderSavedColors, showToast, setStatus.

const HEXLE_KEY = "hexleState";
const HEXLE_EPOCH_UTC = Date.UTC(2026, 0, 1);
const HEXLE_MAX_WRONG = 3;
const HEXLE_OPTIONS = 5;

const hexleButton = document.getElementById("hexleButton");
const hexleStreakBadge = document.getElementById("hexleStreakBadge");
const hexleModal = document.getElementById("hexleModal");
const hexleNumber = document.getElementById("hexleNumber");
const hexleSwatch = document.getElementById("hexleSwatch");
const hexleTries = document.getElementById("hexleTries");
const hexleOptions = document.getElementById("hexleOptions");
const hexleResult = document.getElementById("hexleResult");
const hexleStreak = document.getElementById("hexleStreak");

let hexleState = loadHexleState();
let hexleTarget = null;      // today's answer (6-digit hex, no #)
let hexleChoices = [];        // today's five options, in stable shuffled order

/* ── Date + deterministic puzzle ─────────────── */

function hexleFmtDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function hexleToday() {
  return hexleFmtDate(new Date());
}

function hexleYesterday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return hexleFmtDate(date);
}

function hexlePuzzleNumber(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - HEXLE_EPOCH_UTC) / 86400000) + 1;
}

// FNV-1a string hash → 32-bit seed.
function hexleHash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 PRNG — deterministic, so every device builds the same puzzle.
function hexleRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexleClamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// Target = a pleasant, guessable color; distractors = nearby hues/tones so it's a real read.
function hexleBuildPuzzle(dateStr) {
  const rng = hexleRng(hexleHash(`hexle-${dateStr}`));
  const h = Math.floor(rng() * 360);
  const s = 0.45 + rng() * 0.4; // 0.45–0.85
  const l = 0.35 + rng() * 0.3; // 0.35–0.65
  const target = hslToHex(h, s, l);

  const choices = new Set([target]);
  const offsets = [
    [30, 0, 0], [-30, 0, 0], [0, 0, 0.12], [0, 0, -0.12],
    [18, -0.2, 0], [-18, 0.15, 0], [45, 0, 0.08], [-45, 0, -0.08],
    [12, 0, 0.16], [-12, 0, -0.16],
  ];
  for (let i = 0; i < offsets.length && choices.size < HEXLE_OPTIONS; i++) {
    const [dh, ds, dl] = offsets[i];
    choices.add(hslToHex(h + dh, hexleClamp01(s + ds), hexleClamp01(l + dl)));
  }
  while (choices.size < HEXLE_OPTIONS) {
    choices.add(hslToHex(Math.floor(rng() * 360), 0.4 + rng() * 0.45, 0.3 + rng() * 0.4));
  }

  // Seeded Fisher–Yates: option order is stable and identical for everyone.
  const arr = [...choices];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { target, choices: arr };
}

function hexleEnsureToday() {
  const today = hexleToday();
  const puzzle = hexleBuildPuzzle(today);
  hexleTarget = puzzle.target;
  hexleChoices = puzzle.choices;

  if (hexleState.date !== today) {
    hexleState.date = today;
    hexleState.picks = [];
    hexleState.done = false;
    hexleState.won = false;
    persistHexleState();
  }
}

/* ── Persistence ─────────────────────────────── */

function loadHexleState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HEXLE_KEY));
    if (parsed && typeof parsed === "object") {
      return {
        date: typeof parsed.date === "string" ? parsed.date : null,
        picks: Array.isArray(parsed.picks) ? parsed.picks.filter(isValidHex).map(normalizeHex) : [],
        done: !!parsed.done,
        won: !!parsed.won,
        streak: Number.isFinite(parsed.streak) ? parsed.streak : 0,
        maxStreak: Number.isFinite(parsed.maxStreak) ? parsed.maxStreak : 0,
        lastWonDate: typeof parsed.lastWonDate === "string" ? parsed.lastWonDate : null,
      };
    }
  } catch {
    // Corrupt/blocked storage — start fresh.
  }
  return { date: null, picks: [], done: false, won: false, streak: 0, maxStreak: 0, lastWonDate: null };
}

function persistHexleState() {
  try {
    localStorage.setItem(HEXLE_KEY, JSON.stringify(hexleState));
  } catch {
    // Non-fatal — the game still works for this session.
  }
}

/* ── Game logic ──────────────────────────────── */

function hexleWrongCount() {
  return hexleState.picks.filter((pick) => pick !== hexleTarget).length;
}

function hexlePick(hex) {
  if (hexleState.done || hexleState.picks.includes(hex)) return;
  hexleState.picks.push(hex);

  if (hex === hexleTarget) {
    hexleState.done = true;
    hexleState.won = true;
    hexleApplyResult(true);
  } else if (hexleWrongCount() >= HEXLE_MAX_WRONG) {
    hexleState.done = true;
    hexleState.won = false;
    hexleApplyResult(false);
  }

  persistHexleState();
  hexleRender();
  hexleUpdateLaunch();
}

// Updates the streak once, when the day resolves.
function hexleApplyResult(won) {
  if (!won) {
    hexleState.streak = 0;
    return;
  }
  if (hexleState.lastWonDate === hexleToday()) {
    // already counted today
  } else if (hexleState.lastWonDate === hexleYesterday()) {
    hexleState.streak = (hexleState.streak || 0) + 1;
  } else {
    hexleState.streak = 1;
  }
  hexleState.lastWonDate = hexleToday();
  hexleState.maxStreak = Math.max(hexleState.maxStreak || 0, hexleState.streak);
}

// A missed day silently breaks the run for display, without rewriting storage until you play.
function hexleEffectiveStreak() {
  const last = hexleState.lastWonDate;
  if (last === hexleToday() || last === hexleYesterday()) return hexleState.streak || 0;
  return 0;
}

/* ── Rendering ───────────────────────────────── */

function openHexle() {
  hexleEnsureToday();
  hexleRender();
  hexleModal.hidden = false;
  const firstOption = hexleOptions.querySelector("button:not([disabled])");
  (firstOption || hexleModal.querySelector("[data-hexle-close]")).focus();
}

function closeHexle() {
  hexleModal.hidden = true;
  hexleButton.focus();
}

function hexleRender() {
  hexleNumber.textContent = `#${hexlePuzzleNumber(hexleState.date)}`;
  hexleSwatch.style.backgroundColor = `#${hexleTarget}`;

  const wrong = hexleWrongCount();
  const tries = document.createDocumentFragment();
  for (let i = 0; i < HEXLE_MAX_WRONG; i++) {
    const dot = document.createElement("span");
    dot.className = `hexle-try-dot${i < wrong ? " spent" : ""}`;
    tries.appendChild(dot);
  }
  hexleTries.replaceChildren(tries);

  const options = document.createDocumentFragment();
  hexleChoices.forEach((hex) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hexle-option";
    button.textContent = `#${hex}`;

    const picked = hexleState.picks.includes(hex);
    if (hexleState.done || picked) button.disabled = true;
    if (hexleState.done && hex === hexleTarget) button.classList.add("correct");
    else if (picked) button.classList.add("wrong");

    if (!hexleState.done && !picked) {
      button.addEventListener("click", () => hexlePick(hex));
    }
    options.appendChild(button);
  });
  hexleOptions.replaceChildren(options);

  if (hexleState.done) {
    hexleResult.replaceChildren(hexleBuildResult());
    hexleResult.hidden = false;
  } else {
    hexleResult.hidden = true;
  }

  const streak = hexleEffectiveStreak();
  if (streak > 0) {
    hexleStreak.textContent = `Current streak: ${streak}  ·  Best: ${hexleState.maxStreak}`;
  } else if (hexleState.maxStreak > 0) {
    hexleStreak.textContent = `Best streak: ${hexleState.maxStreak}`;
  } else {
    hexleStreak.textContent = "";
  }
}

function hexleBuildResult() {
  const wrap = document.createElement("div");
  wrap.className = "hexle-result-inner";

  const answer = document.createElement("div");
  answer.className = "hexle-answer";

  const swatch = document.createElement("div");
  swatch.className = "hexle-answer-swatch";
  swatch.style.backgroundColor = `#${hexleTarget}`;

  const text = document.createElement("div");
  text.className = "hexle-answer-text";
  const hex = document.createElement("span");
  hex.className = "hexle-answer-hex";
  hex.textContent = `#${hexleTarget}`;
  const meta = document.createElement("span");
  meta.className = "hexle-answer-meta";
  const picks = hexleState.picks.length;
  meta.textContent = hexleState.won
    ? `Solved in ${picks} ${picks === 1 ? "guess" : "guesses"} 🎉`
    : "Out of guesses — better luck tomorrow.";
  text.append(hex, meta);
  answer.append(swatch, text);

  const actions = document.createElement("div");
  actions.className = "hexle-result-actions";

  const shareButton = document.createElement("button");
  shareButton.type = "button";
  shareButton.className = "secondary-button";
  shareButton.innerHTML = '<svg class="icon button-icon" aria-hidden="true"><use href="#i-share"></use></svg><span>Share</span>';
  shareButton.addEventListener("click", shareHexle);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "secondary-button";
  saveButton.innerHTML = '<svg class="icon button-icon" aria-hidden="true"><use href="#i-bookmark"></use></svg><span>Save color</span>';
  saveButton.addEventListener("click", saveHexleColor);

  actions.append(shareButton, saveButton);

  const comeback = document.createElement("p");
  comeback.className = "hexle-comeback";
  comeback.textContent = `Come back tomorrow for Hexle #${hexlePuzzleNumber(hexleState.date) + 1}.`;

  wrap.append(answer, actions, comeback);
  return wrap;
}

/* ── Share + save ────────────────────────────── */

function hexleShareText() {
  const number = hexlePuzzleNumber(hexleState.date);
  const score = hexleState.won ? `${hexleState.picks.length}/${HEXLE_MAX_WRONG}` : `X/${HEXLE_MAX_WRONG}`;
  const squares = hexleState.picks.map((pick) => (pick === hexleTarget ? "🟩" : "⬛")).join("");
  return `Hexle #${number} ${score}\n${squares}\nhttps://colorstash.kosta.lol/`;
}

async function shareHexle() {
  const text = hexleShareText();
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch {
      // User dismissed the share sheet, or it failed — fall back to the clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast("Result copied to your clipboard.", "success");
    setStatus("Hexle result copied to your clipboard.", "success");
  } catch {
    showToast("Couldn't copy the result.", "error");
    setStatus("Couldn't copy the result.", "error");
  }
}

function saveHexleColor() {
  if (savedColorStash.some((entry) => entry.hex === hexleTarget)) {
    showToast(`${formatHex(hexleTarget)} is already in your stash.`);
    setStatus(`${formatHex(hexleTarget)} is already in your stash.`);
    return;
  }
  savedColorStash.unshift({ hex: hexleTarget, name: `Hexle #${hexlePuzzleNumber(hexleState.date)}` });
  persistColorStash();
  renderSavedColors();
  showToast(`Saved ${formatHex(hexleTarget)} to your stash.`, "success");
  setStatus(`Saved ${formatHex(hexleTarget)} to your stash.`, "success");
}

function hexleUpdateLaunch() {
  const streak = hexleEffectiveStreak();
  if (streak > 0) {
    hexleStreakBadge.hidden = false;
    hexleStreakBadge.textContent = `🔥 ${streak}`;
  } else {
    hexleStreakBadge.hidden = true;
  }
}

/* ── Wiring ──────────────────────────────────── */

hexleButton.addEventListener("click", openHexle);
hexleModal.querySelectorAll("[data-hexle-close]").forEach((el) => el.addEventListener("click", closeHexle));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !hexleModal.hidden) closeHexle();
});

hexleEnsureToday();
hexleUpdateLaunch();
