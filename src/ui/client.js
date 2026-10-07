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
const ui = id => document.querySelector(`#${id}`);
let selectedCharacter, returnFocus;
let activeView = "play", householdFilter = "all", editorRef, householdLoaded = false;
const householdCharacters = new Map();
function switchView(view) {
  activeView = view;
  closeCharacter();
  for (const [key, id] of [["play", "play-view"], ["household", "household-view"], ["editor", "member-editor"]]) if (ui(id)) ui(id).hidden = key !== view;
  ui("household-nav")?.setAttribute("aria-pressed", String(view !== "play"));
  if (view === "household") ui("household-close")?.focus();
  else if (view === "play") ui("household-nav")?.focus();
}
// Permanent Appearance V1 editor. Inputs show only stored campaign overrides; inherited/baseline values are notes, never prefilled,
// so saving never copies them into the profile. Inputs are filled on open and after a committed save only (a state refresh keeps
// unsaved edits). Empty input on a stored override = explicit clear (null); empty input without one = unchanged.
let editorRevision, editorFields = [], editorSaving = false;
function openEditor(ref) {
  const card = householdCharacters.get(ref);
  if (!card?.appearance_editor_eligible || !card.npc_plus || !card.household) return;
  editorRef = ref;
  switchView("editor");
  renderEditor(card, true);
  ui("editor-back")?.focus();
}
function editorValue(field, raw) {
  const value = String(raw ?? "");
  if (field.kind === "lines") return value.split("\n").map(line => line.trim()).filter(Boolean);
  if (field.kind === "number") return value.trim() === "" ? "" : Number(value.trim());
  return value.trim().replace(/\s+/g, " ");
}
const NUMBER_RANGES = { height_cm: [30, 300, "cm"], weight_kg: [1, 500, "kg"] };
function editorPatch() {
  const patch = {}, invalid = [];
  for (const field of editorFields) {
    const input = ui(`appearance-${field.key}`);
    if (!input) continue;
    const next = editorValue(field, input.value), stored = field.override === null ? null : editorValue(field, field.override);
    const empty = Array.isArray(next) ? !next.length : next === "";
    const range = NUMBER_RANGES[field.key];
    if (field.kind === "number" && !empty && (!Number.isInteger(next) || (range && (next < range[0] || next > range[1])))) { invalid.push(field.key); continue; }
    if (empty) { if (stored !== null) patch[field.key] = null; continue; }
    if (JSON.stringify(next) !== JSON.stringify(stored)) patch[field.key] = next;
  }
  return { patch, valid: !invalid.length, invalid };
}
// Saved values are what the field holds; inherited text is reference only. Unset fields say nothing (their placeholder is "Not set").
function editorNote(field) {
  if (field.override !== null) return { text: field.inherited ? "Saved value. Empty it to return to the inherited description." : "Saved value. Empty it to clear.", kind: "field-saved" };
  return { text: field.inherited ? `Inherited (not saved): ${field.inherited}` : "", kind: "" };
}
function updateEditorSave() {
  const { patch, valid, invalid } = editorPatch();
  for (const field of editorFields) {
    const input = ui(`appearance-${field.key}`), note = ui(`appearance-${field.key}-note`), range = NUMBER_RANGES[field.key];
    if (!input || field.kind !== "number") continue;
    const bad = invalid.includes(field.key), base = editorNote(field);
    if (bad) input.setAttribute("aria-invalid", "true"); else input.removeAttribute?.("aria-invalid");
    if (note) { note.textContent = bad ? `Enter a whole number from ${range[0]} to ${range[1]} ${range[2]}.` : base.text; note.className = bad ? "field-error" : base.kind; }
  }
  if (ui("editor-save")) ui("editor-save").disabled = editorSaving || !valid || !Object.keys(patch).length;
}
function renderEditor(card, fill = false) {
  if (!ui("editor-name")) return;
  ui("editor-name").textContent = card.name;
  ui("editor-initial").textContent = card.name_known ? card.name.slice(0, 1) : "?";
  ui("editor-appearance").textContent = card.appearance;
  const editor = card.appearance_editor;
  // Committed-only preview: the prompt is server-built from saved appearance (no client-side resolver copy), so it is safe to
  // refresh on every render; it never touches the editable inputs.
  if (ui("editor-image-prompt")) ui("editor-image-prompt").value = editor?.portrait_prompt?.prompt ?? "";
  if (ui("editor-negative-prompt")) ui("editor-negative-prompt").value = editor?.portrait_prompt?.negative_prompt ?? "";
  if (fill) showPortraitError("");
  renderPortrait(editor);
  if (ui("editor-identity")) ui("editor-identity").textContent = editor?.identity?.length ? editor.identity.map(i => `${i.label}: ${i.value}`).join(" · ") : "No established species, sex or age.";
  if (fill) {
    editorRevision = currentRevision;
    editorFields = editor?.fields ?? [];
    if (ui("editor-error")) { ui("editor-error").textContent = ""; ui("editor-error").hidden = true; }
    for (const field of editorFields) {
      const input = ui(`appearance-${field.key}`), note = ui(`appearance-${field.key}-note`);
      if (input) { input.value = field.override ?? ""; input.disabled = false; }
      if (note) { const n = editorNote(field); note.textContent = n.text; note.className = n.kind; }
    }
  }
  updateEditorSave();
}
async function saveEditor() {
  const { patch, valid } = editorPatch();
  if (!editorRef || editorSaving || !valid || !Object.keys(patch).length) return;
  editorSaving = true; updateEditorSave();
  const showEditorError = text => { const el = ui("editor-error"); if (el) { el.textContent = text; el.hidden = !text; if (text) el.scrollIntoView?.({ block: "center" }); } };
  try {
    const response = await fetch("/api/appearance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: editorRef, expected_revision: editorRevision, patch }) });
    const data = await response.json();
    editorSaving = false;
    if (data?.messages) render(data);
    if (data?.ok) {
      const card = householdCharacters.get(editorRef);
      if (card && activeView === "editor") renderEditor(card, true);
      showEditorError("");
    } else showEditorError(data?.error?.message ?? "The appearance was not saved.");
  } catch { editorSaving = false; showEditorError("The appearance was not saved. Check the connection and try again."); }
  updateEditorSave();
}
ui("editor-save")?.addEventListener("click", () => saveEditor());
// Portrait Image Generation V1. Generation is an explicit click (it costs money); the browser sends only the opaque ref and the
// revision the editor opened with. The shown portrait is always the committed one: nothing optimistic, nothing on open.
let portraitBusy = false;
function showPortraitError(text) { const el = ui("portrait-error"); if (el) { el.textContent = text; el.hidden = !text; } }
function renderPortrait(editor) {
  const portrait = editor?.portrait, image = ui("editor-portrait-image");
  if (image) {
    if (portrait?.url) { if (image.getAttribute?.("src") !== portrait.url) image.setAttribute("src", portrait.url); image.hidden = false; }
    else image.hidden = true;
  }
  if (ui("editor-initial")) ui("editor-initial").hidden = !!portrait?.url;
  if (ui("editor-portrait-label")) ui("editor-portrait-label").hidden = !!portrait?.url;
  if (ui("editor-portrait-status")) ui("editor-portrait-status").textContent = portraitBusy ? "Generating portrait…" : !portrait?.available ? "No portrait yet"
    : portrait.stale ? "Appearance changed since this portrait was generated." : "";
  if (ui("portrait-generate")) { ui("portrait-generate").textContent = portraitBusy ? "Generating…" : portrait?.available ? "Regenerate" : "Generate portrait"; ui("portrait-generate").disabled = portraitBusy || !editor; }
  if (ui("portrait-reference")) { ui("portrait-reference").textContent = portrait?.reference_attached ? "Replace reference" : "Reference"; ui("portrait-reference").disabled = portraitBusy || !editor; }
  if (ui("portrait-reference-remove")) ui("portrait-reference-remove").hidden = !portrait?.reference_attached || portraitBusy;
  if (ui("portrait-meta")) ui("portrait-meta").textContent = [portrait?.available ? `Portrait ${portrait.version_number} of ${portrait.version_count}` : "", portrait?.model_label ?? "",
    portrait?.reference_attached ? "Reference attached" : ""].filter(Boolean).join(" · ");
}
async function portraitRequest(url, body) {
  if (!editorRef || portraitBusy) return;
  portraitBusy = true; showPortraitError("");
  const card = householdCharacters.get(editorRef); renderPortrait(card?.appearance_editor);
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: editorRef, expected_revision: editorRevision, ...body }) });
    const data = await response.json();
    portraitBusy = false;
    if (data?.messages) render(data);
    // A committed portrait or reference never touches appearance: unsaved form edits stay valid at the new revision.
    if (data?.ok) { if (data.changed) editorRevision = currentRevision; showPortraitError(""); }
    else showPortraitError(data?.error?.message ?? "The portrait was not generated.");
  } catch { portraitBusy = false; showPortraitError("The portrait request failed. Check the connection and try again."); }
  renderPortrait(householdCharacters.get(editorRef)?.appearance_editor);
}
ui("portrait-generate")?.addEventListener("click", () => portraitRequest("/api/portrait/generate", {}));
ui("portrait-reference")?.addEventListener("click", () => { if (!portraitBusy) ui("portrait-reference-file")?.click?.(); });
ui("portrait-reference-remove")?.addEventListener("click", () => portraitRequest("/api/portrait/reference", { image: null }));
ui("portrait-reference-file")?.addEventListener("change", () => {
  const input = ui("portrait-reference-file"), file = input?.files?.[0];
  if (!file) return;
  input.value = "";
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) { showPortraitError("Choose a PNG, JPEG or WebP image of at most 4 MB."); return; }
  const reader = new FileReader();
  reader.onload = () => portraitRequest("/api/portrait/reference", { image: { data_base64: String(reader.result).replace(/^data:[^,]*,/, "") } });
  reader.onerror = () => showPortraitError("The image could not be read.");
  reader.readAsDataURL(file);
});
for (const key of ["height_cm", "weight_kg", "build", "skin", "hair_color", "hair_texture", "hair_description", "eyes", "scars", "distinguishing_marks", "distinctive_traits", "description"])
  ui(`appearance-${key}`)?.addEventListener("input", () => updateEditorSave());
