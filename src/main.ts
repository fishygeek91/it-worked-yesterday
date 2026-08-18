import { GameError } from "./core/errors";
import {
  createSession,
  dispatch,
  importCase,
  isImportInput,
  isTutorialDone,
  isTutorialInput,
  markTutorialDone,
  visitForSearch,
  type GameSession,
  type SessionCommand,
  type TutorialStore,
} from "./harness";
import { buildViewModel, renderGraph } from "./render";
import "./style.css";
import {
  cueForCommand,
  encodeGif,
  FINAL_DELAY_CS,
  FRAME_DELAY_CS,
  gifFileName,
  learnWalkNext,
  learnWalkStart,
  playCue,
  quantizeFrame,
  renderBadUrl,
  renderChrome,
  renderLearn,
  renderWinCard,
  renderWinCardSvg,
  shareQuery,
  shareText,
  svgPixelSize,
  winCardFileName,
  winFrameSvgs,
  type QuantizedFrame,
} from "./ui";

const found = document.querySelector("#app");
if (!(found instanceof HTMLElement)) {
  throw new Error("missing #app");
}
const app: HTMLElement = found;

const store: TutorialStore = {
  get: (key) => window.localStorage.getItem(key),
  set: (key, value) => {
    window.localStorage.setItem(key, value);
  },
};

/**
 * Boot result. Learn is a case file with its own demonstration walk.
 * Invalid shares stay a postmortem; they are not coerced.
 */
type Boot =
  | { kind: "play"; session: GameSession }
  | { kind: "learn"; walk: GameSession }
  | { kind: "bad-url"; error: GameError };

/**
 * Route a visit or keep the parser failure for the desk.
 *
 * @param search - Location search
 */
function bootVisit(search: string): Boot {
  try {
    const visit = visitForSearch(search, store);
    if (visit.kind === "learn") {
      return { kind: "learn", walk: learnWalkStart() };
    }
    return { kind: "play", session: visit.session };
  } catch (error) {
    if (error instanceof GameError && error.code === "INVALID_URL") {
      return { kind: "bad-url", error };
    }
    throw error;
  }
}

let boot = bootVisit(window.location.search);

/**
 * Help `<details>` state for this page load. Not `localStorage`.
 */
let helpOpen = false;

/**
 * Sound latch for this page load. Muted by default; page memory only.
 */
let soundOn = false;

/**
 * Created on the unmute gesture, never on load. No autoplay surprise.
 */
let audio: AudioContext | null = null;

/**
 * Postmortem line for the last refused import. Page memory only.
 */
let importNote: string | null = null;

/**
 * Map a key to a session command. Letters only; no modifiers.
 *
 * @param key - event.key
 */
function commandFromKey(key: string): SessionCommand | null {
  const letter = key.length === 1 ? key.toLowerCase() : key;
  if (letter === "g") {
    return "good";
  }
  if (letter === "b") {
    return "bad";
  }
  if (letter === "l") {
    return "blame";
  }
  if (letter === "a") {
    return "accuse";
  }
  if (letter === "r") {
    return "reset";
  }
  return null;
}

/**
 * Run one command, persist a tutorial win, and repaint.
 *
 * @param command - Command name
 */
function applyCommand(command: string): void {
  if (boot.kind !== "play") {
    return;
  }
  boot = { kind: "play", session: dispatch(boot.session, command) };
  if (boot.session.outcome === "won" && isTutorialInput(boot.session.input)) {
    markTutorialDone(store);
  }
  if (soundOn && audio !== null) {
    const cue = cueForCommand(command, boot.session);
    if (cue !== null) {
      playCue(audio, cue);
    }
  }
  paint();
}

/**
 * Paint the dungeon first, then the desk. Win card last.
 */
