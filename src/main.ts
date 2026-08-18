import { indexOfSha } from "./core/git";
import {
  dispatch,
  isTutorialDone,
  isTutorialInput,
  markTutorialDone,
  sessionForVisit,
  type SessionCommand,
  type TutorialStore,
} from "./harness";
import { buildViewModel, renderGraph } from "./render";
import "./style.css";
import { renderChrome, renderWinCard } from "./ui";

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

let session = sessionForVisit(window.location.search, store);

/**
 * Map a key to a v1 command. Letters only; no modifiers.
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
 * @param command - v1 command name
 */
function applyCommand(command: string): void {
  session = dispatch(session, command);
  if (session.outcome === "won" && isTutorialInput(session.input)) {
    markTutorialDone(store);
  }
  paint();
}

/**
 * Paint the dungeon first, then the desk. Win card last.
 */
function paint(): void {
  const lo = indexOfSha(session.bisect.repo, session.bisect.knownGood);
  const hi = indexOfSha(session.bisect.repo, session.bisect.knownBad);
  const remaining = hi - lo;
  document.documentElement.dataset.outcome = session.outcome;
  document.title =
    remaining === 1
      ? "accuse — it-worked-yesterday"
      : `${String(remaining)} suspects — it-worked-yesterday`;
  const parts = [
    `<div id="map">${renderGraph(buildViewModel(session))}</div>`,
    renderChrome(session, { tutorialDone: isTutorialDone(store) }),
  ];
  if (session.outcome === "won") {
    parts.push(renderWinCard(session));
  }
  app.innerHTML = parts.join("");
  const head = app.querySelector("[data-label=\"HEAD\"]");
  if (head instanceof Element) {
    head.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }
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
  if (event.key === "?" || event.key === "/") {
    const help = app.querySelector(".help");
    if (help instanceof HTMLDetailsElement) {
      help.open = !help.open;
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
