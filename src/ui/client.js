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
const comparisonViews = new Map();

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
    if (message.role === "narrator" && message.comparison_available) {
      const select = document.createElement("select");
      select.className = "regenerate";
      select.setAttribute("aria-label", "Regenerate this narrator message with an alternate model");
      const placeholder = document.createElement("option");
      placeholder.textContent = "Regenerate with…"; placeholder.value = "";
      select.append(placeholder);
      for (const model of data.alternate_models) {
        const option = document.createElement("option");
        option.textContent = model.label; option.value = model.id; select.append(option);
      }
      const feedback = document.createElement("div");
      feedback.className = "alternative-feedback";
      const alternatives = document.createElement("div");
      alternatives.className = "alternatives";
      comparisonViews.set(message.comparison_id, { select, feedback, alternatives });
      select.addEventListener("change", async () => {
        const model = select.value;
        if (!model || select.disabled) return;
        select.disabled = true; feedback.textContent = "Generating alternative…";
        try {
          const response = await fetch("/api/alternative", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message_id: message.comparison_id, model }) });
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error();
          showAlternatives(alternatives, result.alternatives);
          feedback.textContent = "";
        } catch { feedback.textContent = "Alternative failed. Select the model again to retry."; }
        finally { select.disabled = false; select.value = ""; }
      });
      article.append(select, feedback, alternatives);
    }
    conversation.append(article);
  }
  for (const message of data.messages) {
    const view = comparisonViews.get(message.comparison_id);
    if (view) {
      view.select.disabled = !message.comparison_available || view.feedback.textContent === "Generating alternative…";
      if (view.feedback.textContent !== "Generating alternative…") showAlternatives(view.alternatives, message.alternatives ?? []);
    }
  }
  if (data.messages.length > shown) conversation.scrollTop = conversation.scrollHeight;
  shown = data.messages.length;
  ready = data.status === "idle";
  input.disabled = send.disabled = submitting || !ready;
  status.textContent = data.status === "closed" ? "Session ended." : submitting || !ready ? "Generating…" : data.configured ? "Your turn." : "Set OPENROUTER_API_KEY and restart to play.";
  clearTimeout(poll);
  if (!ready && data.status !== "closed" && !submitting) poll = setTimeout(load, 1000);
}
function showAlternatives(container, alternatives) {
  container.replaceChildren();
  for (const alternative of alternatives) {
    const block = document.createElement("section"); block.className = "alternative";
    const label = document.createElement("span"); label.className = "speaker";
    label.textContent = `Alternative · ${alternative.label}`;
    const text = document.createElement("div"); text.textContent = alternative.text;
    block.append(label, text); container.append(block);
  }
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