function paint(): void {
  if (boot.kind === "bad-url") {
    document.documentElement.dataset.outcome = "invalid";
    document.title = "invalid url — it-worked-yesterday";
    app.innerHTML = renderBadUrl(boot.error, { tutorialDone: isTutorialDone(store) });
    return;
  }
  if (boot.kind === "learn") {
    document.documentElement.dataset.outcome = "learn";
    document.title = "learn — it-worked-yesterday";
    app.innerHTML = renderLearn(boot.walk);
    return;
  }
  const session = boot.session;
  const remaining = session.bisect.suspects.length;
  document.documentElement.dataset.outcome = session.outcome;
  if (session.outcome !== "playing") {
    document.title = "accused — it-worked-yesterday";
  } else if (remaining === 1) {
    document.title = "accuse — it-worked-yesterday";
  } else {
    document.title = `${String(remaining)} suspects — it-worked-yesterday`;
  }
  const parts = [
    `<div id="map">${renderGraph(buildViewModel(session))}</div>`,
    renderChrome(session, {
      tutorialDone: isTutorialDone(store),
      helpOpen,
      soundOn,
      importNote: importNote ?? undefined,
    }),
  ];
  if (session.outcome === "won") {
    parts.push(renderWinCard(session));
  }
  app.innerHTML = parts.join("");
  const head = app.querySelector("[data-label=\"HEAD\"]");
  if (head instanceof Element) {
    head.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }
  const help = app.querySelector(".help");
  if (help instanceof HTMLDetailsElement) {
    help.addEventListener("toggle", () => {
      helpOpen = help.open;
    });
  }
}

/**
 * Flash a copy control. SHA stays a SHA; the share button says copied.
 *
 * @param copy - Element with data-copy
 */
function flashCopied(copy: HTMLElement): void {
  copy.classList.add("is-copied");
  const prior = copy.textContent;
  if (copy.classList.contains("copy")) {
    copy.textContent = "copied";
  }
  window.setTimeout(() => {
    if (!copy.isConnected) {
      return;
    }
    copy.classList.remove("is-copied");
    if (copy.classList.contains("copy")) {
      copy.textContent = prior === "copied" ? "copy" : prior;
    }
  }, 900);
}

/**
 * Absolute share link for this page. The origin is page state, not seed
 * state, so it lives here and not in the pure chrome.
 *
 * @param session - Finished winning session
 */
function shareLink(session: GameSession): string {
  return `${window.location.origin}${window.location.pathname}${shareQuery(session)}`;
}

/**
 * Rasterize the standalone win-card SVG to a 1200×630 PNG and download it.
 * The SVG has no external references, so the canvas stays untainted.
 *
 * @param session - Finished winning session
 */
function saveCardPng(session: GameSession): void {
  const svg = renderWinCardSvg(session);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext("2d");
    if (context === null) {
      URL.revokeObjectURL(svgUrl);
      return;
    }
    context.drawImage(image, 0, 0, 1200, 630);
    URL.revokeObjectURL(svgUrl);
    canvas.toBlob((png) => {
      if (png === null) {
        return;
      }
      const pngUrl = URL.createObjectURL(png);
      const anchor = document.createElement("a");
      anchor.href = pngUrl;
      anchor.download = winCardFileName(session);
      anchor.click();
      // Revoke after the click has been consumed by the download.
      window.setTimeout(() => {
        URL.revokeObjectURL(pngUrl);
      }, 1000);
    }, "image/png");
  };
  image.onerror = () => {
    URL.revokeObjectURL(svgUrl);
  };
  image.src = svgUrl;
}

/**
 * Rasterize one frame SVG at its native pixel size. The SVG has no
 * external references, so the canvas stays untainted and readable.
 *
 * @param svg - One dungeon-map SVG document
 * @param width - Raster width in pixels
 * @param height - Raster height in pixels
 */
function rasterizeSvg(svg: string, width: number, height: number): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (context === null) {
        reject(new Error("no 2d canvas"));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(context.getImageData(0, 0, width, height).data);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("frame svg failed to load"));
    };
    image.src = url;
  });
}

/**
 * Build and download the win GIF: replay the transcript into frame SVGs,
 * rasterize each, quantize to ≤256 colors, and encode with our GIF89a
 * writer. Never touches the session — the clock does not move.
 *
 * @param session - Finished winning session
 */
async function saveWinGif(session: GameSession): Promise<void> {
  const svgs = winFrameSvgs(session);
  const first = svgs[0];
  if (first === undefined) {
    return;
  }
  const { width, height } = svgPixelSize(first);
  const frames: QuantizedFrame[] = [];
  for (let at = 0; at < svgs.length; at += 1) {
    const svg = svgs[at];
    if (svg === undefined) {
      continue;
    }
    const rgba = await rasterizeSvg(svg, width, height);
    const delay = at === svgs.length - 1 ? FINAL_DELAY_CS : FRAME_DELAY_CS;
    frames.push(quantizeFrame(rgba, width, height, delay));
  }
  const gif = new Blob([encodeGif(frames, width, height).slice().buffer], { type: "image/gif" });
  const gifUrl = URL.createObjectURL(gif);
  const anchor = document.createElement("a");
  anchor.href = gifUrl;
  anchor.download = gifFileName(session);
  anchor.click();
  // Revoke after the click has been consumed by the download.
  window.setTimeout(() => {
    URL.revokeObjectURL(gifUrl);
  }, 1000);
}

