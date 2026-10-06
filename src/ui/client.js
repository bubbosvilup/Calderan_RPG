const conversation = document.querySelector("#conversation");
const form = document.querySelector("#composer");
const input = document.querySelector("#input");
const send = document.querySelector("#send");
const status = document.querySelector("#status");
const error = document.querySelector("#error");
const locationLabel = document.querySelector("#location");
const daypart = document.querySelector("#daypart");
const household = document.querySelector("#household-members");
const latest = document.querySelector("#latest");
let submitting = false;
let ready = false;
let shown = 0;
let poll;
const comparisonViews = new Map();
let pending;
let currentRevision;

// Single unescaped stars delimit narration; double stars remain literal.
// An unfinished narration span stays italic while the next token is pending.
function renderRpg(container, source) {
  const spans = [];
  let narration = false, text = "";
  function flush() {
    if (!text) return;
    const span = document.createElement("span");
    span.className = narration ? "rpg-narration" : "rpg-dialogue";
    span.textContent = text; spans.push(span); text = "";
  }
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\" && source[i + 1] === "*") { text += "*"; i++; }
    else if (source[i] === "*" && source[i + 1] === "*") { text += "**"; i++; }
    else if (source[i] === "*") { flush(); narration = !narration; }
    else text += source[i];
  }
  flush(); container.replaceChildren(...spans);
}
function nearBottom() { return conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 100; }
function follow(wasNear) {
  if (wasNear) conversation.scrollTop = conversation.scrollHeight;
  latest.hidden = nearBottom();
}
conversation.addEventListener("scroll", () => { latest.hidden = nearBottom(); });
latest.addEventListener("click", () => { conversation.scrollTop = conversation.scrollHeight; latest.hidden = true; });
function bubble(role, source) {
  const article = document.createElement("article"); article.className = role;
  const label = document.createElement("span"); label.className = "speaker";
  label.textContent = role === "player" ? "Nicco" : "Narrator";
  const text = document.createElement("div"); text.className = "message-text";
  renderRpg(text, source); article.append(label, text); conversation.append(article);
  return { article, label, text };
}
function clearPending() {
  if (!pending) return;
  pending.player.article.remove(); pending.narrator.article.remove(); pending = undefined;
}
function preview(event) {
  if (!pending) return;
  const wasNear = nearBottom();
  if (event.action === "start") pending.buffer = "";
  else pending.buffer += event.text;
  pending.narrator.label.textContent = event.phase === "revision" ? "Draft · Revising…" : "Draft · Generating…";
  status.textContent = event.phase === "revision" ? "Revising…" : "Generating…";
  renderRpg(pending.narrator.text, pending.buffer); follow(wasNear);
}
function renderScene(data) {
  locationLabel.textContent = data.scene?.location ?? "Caldrevan";
  daypart.textContent = data.scene?.time_of_day ?? "—";
  household.replaceChildren();
  const members = (data.household ?? []).flatMap(group => group.members);
  if (!members.length) {
    const empty = document.createElement("p"); empty.className = "empty-household";
    empty.textContent = "No household members yet."; household.append(empty);
  }
  for (const member of members) {
    const card = document.createElement("div"); card.className = "household-member";
    const name = document.createElement("strong"); name.textContent = member.name;
    const detail = document.createElement("span");
    detail.textContent = member.presence === "present" ? `Present${member.location ? ` · ${member.location}` : ""}` : "Away";
    card.append(name, detail); household.append(card);
  }
}

