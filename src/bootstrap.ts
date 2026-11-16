import init, { start_app } from "../generated/app/app.js";
import workerUrl from "./workerBootstrap.ts?worker&url";
import "./styles.css";

try {
  await init();
  start_app("root", workerUrl);
} catch (error) {
  const root = document.getElementById("root")!;
  root.replaceChildren();
  const panel = document.createElement("section");
  panel.className = "startup-error";
  const title = document.createElement("h1");
  title.textContent = "Jungle could not start";
  const details = document.createElement("p");
  details.textContent = `Start the included localhost launcher and open its URL. If the problem persists, extract the complete release ZIP again. ${error instanceof Error ? error.message : String(error)}`;
  const retry = document.createElement("button");
  retry.className = "menu-btn";
  retry.textContent = "Retry";
  retry.addEventListener("click", () => location.reload());
  panel.append(title, details, retry);
  root.append(panel);
}