app.addEventListener("click", (event: Event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const shareResult = target.closest("[data-share-result]");
  if (shareResult instanceof HTMLElement) {
    if (boot.kind === "play" && boot.session.outcome === "won") {
      // Imported cases have no URL, so the result line travels alone.
      const text = isImportInput(boot.session.input)
        ? shareText(boot.session)
        : `${shareText(boot.session)}\n${shareLink(boot.session)}`;
      if (navigator.clipboard !== undefined) {
        void navigator.clipboard.writeText(text);
      }
      flashCopied(shareResult);
    }
    return;
  }
  const saveCard = target.closest("[data-save-card]");
  if (saveCard instanceof HTMLElement) {
    if (boot.kind === "play" && boot.session.outcome === "won") {
      saveCardPng(boot.session);
    }
    return;
  }
  const saveGif = target.closest("[data-save-gif]");
  if (saveGif instanceof HTMLElement) {
    if (boot.kind === "play" && boot.session.outcome === "won") {
      void saveWinGif(boot.session);
    }
    return;
  }
  const latch = target.closest("[data-sound]");
  if (latch instanceof HTMLElement) {
    // The latch is not a command: no dispatch, no cost, no clock.
    soundOn = !soundOn;
    if (soundOn && audio === null) {
      audio = new AudioContext();
    }
    paint();
    return;
  }
  // A room click is the v2.1 penalty walk. Clicking the room the lantern
  // already occupies is not a walk, so it stays free.
  const room = target.closest("[data-sha]");
  if (room instanceof Element && room.closest("#map") !== null) {
    if (boot.kind === "play" && boot.session.outcome === "playing") {
      const sha = room.getAttribute("data-sha");
      if (sha !== null && sha !== boot.session.bisect.current) {
        applyCommand(`checkout ${sha}`);
      }
    }
    return;
  }
  const copy = target.closest("[data-copy]");
  if (copy instanceof HTMLElement) {
    const text = copy.getAttribute("data-copy");
    if (text !== null && navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(text);
    }
    flashCopied(copy);
    return;
  }
  const learnButton = target.closest("[data-learn]");
  if (learnButton instanceof HTMLButtonElement && !learnButton.disabled) {
    if (boot.kind !== "learn") {
      return;
    }
    const step = learnButton.getAttribute("data-learn");
    boot = {
      kind: "learn",
      walk: step === "reset" ? learnWalkStart() : learnWalkNext(boot.walk),
    };
    paint();
    return;
  }
  const button = target.closest("[data-command]");
  if (!(button instanceof HTMLButtonElement) || button.disabled) {
    return;
  }
  const command = button.getAttribute("data-command");
  if (command === null) {
    return;
  }
  applyCommand(command);
});

/**
 * Start the chosen fast-export file as an imported case, or keep the
 * refusal as a postmortem line on the desk. Parsed here in the browser;
 * nothing leaves the page.
 *
 * @param file - The chosen export file
 */
async function startImport(file: File): Promise<void> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const input = importCase(bytes);
    boot = { kind: "play", session: createSession(input) };
    importNote = null;
  } catch (error) {
    if (error instanceof GameError) {
      importNote = error.message;
    } else {
      importNote = "that file could not be read";
    }
  }
  paint();
}

app.addEventListener("change", (event: Event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.getAttribute("data-import") === null) {
    return;
  }
  const file = target.files === null ? undefined : target.files[0];
  if (file === undefined) {
    return;
  }
  void startImport(file);
});

window.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }
  if (event.key === "Escape") {
    const help = app.querySelector(".help");
    if (help instanceof HTMLDetailsElement && help.open) {
      help.open = false;
      helpOpen = false;
      event.preventDefault();
    }
    return;
  }
  if (event.key === "?" || event.key === "/") {
    const help = app.querySelector(".help");
    if (help instanceof HTMLDetailsElement) {
      help.open = !help.open;
      helpOpen = help.open;
      event.preventDefault();
    }
    return;
  }
  const command = commandFromKey(event.key);
  if (command === null) {
    return;
  }
  const button = app.querySelector(`[data-command="${command}"]`);
  if (!(button instanceof HTMLButtonElement) || button.disabled) {
    return;
  }
  event.preventDefault();
  applyCommand(command);
});

paint();
