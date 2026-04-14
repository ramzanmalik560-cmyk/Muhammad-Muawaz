// ============================================================
//  app.js — Language Translator Frontend Logic
//  Connects to Python Flask backend at http://127.0.0.1:5000
// ============================================================

const API = "http://localhost:5000";

// ── Supported languages (code → display name) ──────────────
const LANGUAGES = {
  auto: "Auto Detect",
  en: "English",
  ur: "Urdu",
  ar: "Arabic",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  hi: "Hindi",
  tr: "Turkish",
  nl: "Dutch",
  pl: "Polish",
  sv: "Swedish",
  fa: "Persian",
  id: "Indonesian",
};

// Language flag emojis for quick chips
const CHIPS = [
  { code: "ur", label: "🇵🇰 Urdu" },
  { code: "ar", label: "🇸🇦 Arabic" },
  { code: "fr", label: "🇫🇷 French" },
  { code: "de", label: "🇩🇪 German" },
  { code: "es", label: "🇪🇸 Spanish" },
  { code: "zh", label: "🇨🇳 Chinese" },
  { code: "ja", label: "🇯🇵 Japanese" },
  { code: "hi", label: "🇮🇳 Hindi" },
  { code: "ru", label: "🇷🇺 Russian" },
  { code: "ko", label: "🇰🇷 Korean" },
];

// ── DOM references ──────────────────────────────────────────
const sourceLangEl = document.getElementById("sourceLang");
const targetLangEl = document.getElementById("targetLang");
const inputTextEl = document.getElementById("inputText");
const outputTextEl = document.getElementById("outputText");
const charCountEl = document.getElementById("charCount");
const translateBtnEl = document.getElementById("translateBtn");
const swapBtnEl = document.getElementById("swapBtn");
const clearBtnEl = document.getElementById("clearBtn");
const pasteBtnEl = document.getElementById("pasteBtn");
const copyBtnEl = document.getElementById("copyBtn");
const speakBtnEl = document.getElementById("speakBtn");
const micBtnEl = document.getElementById("micBtn");
const statusDotEl = document.getElementById("statusDot");
const statusLabelEl = document.getElementById("statusLabel");
const detectedBadge = document.getElementById("detectedBadge");
const msgBoxEl = document.getElementById("msgBox");
const chipsEl = document.getElementById("chips");
const toastEl = document.getElementById("toast");
const outputInfoEl = document.getElementById("outputInfo");

// ── State ───────────────────────────────────────────────────
let isTranslating = false;
let isMicOn = false;
let recognition = null;
let toastTimer = null;

// ── INIT ────────────────────────────────────────────────────
function init() {
  buildLanguageDropdowns();
  buildChips();
  checkBackendStatus();
  bindEvents();
}

// Build <option> elements in both dropdowns
function buildLanguageDropdowns() {
  Object.entries(LANGUAGES).forEach(([code, name]) => {
    // Source: includes "Auto Detect"
    const optSrc = document.createElement("option");
    optSrc.value = code;
    optSrc.textContent = name;
    sourceLangEl.appendChild(optSrc);

    // Target: skip "auto"
    if (code !== "auto") {
      const optTgt = document.createElement("option");
      optTgt.value = code;
      optTgt.textContent = name;
      if (code === "ur") optTgt.selected = true; // default target
      targetLangEl.appendChild(optTgt);
    }
  });
}

// Build quick-select language chips
function buildChips() {
  CHIPS.forEach(({ code, label }) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = label;
    btn.dataset.code = code;
    btn.addEventListener("click", () => selectChip(code, btn));
    chipsEl.appendChild(btn);
  });

  // Mark default active chip
  markActiveChip("ur");
}

// Bind all event listeners
function bindEvents() {
  translateBtnEl.addEventListener("click", runTranslation);
  swapBtnEl.addEventListener("click", swapLanguages);
  clearBtnEl.addEventListener("click", clearInput);
  pasteBtnEl.addEventListener("click", pasteText);
  copyBtnEl.addEventListener("click", copyOutput);
  speakBtnEl.addEventListener("click", speakOutput);
  micBtnEl.addEventListener("click", toggleMic);
  inputTextEl.addEventListener("input", onInputChange);

  // Ctrl+Enter to translate
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runTranslation();
  });
}

// ── BACKEND HEALTH CHECK ─────────────────────────────────────
async function checkBackendStatus() {
  setNavStatus("checking", "Checking…");
  try {
    const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      setNavStatus("online", "Backend online");
    } else {
      setNavStatus("offline", "Backend error");
    }
  } catch {
    setNavStatus("offline", "Backend offline");
  }
}

function setNavStatus(type, label) {
  statusDotEl.className = `status-dot ${type}`;
  statusLabelEl.textContent = label;
}

