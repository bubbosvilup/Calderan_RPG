const conversation = document.querySelector("#conversation");
const form = document.querySelector("#composer");
const input = document.querySelector("#input");
const send = document.querySelector("#send");
const status = document.querySelector("#status");
const error = document.querySelector("#error");
let submitting = false;
let ready = false;
let shown = 0;
let poll;

function showError(text) {
  error.textContent = text;
  error.hidden = !text;
}
function render(data) {
  for (const message of data.messages.slice(shown)) {
    const article = document.createElement("article");
    article.className = message.role;
    const label = document.createElement("span");
    label.className = "speaker";
    label.textContent = message.role === "player" ? "Nicco" : "Narrator";
    const text = document.createElement("div");
    text.textContent = message.text;
    article.append(label, text);
    conversation.append(article);
  }
  if (data.messages.length > shown) conversation.scrollTop = conversation.scrollHeight;
  shown = data.messages.length;
  ready = data.status === "idle";
  input.disabled = send.disabled = submitting || !ready;
  status.textContent = data.status === "closed" ? "Session ended." : submitting || !ready ? "Generating…" : data.configured ? "Your turn." : "Set OPENROUTER_API_KEY and restart to play.";
  clearTimeout(poll);
  if (!ready && data.status !== "closed" && !submitting) poll = setTimeout(load, 1000);
}
async function load() {
  try {
    const response = await fetch("/api/session");
    if (!response.ok) throw new Error();
    render(await response.json());
  } catch {
    ready = false;
    input.disabled = send.disabled = true;
    status.textContent = "Disconnected.";
    showError("Cannot reach the playtest. Check that npm run play:ui is running, then reload.");
  }
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || submitting || !ready) return;
  submitting = true;
  clearTimeout(poll);
  input.disabled = send.disabled = true;
  status.textContent = "Generating…";
  showError("");
  try {
    const response = await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const data = await response.json();
    if (!Array.isArray(data.messages)) throw new Error();
    if (data.ok) input.value = "";
    else {
      const detail = data.error?.provider_code === "configuration_error" ? "Set OPENROUTER_API_KEY and restart to play." : data.error?.message;
      showError(data.error?.turn_state_changed ? "Turn failed after state changed. Reload to check the session." : `Turn failed. Your message was not applied.${detail ? ` ${detail}` : ""}`);
    }
    submitting = false;
    render(data);
    if (ready) input.focus();
  } catch {
    submitting = false;
    showError("Connection interrupted. Checking the conversation; the turn may have completed. Review it before sending again.");
    await load();
  }
});
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});
void load();
