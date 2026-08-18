import { dispatch, sessionFromUrl } from "./harness";
import { buildViewModel, renderGraph } from "./render";
import "./style.css";
import { renderChrome, renderWinCard } from "./ui";

const found = document.querySelector("#app");
if (!(found instanceof HTMLElement)) {
  throw new Error("missing #app");
}
const app: HTMLElement = found;

let session = sessionFromUrl(window.location.search);

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
  paint();
});

paint();