function renderHousehold() {
  if (!ui("household-cards")) return;
  const members = [...householdCharacters.values()];
  const here = members.filter(c => c.presence === "present").length;
  ui("household-totals").textContent = `${members.length} members · ${here} here with you · ${members.length - here} elsewhere`;
  for (const [key, id] of [["all", "filter-all"], ["here", "filter-here"], ["elsewhere", "filter-elsewhere"]]) ui(id)?.setAttribute("aria-pressed", String(key === householdFilter));
  ui("household-cards").replaceChildren();
  if (!householdLoaded) {
    ui("household-totals").textContent = "Waiting for committed household state.";
    const waiting = document.createElement("p"); waiting.className = "household-empty"; waiting.textContent = "Household data is not available yet.";
    ui("household-cards").append(waiting); return;
  }
  const visible = members.filter(c => householdFilter === "all" || (c.presence === "present" ? "here" : "elsewhere") === householdFilter);
  if (!visible.length) {
    const empty = document.createElement("p"); empty.className = "household-empty";
    empty.textContent = !members.length ? "No household members yet." : "No members in this view.";
    ui("household-cards").append(empty);
  }
  for (const card of visible) {
    const article = document.createElement("article"); article.className = "household-large-card";
    const body = document.createElement("button"); body.className = "household-card-body"; body.setAttribute("type", "button"); body.setAttribute("aria-haspopup", "dialog");
    body.setAttribute("aria-label", `View ${card.name}`);
    const portrait = document.createElement("div"); portrait.className = "portrait member-portrait";
    const initial = document.createElement("strong"); initial.textContent = card.name_known ? card.name.slice(0, 1) : "?";
    const presence = document.createElement("span"); presence.className = "presence-badge"; presence.textContent = card.presence === "present" ? "Here" : "Elsewhere";
    // Portrait Image Generation V1: the active portrait replaces the initial when one exists.
    if (card.portrait_url) { const image = document.createElement("img"); image.className = "portrait-image"; image.setAttribute("alt", ""); image.setAttribute("src", card.portrait_url); portrait.append(image, presence); }
    else portrait.append(initial, presence);
    const info = document.createElement("div"); info.className = "member-card-info";
    const name = document.createElement("h2"); name.textContent = card.name; info.append(name);
    if (card.npc_plus) { const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = "NPC+"; info.append(badge); }
    if (card.role && card.role !== "Not known") { const role = document.createElement("p"); role.className = "member-role"; role.textContent = card.role; info.append(role); }
    const details = document.createElement("dl");
    for (const [label, value] of [["Where", card.known_location ?? "Elsewhere"], ["With you", card.relationship === "Not recorded" ? null : card.relationship]]) if (value) {
      const term = document.createElement("dt"), detail = document.createElement("dd"); term.textContent = label; detail.textContent = value; details.append(term, detail);
    }
    info.append(details);
    if (card.state && card.state !== "Not recorded") { const condition = document.createElement("span"); condition.className = "badge condition"; condition.textContent = card.state; info.append(condition); }
    body.append(portrait, info);
    body.addEventListener("click", () => openCharacter({ ref: card.ref, name: card.name, name_known: card.name_known, card }, body));
    if (selectedCharacter === card.ref && returnFocus?.className === "household-card-body") returnFocus = body;
    article.append(body);
    if (card.appearance_editor_eligible && card.npc_plus && card.household) {
      const edit = document.createElement("button"); edit.className = "member-edit"; edit.setAttribute("type", "button"); edit.setAttribute("aria-label", `Edit ${card.name}`); edit.textContent = "Edit";
      edit.addEventListener("click", () => openEditor(card.ref)); article.append(edit);
    }
    ui("household-cards").append(article);
  }
}
ui("household-nav")?.addEventListener("click", () => { editorRef = undefined; switchView("household"); renderHousehold(); });
ui("household-close")?.addEventListener("click", () => switchView("play"));
for (const key of ["all", "here", "elsewhere"]) ui(`filter-${key}`)?.addEventListener("click", () => { householdFilter = key; renderHousehold(); });
for (const id of ["editor-back", "editor-cancel"]) ui(id)?.addEventListener("click", () => { editorRef = undefined; switchView("household"); });
function characterTab(tab) {
  for (const key of ["appearance", "story"]) {
    ui(`${key}-tab`)?.setAttribute("aria-selected", String(key === tab));
    if (ui(`${key}-panel`)) ui(`${key}-panel`).hidden = key !== tab;
  }
}
for (const tab of ["appearance", "story"]) ui(`${tab}-tab`)?.addEventListener("click", () => characterTab(tab));
function closeCharacter() {
  if (ui("character-overlay")) ui("character-overlay").hidden = true;
  selectedCharacter = undefined;
  if (returnFocus?.isConnected === false) input.focus(); else returnFocus?.focus();
}
function openCharacter(person, trigger) {
  if (!person.card || !ui("character-overlay")) return;
  selectedCharacter = person.ref;
  if (trigger) returnFocus = trigger;
  const card = person.card;
  if (trigger) characterTab("appearance");
  for (const field of ["name", "role", "relationship", "state", "where", "appearance"]) ui(`character-${field}`).textContent = card[field];
  const details = {
    "public-profile": Object.entries(card.public_profile ?? {}).filter(([key, value]) => value && !["appearance", "occupation"].includes(key)).map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`).join(" · "),
    summary: card.public_summary ?? "No public summary recorded.",
    facts: (card.story_facts ?? []).map(f => `${f.status === "knows" ? "Known" : f.status.replace(/_/g, " ")}: ${f.text}`).join("\n\n") || "No learned story facts recorded.",
    history: (card.history ?? []).map(h => `${h.source}: ${h.text}`).join("\n\n") || "No known history recorded.",
    observations: (card.observations ?? []).join("\n\n") || "No recognized observations recorded.",
    boundary: card.knowledge_boundary ?? "Only what Nicco knows.",
  };
  for (const [field, value] of Object.entries(details)) if (ui(`character-${field}`)) ui(`character-${field}`).textContent = value;
  ui("portrait-initial").textContent = person.name_known === false || person.category === "Name unknown" ? "?" : card.name.slice(0, 1);
  ui("character-affiliations").textContent = card.affiliations.length ? card.affiliations.join(" · ") : "None known.";
  ui("character-badges").replaceChildren();
  for (const label of [card.household ? "Household" : "", card.npc_plus ? "NPC+" : ""].filter(Boolean)) {
    const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = label; ui("character-badges").append(badge);
  }
  ui("character-overlay").hidden = false;
  if (trigger) ui("character-close").focus();
}
ui("character-close")?.addEventListener("click", closeCharacter);
ui("character-backdrop")?.addEventListener("click", closeCharacter);
ui("character-drawer")?.addEventListener("keydown", event => {
  if (event.key === "Escape") { event.preventDefault(); closeCharacter(); }
  if (event.key === "Tab") {
    event.preventDefault(); const controls = [ui("character-close"), ui("appearance-tab"), ui("story-tab")].filter(Boolean);
    const at = controls.indexOf(event.target); controls[(at + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
  }
});

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
  householdCharacters.clear();
  householdLoaded = Array.isArray(data.play?.household);
  for (const card of data.play?.household?.flatMap(g => g.members) ?? []) householdCharacters.set(card.ref, card);
  if (ui("household-title")) ui("household-title").textContent = data.play?.household_title ?? "Household";
  renderHousehold();
  if (activeView === "editor") {
    const card = householdCharacters.get(editorRef);
    if (card?.appearance_editor_eligible && card.npc_plus && card.household) renderEditor(card, false);
    else { editorRef = undefined; switchView("household"); }
  }
  locationLabel.textContent = data.scene?.location ?? "Caldrevan";
  daypart.textContent = data.scene?.time_of_day ?? "—";
  if (ui("day")) ui("day").textContent = Number.isInteger(data.play?.day) ? ` · Day ${data.play.day}` : "";
  if (ui("location-id")) ui("location-id").textContent = data.scene?.location_id ?? "";
  if (ui("gold")) ui("gold").textContent = typeof data.play?.gold === "number" ? String(data.play.gold) : "Not tracked";
  const people = data.play?.participants ?? [];
  if (ui("present-count")) ui("present-count").textContent = `${people.length} present`;
  if (ui("scene-participants")) {
    ui("scene-participants").replaceChildren();
    for (const person of people) {
      const entry = document.createElement(person.card ? "button" : "div"); entry.className = "scene-participant";
      const unknown = person.name_known === false || person.category === "Name unknown";
      const avatar = document.createElement("span"); avatar.className = `avatar ${person.ref === "player" ? "player-avatar" : unknown ? "unknown-avatar" : ""}`;
      avatar.textContent = unknown ? "?" : person.name.slice(0, 1);
      const detail = document.createElement("span"), name = document.createElement("strong"), category = document.createElement("small");
      name.textContent = person.name; category.textContent = person.category;
      detail.append(name, category); entry.append(avatar, detail);
      if (person.card) { entry.setAttribute("type", "button"); entry.setAttribute("aria-haspopup", "dialog"); entry.addEventListener("click", () => openCharacter(person, entry)); }
      if (person.ref === selectedCharacter && returnFocus?.className === "scene-participant") returnFocus = entry;
      ui("scene-participants").append(entry);
    }
  }
  if (selectedCharacter) {
    const householdCard = data.play?.household?.flatMap(g => g.members).find(c => c.ref === selectedCharacter);
    const person = people.find(p => p.ref === selectedCharacter) ?? (householdCard ? { ref: householdCard.ref, name: householdCard.name, name_known: householdCard.name_known, card: householdCard } : undefined);
    if (person) openCharacter(person); else closeCharacter();
  }
  household.replaceChildren();
  const members = data.play?.household ? data.play.household.flatMap(group => group.members).map(card => ({ name: card.name_known ? card.name : "Unfamiliar household member", presence: card.presence, location: card.known_location, card })) : (data.household ?? []).flatMap(group => group.members);
  if (ui("household-count")) ui("household-count").textContent = `${members.filter(m => m.presence === "present").length} here · ${members.filter(m => m.presence !== "present").length} elsewhere`;
  if (!members.length) {
    const empty = document.createElement("p"); empty.className = "empty-household";
    empty.textContent = "No household members yet."; household.append(empty);
  }
  for (const member of members) {
    const card = document.createElement(member.card ? "button" : "div"); card.className = "household-member";
    if (member.card) { card.setAttribute("type", "button"); card.setAttribute("aria-haspopup", "dialog"); card.addEventListener("click", () => openCharacter({ ref: member.card.ref, name: member.card.name, name_known: member.card.name_known, card: member.card }, card)); }
    if (member.card?.ref === selectedCharacter && returnFocus?.className === "household-member") returnFocus = card;
    card.setAttribute("data-initial", member.name === "Unfamiliar household member" ? "?" : member.name.slice(0, 1));
    card.setAttribute("title", `${member.name} · ${member.presence === "present" ? "Here" : "Elsewhere"}`);
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