// ── TRANSLATE ────────────────────────────────────────────────
async function runTranslation() {
  const text = inputTextEl.value.trim();
  const source = sourceLangEl.value;
  const target = targetLangEl.value;

  // Validation
  if (!text) { showToast("Please enter some text first"); return; }
  if (source !== "auto" && source === target) { showToast("Source and target language are the same"); return; }
  if (isTranslating) return;

  // Set busy state
  isTranslating = true;
  translateBtnEl.disabled = true;
  hideMsg();
  hideDetectedBadge();
  showOutputLoading();

  try {
    // Call Python backend
    const response = await fetch(`${API}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source, target }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Translation failed");
    }

    // Show result
    showOutput(data.translated_text);
    outputInfoEl.textContent = `${LANGUAGES[target]} · ${data.char_count} chars`;

    if (data.detected_language && source === "auto") {
      showDetectedBadge(LANGUAGES[data.detected_language] || data.detected_language);
    }

    setNavStatus("online", "Backend online");

  } catch (err) {
    // If backend is down, fall back to direct MyMemory call
    if (err.name === "TypeError" || err.name === "AbortError" || err.message.includes("fetch")) {
      setNavStatus("offline", "Backend offline — using fallback");
      await fallbackTranslate(text, source, target);
    } else {
      showOutput("");
      showMsg("error", `Error: ${err.message}`);
    }
  }

  isTranslating = false;
  translateBtnEl.disabled = false;
}

// Direct API call fallback (when backend is not running)
async function fallbackTranslate(text, source, target) {
  try {
    const pair = source === "auto" ? `autodetect|${target}` : `${source}|${target}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`;
    const res = await fetch(url);

if (!res.ok) {
  const text = await res.text();
  throw new Error(text);
}

const data = await res.json();
  


    if (data.responseStatus === 200) {
      showOutput(data.responseData.translatedText);
      outputInfoEl.textContent = `${LANGUAGES[target]} · fallback mode`;
      showMsg("success", "Translated using fallback (start Python backend for full features)");
    } else {
      throw new Error(data.responseDetails || "Translation failed");
    }
  } catch (err) {
    showOutput("");
    showMsg("error", `Translation failed: ${err.message}`);
  }
}

// ── OUTPUT HELPERS ───────────────────────────────────────────
function showOutputLoading() {
  outputTextEl.innerHTML = `
    <div class="loading-output">
      <div class="spinner"></div>
      Translating…
    </div>`;
}

function showOutput(text) {
  if (text) {
    outputTextEl.textContent = text;
  } else {
    outputTextEl.innerHTML = `<span class="t-placeholder">Translation will appear here…</span>`;
  }
}

// ── INPUT HANDLERS ───────────────────────────────────────────
function onInputChange() {
  const len = inputTextEl.value.length;
  charCountEl.textContent = `${len} / 1000`;
  charCountEl.className = len > 950 ? "char-count over" : len > 800 ? "char-count warn" : "char-count";
}

function clearInput() {
  inputTextEl.value = "";
  onInputChange();
  showOutput("");
  outputInfoEl.textContent = "";
  hideDetectedBadge();
  hideMsg();
  showToast("Cleared");
}

async function pasteText() {
  try {
    const text = await navigator.clipboard.readText();
    inputTextEl.value = text;
    onInputChange();
    showToast("Pasted");
  } catch {
    showToast("Paste failed — use Ctrl+V");
  }
}

async function copyOutput() {
  const text = outputTextEl.textContent;
  if (!text || outputTextEl.querySelector(".t-placeholder")) {
    showToast("Nothing to copy yet");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!");
  } catch {
    showToast("Copy failed — use Ctrl+C");
  }
}

// ── SWAP LANGUAGES ───────────────────────────────────────────
function swapLanguages() {
  const src = sourceLangEl.value;
  const tgt = targetLangEl.value;

  if (src === "auto") {
    showToast("Set a source language to swap");
    return;
  }

  // Swap selects
  sourceLangEl.value = tgt;
  targetLangEl.value = src;
  markActiveChip(tgt);

  // Swap text
  const outputText = outputTextEl.textContent;
  if (outputText && !outputTextEl.querySelector(".t-placeholder")) {
    inputTextEl.value = outputText;
    onInputChange();
    showOutput("");
    outputInfoEl.textContent = "";
  }
}

// ── QUICK CHIPS ──────────────────────────────────────────────
function selectChip(code, btn) {
  targetLangEl.value = code;
  markActiveChip(code);
}

function markActiveChip(code) {
  document.querySelectorAll(".chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.code === code);
  });
}

// ── TEXT TO SPEECH ───────────────────────────────────────────
function speakOutput() {
  const text = outputTextEl.textContent;
  if (!text || outputTextEl.querySelector(".t-placeholder")) {
    showToast("Nothing to read yet");
    return;
  }
  const lang = targetLangEl.value;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
  showToast("Reading aloud…");
}

// ── VOICE INPUT ──────────────────────────────────────────────
function toggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast("Speech input not supported in this browser"); return; }

  if (isMicOn) {
    recognition.stop();
    isMicOn = false;
    micBtnEl.classList.remove("active");
    return;
  }

  recognition = new SR();
  const src = sourceLangEl.value;
  recognition.lang = src === "auto" ? "en-US" : `${src}-${src.toUpperCase()}`;

  recognition.onresult = (e) => {
    inputTextEl.value = e.results[0][0].transcript;
    onInputChange();
    showToast("Voice captured!");
  };

  recognition.onend = () => {
    isMicOn = false;
    micBtnEl.classList.remove("active");
  };

  recognition.onerror = () => {
    isMicOn = false;
    micBtnEl.classList.remove("active");
    showToast("Microphone error");
  };

  recognition.start();
  isMicOn = true;
  micBtnEl.classList.add("active");
  showToast("Listening… speak now");
}

// ── BADGE ────────────────────────────────────────────────────
function showDetectedBadge(langName) {
  detectedBadge.textContent = `Detected: ${langName}`;
  detectedBadge.style.display = "inline-block";
}

function hideDetectedBadge() {
  detectedBadge.style.display = "none";
}

// ── MESSAGE BOX ──────────────────────────────────────────────
function showMsg(type, text) {
  msgBoxEl.textContent = text;
  msgBoxEl.className = `msg-box ${type}`;
}

function hideMsg() {
  msgBoxEl.className = "msg-box";
}

// ── TOAST ────────────────────────────────────────────────────
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
}

// ── Start ────────────────────────────────────────────────────
init();