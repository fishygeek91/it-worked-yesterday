import {
  dispatch,
  isTutorialInput,
  markTutorialDone,
  sessionForVisit,
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
 * Paint chrome and the dungeon map from the current session.
 */
function paint(): void {
  const parts = [renderChrome(session), renderGraph(buildViewModel(session))];
  if (session.outcome === "won") {
    parts.push(renderWinCard(session));
  }
  app.innerHTML = parts.join("");
}

app.addEventListener("click", (event: Event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
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
  session = dispatch(session, command);
  if (session.outcome === "won" && isTutorialInput(session.input)) {
    markTutorialDone(store);
  }
  paint();
});

paint();