function showError(text) {
  error.textContent = text;
  error.hidden = !text;
}
function render(data) {
  currentRevision = data.revision;
  const wasNear = nearBottom();
  renderScene(data);
  for (const message of data.messages.slice(shown)) {
    const existing = pending && (message.role === "player" ? pending.player : pending.narrator);
    const { article, label, text } = existing ?? bubble(message.role, message.text);
    if (existing) {
      renderRpg(text, message.text); article.className = message.role;
      label.textContent = message.role === "player" ? "Nicco" : "Narrator";
      article.setAttribute("aria-busy", "false");
    }
    if (message.role === "narrator" && message.comparison_available) {
      const select = document.createElement("select");
      select.className = "regenerate";
      select.setAttribute("aria-label", "Regenerate this narrator message with an alternate model");
      const placeholder = document.createElement("option");
      placeholder.textContent = "Regenerate with…"; placeholder.value = "";
      select.append(placeholder);
      for (const model of data.alternate_models ?? []) {
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
          if (!response.ok || !result.ok) {
            const codes = ["configuration_error", "authentication_error", "rate_limited", "timeout", "cancelled", "provider_unavailable", "invalid_provider_response", "network_error", "model_refusal"];
            feedback.textContent = `Alternative failed${codes.includes(result.failure_code) ? ` (${result.failure_code})` : ""}. Select the model again to retry.`;
            return;
          }
          showAlternatives(alternatives, result.alternatives);
          feedback.textContent = "";
        } catch { feedback.textContent = "Alternative failed. Select the model again to retry."; }
        finally { select.disabled = false; select.value = ""; }
      });
      article.append(select, feedback, alternatives);
    }
  }
  pending = undefined;
  for (const message of data.messages) {
    const view = comparisonViews.get(message.comparison_id);
    if (view) {
      view.select.disabled = !message.comparison_available || view.feedback.textContent === "Generating alternative…";
      if (view.feedback.textContent !== "Generating alternative…") showAlternatives(view.alternatives, message.alternatives ?? []);
    }
  }
  follow(wasNear);
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
    const note = document.createElement("small"); note.textContent = "Comparison only · Does not change the story";
    const text = document.createElement("div"); text.className = "message-text"; renderRpg(text, alternative.text);
    block.append(label, note, text); container.append(block);
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
  if (/^\/location(?:\s|$)/i.test(text)) {
    status.textContent = "Correcting location…";
    try {
      const response = await fetch("/api/location", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: text.replace(/^\/location\s*/i, ""), expected_revision: currentRevision }) });
      const data = await response.json();
      submitting = false;
      if (Array.isArray(data.messages)) render(data);
      if (data.ok) { input.value = ""; status.textContent = data.confirmation; }
      else showError(data.error?.message ?? "Location correction failed.");
    } catch {
      submitting = false;
      showError("Location correction response interrupted. Checking committed state.");
      await load();
    }
    if (ready) input.focus();
    return;
  }
  const wasNear = nearBottom();
  pending = { player: bubble("player", text), narrator: bubble("narrator provisional", ""), buffer: "" };
  pending.narrator.label.textContent = "Draft · Generating…";
  pending.narrator.article.setAttribute("aria-busy", "true");
  follow(wasNear);
  try {
    const response = await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ text }) });
    const data = response.headers?.get("content-type")?.startsWith("application/x-ndjson") ? await readStream(response) : await response.json();
    if (!Array.isArray(data.messages)) throw new Error();
    if (data.ok) input.value = "";
    else {
      clearPending();
      const detail = data.error?.provider_code === "configuration_error" ? "Set OPENROUTER_API_KEY and restart to play." : data.error?.message;
      showError(data.error?.turn_state_changed ? "Turn failed after state changed. Reload to check the session." : `Turn failed. Your message was not applied.${detail ? ` ${detail}` : ""}`);
    }
    submitting = false;
    render(data);
    if (ready) input.focus();
  } catch {
    clearPending();
    submitting = false;
    showError("Connection interrupted. Checking the conversation; the turn may have completed. Review it before sending again.");
    await load();
    if (ready) input.focus();
  }
});
async function readStream(response) {
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", result;
  function lines() {
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "draft") preview(event);
      else if (event.type === "result") result = event;
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }); lines();
    }
    buffer += decoder.decode(); lines();
    if (!result) throw new Error("No finalized result");
    return result;
  } finally { reader.releaseLock(); }
}
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});
void load();
