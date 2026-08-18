import { GameError } from "./core/errors";
import { indexOfSha } from "./core/git";
import {
  dispatch,
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
  learnWalkNext,
  learnWalkStart,
  renderBadUrl,
  renderChrome,
  renderLearn,
  renderWinCard,
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
  const lo = indexOfSha(session.bisect.repo, session.bisect.knownGood);
  const hi = indexOfSha(session.bisect.repo, session.bisect.knownBad);
  const remaining = hi - lo;
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
    renderChrome(session, { tutorialDone: isTutorialDone(store), helpOpen }),
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

app.addEventListener("click", (event: Event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
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
