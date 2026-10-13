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
// Every projected character the UI can open an editor for (household members AND editable NPC+ who are no longer members).
const editableCharacters = new Map();
// Tier capabilities are derived server-side (character_capabilities); the client only renders them. A control that the tier does not have is never rendered.
const capsOf = card => card?.character_capabilities ?? {};
// The player character shares the NPC+ editor surface in "player" mode (one portrait pipeline); its card is built from the server's player projection.
let editorMode = "npc", playerProfile = null;
const playerCard = () => {
  const p = playerProfile, v = p?.visual;
  return v ? { ref: v.ref, name: p.name, name_known: true, appearance: p.narrator_summary || "No visible appearance set.", appearance_editor: v.editor, appearance_editor_eligible: true, character_capabilities: v.capabilities, avatar_url: v.avatar_url, full_body_url: v.full_body_url } : undefined;
};
const editorCard = ref => { const player = playerCard(); return player && player.ref === ref ? player : editableCharacters.get(ref); };
// One visual resolver per role: the selected Player Avatar / Full Body (never a path built in the DOM code).
const resolveCharacterAvatar = card => card?.avatar_url ?? card?.appearance_editor?.portrait?.avatar?.url ?? null;
const resolveCharacterFullBody = card => card?.full_body_url ?? card?.appearance_editor?.portrait?.full_body?.url ?? null;
function switchView(view) {
  activeView = view;
  closeCharacter();
  if (view !== "editor") closeLightbox();
  for (const [key, id] of [["play", "play-view"], ["inventory", "inventory-view"], ["household", "household-view"], ["editor", "member-editor"]]) if (ui(id)) ui(id).hidden = key !== view;
  ui("inventory-nav")?.setAttribute("aria-pressed", String(view === "inventory"));
  if (view !== "inventory") clearTimeout(inventoryPoll);
  ui("household-nav")?.setAttribute("aria-pressed", String(view === "household" || (view === "editor" && editorMode !== "player")));
  ui("player-nav")?.setAttribute("aria-pressed", String(view === "editor" && editorMode === "player"));
  if (view === "household") ui("household-close")?.focus();
  else if (view === "player") ui("player-back")?.focus();
  else if (view === "inventory") ui("inventory-back")?.focus();
  else if (view === "play") ui("household-nav")?.focus();
}
// Inventory UI V1 is a projection of committed possession, never client-owned item state.
let inventoryData = null, inventoryFilter = "all", inventoryQuery = "", inventoryPoll, inventoryRequest = 0, selectedItemId;
// Item visuals: the server resolves icon / detail artwork per role (specific > template > category > placeholder); the DOM code only
// reads those resolved URLs and never builds a path. Icons are small and always shown; the detail image loads for the selected item only.
const resolveItemIcon = item => item.visual?.icon?.url ?? null;
const resolveItemDetailArtwork = item => item.visual?.detail?.url ?? null;
const itemGlyphFallback = item => `/api/item-glyph/${item.visual?.kind ?? "misc"}`;
function itemImage(item, url, className) {
  const image = document.createElement("img"); image.className = className; image.alt = ""; image.loading = "lazy";
  image.addEventListener("error", () => { const glyph = itemGlyphFallback(item); if (image.getAttribute?.("src") !== glyph) image.setAttribute("src", glyph); }, { once: true });
  image.setAttribute("src", url); return image;
}
function selectItem(id) { selectedItemId = id; renderInventory(); }
function renderEquipment(data) {
  const equipment = data?.equipment, items = new Map((data?.items ?? []).map(i => [i.id, i]));
  const figure = ui("equipment-figure");
  if (figure) { figure.setAttribute("src", equipment?.full_body_url ?? equipment?.silhouette_url ?? "/api/item-glyph/silhouette"); figure.className = equipment?.full_body_url ? "doll-image" : "doll-image silhouette"; }
  for (const slot of equipment?.slots ?? []) {
    const body = ui(`equip-slot-${slot.id}-body`), box = ui(`equip-slot-${slot.id}`);
    if (!body) continue;
    body.replaceChildren();
    box?.setAttribute("data-state", slot.conflict ? "conflict" : slot.item_ids.length ? "filled" : "empty");
    if (!slot.item_ids.length) { const empty = document.createElement("span"); empty.className = "slot-empty"; empty.textContent = "Empty"; body.append(empty); continue; }
    if (slot.conflict) { const warn = document.createElement("span"); warn.className = "slot-warning"; warn.textContent = "Multiple equipped items"; body.append(warn); }
    for (const id of slot.item_ids) {
      const item = items.get(id); if (!item) continue;
      const chip = document.createElement("button"); chip.className = "slot-item"; chip.setAttribute("type", "button"); chip.setAttribute("title", item.name); chip.setAttribute("aria-label", `${slot.label}: ${item.name}`);
      chip.append(itemImage(item, resolveItemIcon(item), "slot-icon")); chip.addEventListener("click", () => selectItem(id)); body.append(chip);
      const label = document.createElement("span"); label.className = "slot-name"; label.textContent = item.name; body.append(label);
    }
  }
  const loose = equipment?.unclassified_equipped?.length ?? 0;
  if (ui("equipment-note")) ui("equipment-note").textContent = loose ? `${loose} equipped ${loose === 1 ? "item has" : "items have"} no slot classification.` : "";
}
function renderDetail(item) {
  if (ui("inventory-detail-empty")) ui("inventory-detail-empty").hidden = !!item;
  if (ui("inventory-detail-body")) ui("inventory-detail-body").hidden = !item;
  if (!item) return;
  const art = ui("inventory-detail-art");
  if (art) { art.hidden = false; art.setAttribute("alt", item.name); art.onerror = () => { art.setAttribute("src", itemGlyphFallback(item)); }; const url = resolveItemDetailArtwork(item); if (art.getAttribute?.("src") !== url) art.setAttribute("src", url); }
  if (ui("inventory-detail-name")) ui("inventory-detail-name").textContent = item.name;
  if (ui("inventory-detail-category")) ui("inventory-detail-category").textContent = item.category_label;
  if (ui("inventory-detail-description")) ui("inventory-detail-description").textContent = item.description || "No description available.";
  if (ui("inventory-detail-state")) ui("inventory-detail-state").textContent = item.state_label;
  if (ui("inventory-detail-owner")) { ui("inventory-detail-owner").hidden = !item.held_for_other; ui("inventory-detail-owner").textContent = item.held_for_other ? "Belongs to someone else." : ""; }
}
function renderInventory() {
  const container = ui("inventory-items"); if (!container) return;
  const all = inventoryData?.items ?? [];
  const counts = inventoryData?.counts ?? { total: all.length, carried: all.length, equipped: 0 };
  if (ui("inventory-count")) ui("inventory-count").textContent = `${counts.total} ${counts.total === 1 ? "item" : "items"} · ${counts.carried} carried · ${counts.equipped} equipped`;
  if (ui("inventory-gold")) ui("inventory-gold").textContent = typeof inventoryData?.gold === "number" ? String(inventoryData.gold) : "Not tracked";
  for (const filter of ["all", "carried", "equipped"]) ui(`inventory-${filter}`)?.setAttribute("aria-pressed", String(inventoryFilter === filter));
  renderEquipment(inventoryData);
  const items = all.filter(i => (inventoryFilter === "all" || i.position.kind === inventoryFilter) && `${i.name} ${i.description ?? ""} ${i.category ?? ""}`.toLowerCase().includes(inventoryQuery));
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p"); empty.className = "inventory-empty";
    empty.textContent = !all.length ? "Your inventory is empty. Items you take or equip will appear here." : "No items match this filter or search.";
    container.append(empty);
  }
  for (const item of items) {
    const cell = document.createElement("button"); cell.className = `inventory-cell${item.equipped ? " is-equipped" : ""}${item.id === selectedItemId ? " is-selected" : ""}`;
    cell.setAttribute("type", "button"); cell.setAttribute("role", "listitem"); cell.setAttribute("data-item", item.id); cell.setAttribute("title", item.name);
    cell.setAttribute("aria-pressed", String(item.id === selectedItemId)); cell.setAttribute("aria-label", `${item.name}, ${item.state_label}`);
    cell.append(itemImage(item, resolveItemIcon(item), "cell-icon"));
    if (item.equipped) { const mark = document.createElement("span"); mark.className = "cell-equipped"; mark.setAttribute("aria-hidden", "true"); mark.textContent = "E"; cell.append(mark); }
    if (item.sprite_status === "pending") { const pending = document.createElement("span"); pending.className = "cell-pending"; pending.setAttribute("title", "Illustration on its way"); cell.append(pending); }
    cell.addEventListener("click", () => selectItem(item.id));
    container.append(cell);
  }
  if (selectedItemId && !all.some(i => i.id === selectedItemId)) selectedItemId = undefined;
  renderDetail(all.find(i => i.id === selectedItemId));
  clearTimeout(inventoryPoll);
  if (activeView === "inventory" && all.some(i => i.sprite_status === "pending")) inventoryPoll = setTimeout(refreshInventory, 2000);
}
async function refreshInventory() {
  const request = ++inventoryRequest, campaign = inventoryData?.campaign_id;
  try {
    const response = await fetch("/api/inventory"); if (!response.ok) throw new Error("inventory refresh");
    const data = await response.json();
    if (request !== inventoryRequest || activeView !== "inventory" || campaign !== inventoryData?.campaign_id) return;
    if (data.campaign_id !== campaign) { await load(); return; }
    inventoryData = data; if (ui("inventory-error")) ui("inventory-error").hidden = true; renderInventory();
  } catch {
    if (activeView !== "inventory" || request !== inventoryRequest) return;
    if (ui("inventory-error")) { ui("inventory-error").hidden = false; ui("inventory-error").textContent = "Inventory could not refresh. Trying again shortly."; }
    clearTimeout(inventoryPoll); inventoryPoll = setTimeout(refreshInventory, 4000);
  }
}
ui("inventory-nav")?.addEventListener("click", () => { inventoryRequest++; switchView("inventory"); renderInventory(); refreshInventory(); });
ui("inventory-back")?.addEventListener("click", () => { inventoryRequest++; switchView("play"); ui("inventory-nav")?.focus(); });
for (const filter of ["all", "carried", "equipped"]) ui(`inventory-${filter}`)?.addEventListener("click", () => { inventoryFilter = filter; renderInventory(); });
ui("inventory-search")?.addEventListener("input", event => { inventoryQuery = event.target.value.trim().toLowerCase(); renderInventory(); });
// Permanent Appearance V1 editor. Inputs show only stored campaign overrides; inherited/baseline values are notes, never prefilled,
// so saving never copies them into the profile. Inputs are filled on open and after a committed save only (a state refresh keeps
// unsaved edits). Empty input on a stored override = explicit clear (null); empty input without one = unchanged.
let editorRevision, editorFields = [], editorSaving = false;
function openEditor(ref) {
  const card = editorCard(ref);
  if (!card?.appearance_editor_eligible || !capsOf(card).can_edit_npc_plus) return;
  editorMode = "npc";
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
function applyEditorMode(player) {
  const set = (id, hidden) => { if (ui(id)) ui(id).hidden = hidden; };
  set("editor-player-identity", !player); set("editor-identity-row", player); set("editor-untracked", player); set("editor-appearance-note", !player);
  if (ui("editor-back")) ui("editor-back").textContent = player ? "\u2039 Back to Play" : "\u2039 Back to Household";
  if (ui("editor-context")) ui("editor-context").textContent = player ? "Player Character" : "Household \u00b7 NPC+";
  if (ui("editor-intro")) ui("editor-intro").textContent = player ? "Visible appearance only \u2014 what anyone present can see. Clothing comes from what Nicco is wearing; background and private history are not part of this profile. The name is fixed."
    : "Permanent appearance only \u2014 not current wounds, illness, clothing or mood. Fields hold saved values; inherited text beneath a field is reference only and is never copied when you save.";
  if (ui("editor-appearance-heading")) ui("editor-appearance-heading").textContent = player ? "Narrator sees" : "Resolved permanent appearance";
}
function renderEditor(card, fill = false) {
  if (!ui("editor-name")) return;
  const player = editorMode === "player";
  applyEditorMode(player);
  ui("editor-name").textContent = player ? card.name.toUpperCase() : card.name;
  ui("editor-initial").textContent = card.name_known ? card.name.slice(0, 1) : "?";
  ui("editor-appearance").textContent = card.appearance;
  const editor = card.appearance_editor;
  // Committed-only preview: the prompt is server-built from saved appearance (no client-side resolver copy), so it is safe to
  // refresh on every render; it never touches the editable inputs.
  if (ui("editor-image-prompt")) ui("editor-image-prompt").value = editor?.portrait_prompts?.avatar?.prompt ?? "";
  if (ui("editor-negative-prompt")) ui("editor-negative-prompt").value = editor?.portrait_prompts?.avatar?.negative_prompt ?? "";
  if (ui("editor-fullbody-prompt")) ui("editor-fullbody-prompt").value = editor?.portrait_prompts?.fullbody?.prompt ?? "";
  if (ui("editor-fullbody-negative-prompt")) ui("editor-fullbody-negative-prompt").value = editor?.portrait_prompts?.fullbody?.negative_prompt ?? "";
  if (fill) { showPortraitError(""); portraitResult = ""; }
  renderPortrait(editor);
  if (ui("editor-identity")) ui("editor-identity").textContent = editor?.identity?.length ? editor.identity.map(i => `${i.label}: ${i.value}`).join(" · ") : "No established species, sex or age.";
  if (fill) {
    editorRevision = currentRevision;
    editorFields = [...(editorMode === "player" ? (playerProfile?.identity ?? []).map(f => ({ key: f.key, label: f.label, kind: "text", override: f.value })) : []), ...(editor?.fields ?? [])];
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
    const response = await fetch(editorMode === "player" ? "/api/player-character" : "/api/appearance", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editorMode === "player" ? { expected_revision: editorRevision, patch } : { ref: editorRef, expected_revision: editorRevision, patch }) });
    const data = await response.json();
    editorSaving = false;
    if (data?.messages) render(data);
    if (data?.ok) {
      const card = editorCard(editorRef);
      if (card && activeView === "editor") renderEditor(card, true);
      showEditorError("");
    } else showEditorError(data?.error?.message ?? "The appearance was not saved.");
  } catch { editorSaving = false; showEditorError("The appearance was not saved. Check the connection and try again."); }
  updateEditorSave();
}
ui("editor-save")?.addEventListener("click", () => saveEditor());
// Portrait Gallery V2 + image generation v1. Generation is an explicit click (it costs money) asking the server for one batch of 3
// options of one kind (avatar or full body) in one curated pose; the browser sends only the opaque ref, the revision the editor opened
// with, the kind and a pose id from the server's list and, for role/delete actions, an opaque Gallery item token. What is shown is
// always the committed projection: nothing optimistic, nothing on open. The Full Body slot never falls back to the Avatar.
// Generation lifecycle (shared by the player editor and the NPC+ editor, which use this one path): one synchronous POST that resolves
// when the whole batch is saved (typically 30-90 s). The client shows a live progress block and 3 placeholder tiles meanwhile.
const PORTRAIT_SLOW_MS = 90_000, PORTRAIT_CLIENT_TIMEOUT_MS = 360_000;
let portraitProgress = null;
let portraitBusy = false, portraitAction = "", portraitKind = "", portraitResult = "", lightboxToken, lightboxConfirm = false, lightboxReturn;
const KIND_LABELS = { avatar: "Avatar image", fullbody: "Full-body image", legacy: "Earlier image" };
function showPortraitError(text) { const el = ui("portrait-error"); if (el) { el.textContent = text; el.hidden = !text; } }
function showLightboxError(text) { const el = ui("lightbox-error"); if (el) { el.textContent = text; el.hidden = !text; } }
function editorPortrait() { return editorCard(editorRef)?.appearance_editor?.portrait; }
function showImage(image, url) {
  if (!image) return;
  if (url) { if (image.getAttribute?.("src") !== url) image.setAttribute("src", url); image.hidden = false; }
  else image.hidden = true;
}
const roleLabels = item => [item.is_avatar ? "Avatar" : "", item.is_full_body ? "Full Body" : ""].filter(Boolean);
// Kind rule: a role can only be given to an image of that kind; a role an earlier image already holds stays (shown as held).
const kindBlock = (item, role) => role === "avatar" ? !item.is_avatar && !item.can_be_avatar : !item.is_full_body && !item.can_be_full_body;
function renderPoseSelect(select, poses) {
  if (!select) return;
  const ids = (poses ?? []).map(p => p.id).join(",");
  if (select.getAttribute?.("data-poses") !== ids) {
    const previous = select.value;
    select.replaceChildren(...(poses ?? []).map(p => { const option = document.createElement("option"); option.setAttribute("value", p.id); option.value = p.id; option.textContent = p.label; return option; }));
    select.setAttribute("data-poses", ids);
    select.value = (poses ?? []).some(p => p.id === previous) ? previous : poses?.[0]?.id ?? "";
  }
}
function deleteBlock(item) {
  if (item.is_avatar && item.is_full_body) return "This image is the Avatar and the Full Body. Choose another Avatar, and another Full Body image or clear Full Body, before deleting it.";
  if (item.is_avatar) return "Choose another Avatar before deleting this image.";
  if (item.is_full_body) return "Choose another Full Body image or clear Full Body first.";
  return "";
}
function portraitStage(elapsed) {
  return elapsed < 1000 ? "Request sent" : elapsed >= PORTRAIT_SLOW_MS ? "Taking longer than usual. The request is still running." : "Generating…";
}
function renderPortraitProgress() {
  const box = ui("portrait-progress");
  if (!box) return;
  const live = portraitBusy && portraitAction === "generate" && portraitProgress;
  box.hidden = !live;
  if (!live) return;
  const elapsed = Date.now() - portraitProgress.startedAt, noun = portraitKind === "avatar" ? "avatar" : "full-body";
  if (ui("portrait-progress-title")) ui("portrait-progress-title").textContent = `Generating 3 ${noun} images`;
  if (ui("portrait-progress-stage")) ui("portrait-progress-stage").textContent = portraitStage(elapsed);
  if (ui("portrait-progress-hint")) ui("portrait-progress-hint").textContent = "Image generation can take up to about a minute. You can keep editing; only the portrait controls wait.";
  if (ui("portrait-progress-elapsed")) ui("portrait-progress-elapsed").textContent = `${Math.floor(elapsed / 1000)} s`;
}
function startPortraitProgress() {
  stopPortraitProgress();
  portraitProgress = { startedAt: Date.now(), timer: null };
  const tick = () => { if (!portraitProgress) return; renderPortraitProgress(); portraitProgress.timer = setTimeout(tick, 1000); portraitProgress.timer?.unref?.(); };
  tick();
}
function stopPortraitProgress() {
  if (portraitProgress?.timer) clearTimeout(portraitProgress.timer);
  portraitProgress = null; renderPortraitProgress();
}
function renderPortrait(editor) {
  const portrait = editor?.portrait, gallery = portrait?.gallery ?? [], generating = portraitBusy && portraitAction === "generate";
  showImage(ui("editor-avatar-image"), portrait?.avatar?.url);
  if (ui("editor-initial")) ui("editor-initial").hidden = !!portrait?.avatar;
  if (ui("editor-avatar-status")) ui("editor-avatar-status").textContent = !portrait?.avatar ? "No avatar yet" : portrait.avatar.stale ? "Current Avatar · older appearance" : "Current Avatar";
  if (ui("portrait-avatar-change")) ui("portrait-avatar-change").hidden = !gallery.length;
  // Full Body: its own image or an explicit empty state, never a silent Avatar substitute.
  showImage(ui("editor-full-body-image"), portrait?.full_body?.url);
  if (ui("editor-full-body-label")) ui("editor-full-body-label").hidden = !!portrait?.full_body;
  if (ui("editor-full-body-status")) ui("editor-full-body-status").textContent = !portrait?.full_body ? gallery.length ? "No image selected. Choose one from the Gallery." : "No image selected."
    : portrait.full_body.stale ? "Appearance changed since this image was generated." : "";
  if (ui("portrait-full-body-clear")) { ui("portrait-full-body-clear").hidden = !portrait?.full_body; ui("portrait-full-body-clear").disabled = portraitBusy; }
  const blocked = portrait?.generation_blocked ?? "", full = !!portrait && !portrait.can_generate_batch && !blocked;
  for (const [kind, noun] of [["avatar", "avatars"], ["fullbody", "full body"]]) {
    const button = ui(`portrait-generate-${kind}`), select = ui(`portrait-${kind}-pose`);
    renderPoseSelect(select, portrait?.poses?.[kind]);
    if (select) select.disabled = portraitBusy || !editor || !!blocked;
    // One batch at a time per session: both buttons wait while either kind is generating.
    if (button) { button.textContent = generating && portraitKind === kind ? `Generating 3 ${noun}…` : `Generate 3 ${noun}`; button.disabled = portraitBusy || !editor || full || !!blocked; }
  }
  if (ui("portrait-status")) ui("portrait-status").textContent = generating ? `Generating 3 ${portraitKind === "avatar" ? "avatar" : "full-body"} options…` : portraitResult || blocked || (full ? "Gallery is full. Delete some unused portraits first." : "");
  if (ui("portrait-reference-remove")) ui("portrait-reference-remove").hidden = !portrait?.reference_attached || portraitBusy;
  if (ui("portrait-meta")) ui("portrait-meta").textContent = portrait?.reference_attached ? "A reference image is attached (not used)." : "";
  if (ui("portrait-gallery-count")) ui("portrait-gallery-count").textContent = gallery.length ? `${gallery.length} of ${portrait.gallery_limit}` : "";
  renderPortraitProgress();
  renderGallery(gallery, generating ? portraitKind : "");
  renderLightbox();
}
function galleryChip(label, aria, held, onClick, wrongKind = false) {
  const chip = document.createElement("button"); chip.className = `gallery-chip${label === "Delete" ? " danger" : ""}`; chip.setAttribute("type", "button");
  chip.setAttribute("aria-label", held ? `${label} (current)` : wrongKind ? `${aria} (not available for this image kind)` : aria); chip.textContent = label;
  if (label !== "Delete") chip.setAttribute("aria-pressed", String(held));
  if (wrongKind) chip.setAttribute("title", label === "Avatar" ? "Only avatar images can be the Avatar." : "Only full-body images can be the Full Body.");
  chip.disabled = portraitBusy || held || wrongKind; chip.addEventListener("click", onClick); return chip;
}
function pendingTile(label) {
  const tile = document.createElement("div"); tile.className = "gallery-item gallery-pending"; tile.setAttribute("aria-hidden", "true");
  const box = document.createElement("div"); box.className = "gallery-pending-box";
  const spin = document.createElement("span"); spin.className = "spinner";
  const text = document.createElement("span"); text.className = "gallery-pending-label"; text.textContent = label;
  box.append(spin, text); tile.append(box); return tile;
}
function renderGallery(gallery, generatingKind = "") {
  const grid = ui("portrait-gallery");
  if (!grid) return;
  grid.replaceChildren();
  // Three placeholders stand for the incoming batch; they disappear when the real images arrive or the request fails.
  if (generatingKind) for (let i = 1; i <= 3; i++) grid.append(pendingTile(`${generatingKind === "avatar" ? "Avatar" : "Full body"} ${i} of 3…`));
  if (!gallery.length && !generatingKind) {
    const empty = document.createElement("p"); empty.className = "gallery-empty"; empty.textContent = "No portraits yet. Generate 3 avatars or 3 full-body images to start the Gallery."; grid.append(empty); return;
  }
  gallery.forEach((item, index) => {
    const entry = document.createElement("div"); entry.className = "gallery-item";
    const thumb = document.createElement("button"); thumb.className = `gallery-thumb kind-${item.kind ?? "legacy"}`; thumb.setAttribute("type", "button"); thumb.setAttribute("data-token", item.token);
    thumb.setAttribute("aria-label", `View portrait ${index + 1} of ${gallery.length}, ${KIND_LABELS[item.kind] ?? KIND_LABELS.legacy}${roleLabels(item).length ? ` (${roleLabels(item).join(", ")})` : ""}`);
    const image = document.createElement("img"); image.setAttribute("src", item.url); image.setAttribute("alt", ""); image.setAttribute("loading", "lazy");
    const badges = document.createElement("span"); badges.className = "gallery-badges";
    for (const label of roleLabels(item)) { const badge = document.createElement("span"); badge.className = "role-badge"; badge.textContent = label; badges.append(badge); }
    if (item.stale) { const badge = document.createElement("span"); badge.className = "stale-badge"; badge.textContent = "Older appearance"; badges.append(badge); }
    const kindBadge = document.createElement("span"); kindBadge.className = "kind-badge"; kindBadge.textContent = KIND_LABELS[item.kind] ?? KIND_LABELS.legacy; badges.append(kindBadge);
    thumb.append(image, badges);
    thumb.addEventListener("click", () => openLightbox(item.token, thumb));
    const actions = document.createElement("div"); actions.className = "gallery-actions";
    actions.append(galleryChip("Avatar", `Set portrait ${index + 1} as Avatar`, item.is_avatar, () => portraitRequest("/api/portrait/avatar", { item: item.token }, "role"), kindBlock(item, "avatar")),
      galleryChip("Full Body", `Set portrait ${index + 1} as Full Body`, item.is_full_body, () => portraitRequest("/api/portrait/full-body", { item: item.token }, "role"), kindBlock(item, "fullbody")),
      galleryChip("Delete", `Delete portrait ${index + 1}`, false, () => requestDelete(item, thumb)));
    entry.append(thumb, actions); grid.append(entry);
  });
}
function openLightbox(token, trigger, confirm = false) {
  if (!ui("portrait-lightbox")) return;
  lightboxToken = token; lightboxConfirm = confirm; if (trigger) lightboxReturn = trigger;
  showLightboxError(""); renderLightbox();
  (confirm ? ui("lightbox-confirm-cancel") : ui("lightbox-close"))?.focus();
}
function closeLightbox() {
  const token = lightboxToken, back = lightboxReturn;
  lightboxToken = undefined; lightboxConfirm = false; lightboxReturn = undefined;
  if (ui("portrait-lightbox")) ui("portrait-lightbox").hidden = true;
  if (!token || activeView !== "editor") return;
  // Thumbnails re-render with committed state; return focus to the same image when it still exists.
  const same = Array.from(ui("portrait-gallery")?.children ?? []).map(entry => entry.children?.[0]).find(thumb => (thumb?.getAttribute?.("data-token") ?? thumb?.attributes?.get?.("data-token")) === token);
  (back?.isConnected === false ? same ?? ui("portrait-generate-avatar") : back ?? same ?? ui("portrait-generate-avatar"))?.focus?.();
}
function stepLightbox(delta) {
  const gallery = editorPortrait()?.gallery ?? [], index = gallery.findIndex(item => item.token === lightboxToken);
  if (index < 0 || gallery.length < 2) return;
  lightboxToken = gallery[(index + delta + gallery.length) % gallery.length].token; lightboxConfirm = false; showLightboxError(""); renderLightbox();
}
function renderLightbox() {
  const box = ui("portrait-lightbox");
  if (!box || !lightboxToken) { if (box) box.hidden = true; return; }
  const gallery = editorPortrait()?.gallery ?? [], index = gallery.findIndex(item => item.token === lightboxToken), item = gallery[index];
  if (!item || activeView !== "editor") { closeLightbox(); return; }
  box.hidden = false;
  showImage(ui("lightbox-image"), item.url); ui("lightbox-image")?.setAttribute("alt", `Portrait ${index + 1} of ${gallery.length}`);
  ui("lightbox-position").textContent = `${index + 1} of ${gallery.length}`;
  ui("lightbox-badges").replaceChildren();
  for (const label of [...roleLabels(item), item.stale ? "Older appearance" : ""].filter(Boolean)) {
    const badge = document.createElement("span"); badge.className = label === "Older appearance" ? "stale-badge" : "role-badge"; badge.textContent = label; ui("lightbox-badges").append(badge);
  }
  ui("lightbox-meta").textContent = [KIND_LABELS[item.kind] ?? KIND_LABELS.legacy, item.pose_label ? `Pose: ${item.pose_label}` : "", `Generated ${item.generated_at.slice(0, 16).replace("T", " ")} UTC`, item.model_label,
    item.reference_used ? "Reference used" : ""].filter(Boolean).join(" · ");
  for (const id of ["lightbox-prev", "lightbox-next"]) ui(id).disabled = gallery.length < 2;
  ui("lightbox-avatar").textContent = item.is_avatar ? "Avatar ✓" : "Set as Avatar"; ui("lightbox-avatar").disabled = portraitBusy || item.is_avatar || kindBlock(item, "avatar");
  ui("lightbox-full-body").textContent = item.is_full_body ? "Full Body ✓" : "Set as Full Body"; ui("lightbox-full-body").disabled = portraitBusy || item.is_full_body || kindBlock(item, "fullbody");
  ui("lightbox-delete").disabled = portraitBusy; ui("lightbox-delete").hidden = lightboxConfirm;
  ui("lightbox-confirm").hidden = !lightboxConfirm;
  ui("lightbox-confirm-delete").disabled = portraitBusy;
}
// Delete: an image holding a role is blocked before any confirmation; otherwise the viewer asks for an explicit confirmation.
function requestDelete(item, trigger) {
  const blocked = deleteBlock(item);
  if (blocked) { if (lightboxToken === item.token) showLightboxError(blocked); else showPortraitError(blocked); return; }
  if (lightboxToken === item.token) { lightboxConfirm = true; showLightboxError(""); renderLightbox(); ui("lightbox-confirm-cancel")?.focus(); }
  else openLightbox(item.token, trigger, true);
}
function portraitLog(event, fields) {
  // Development diagnostics only (browser console): kind and the opaque editor ref, never a prompt, seed or character id.
  if (typeof console !== "undefined" && console.debug) console.debug(`[portrait] ${event}`, fields);
}
async function portraitRequest(url, body, action) {
  if (!editorRef || portraitBusy) return;
  if (action === "generate" && editorPortrait() && !editorPortrait().can_generate_batch) return;
  portraitBusy = true; portraitAction = action; portraitKind = action === "generate" ? body.kind : ""; showPortraitError(""); showLightboxError("");
  if (action === "generate") { portraitResult = ""; startPortraitProgress(); }
  renderPortrait(editorCard(editorRef)?.appearance_editor);
  const inViewer = !!lightboxToken && (action === "role" || action === "delete" || action === "full-body-clear");
  const startedAt = Date.now(), target = editorRef, kind = portraitKind;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const abortTimer = controller && action === "generate" ? setTimeout(() => controller.abort(), PORTRAIT_CLIENT_TIMEOUT_MS) : null;
  abortTimer?.unref?.();
  if (action === "generate") portraitLog("request started", { kind, target });
  const finish = () => { portraitBusy = false; portraitAction = ""; if (abortTimer) clearTimeout(abortTimer); stopPortraitProgress(); };
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: editorRef, expected_revision: editorRevision, ...body }), ...(controller ? { signal: controller.signal } : {}) });
    const data = await response.json();
    finish();
    if (data?.messages) render(data);
    // Portrait media never touches appearance: unsaved form edits stay valid at the new revision.
    if (data?.ok) {
      if (data.changed) editorRevision = currentRevision;
      if (action === "generate") portraitResult = data.message ?? "";
      if (action === "delete") closeLightbox(); else lightboxConfirm = false;
      if (action === "generate") portraitLog("request completed", { kind, target, duration_ms: Date.now() - startedAt });
    } else {
      (inViewer ? showLightboxError : showPortraitError)(data?.error?.message ?? (action === "generate" ? "Portrait generation failed." : "The portrait change was not saved."));
      if (action === "generate") portraitLog("request failed", { kind, target, duration_ms: Date.now() - startedAt, code: data?.error?.code });
    }
  } catch {
    const timedOut = !!controller?.signal.aborted;
    finish();
    (inViewer ? showLightboxError : showPortraitError)(timedOut
      ? "No response after 6 minutes. The images may still have been saved: check the Gallery, then try again if it is empty."
      : "The portrait request failed. Check the connection and try again.");
    if (action === "generate") portraitLog("request failed", { kind, target, duration_ms: Date.now() - startedAt, code: timedOut ? "client_timeout" : "network" });
  }
  renderPortrait(editorCard(editorRef)?.appearance_editor);
}
for (const kind of ["avatar", "fullbody"]) ui(`portrait-generate-${kind}`)?.addEventListener("click", () => portraitRequest("/api/portrait/generate", { kind, pose: ui(`portrait-${kind}-pose`)?.value || "neutral" }, "generate"));
ui("portrait-full-body-clear")?.addEventListener("click", () => portraitRequest("/api/portrait/full-body", { item: null }, "full-body-clear"));
ui("portrait-avatar-change")?.addEventListener("click", () => { const grid = ui("portrait-gallery"); grid?.scrollIntoView?.({ block: "nearest" }); grid?.children?.[0]?.children?.[0]?.focus?.(); });
ui("lightbox-close")?.addEventListener("click", () => closeLightbox());
ui("lightbox-backdrop")?.addEventListener("click", () => closeLightbox());
ui("lightbox-prev")?.addEventListener("click", () => stepLightbox(-1));
ui("lightbox-next")?.addEventListener("click", () => stepLightbox(1));
ui("lightbox-avatar")?.addEventListener("click", () => lightboxToken ? portraitRequest("/api/portrait/avatar", { item: lightboxToken }, "role") : undefined);
ui("lightbox-full-body")?.addEventListener("click", () => lightboxToken ? portraitRequest("/api/portrait/full-body", { item: lightboxToken }, "role") : undefined);
ui("lightbox-delete")?.addEventListener("click", () => { const item = editorPortrait()?.gallery?.find(i => i.token === lightboxToken); if (item) requestDelete(item); });
ui("lightbox-confirm-cancel")?.addEventListener("click", () => { lightboxConfirm = false; renderLightbox(); ui("lightbox-delete")?.focus(); });
ui("lightbox-confirm-delete")?.addEventListener("click", () => lightboxToken && lightboxConfirm ? portraitRequest("/api/portrait/delete", { item: lightboxToken }, "delete") : undefined);
ui("lightbox-dialog")?.addEventListener("keydown", event => {
  if (event.key === "Escape") { event.preventDefault(); if (lightboxConfirm) { lightboxConfirm = false; renderLightbox(); ui("lightbox-delete")?.focus(); } else closeLightbox(); }
  else if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); stepLightbox(event.key === "ArrowLeft" ? -1 : 1); }
  else if (event.key === "Tab") {
    event.preventDefault();
    const controls = ["lightbox-close", "lightbox-prev", "lightbox-next", "lightbox-avatar", "lightbox-full-body", "lightbox-delete", ...(lightboxConfirm ? ["lightbox-confirm-delete", "lightbox-confirm-cancel"] : [])]
      .map(ui).filter(el => el && !el.hidden && !el.disabled);
    if (!controls.length) return;
    const at = controls.indexOf(event.target); controls[(at + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
  }
});
// Reference images are deferred in image generation v1 (text-to-image has no reference input): no upload control; an existing
// reference can still be removed.
ui("portrait-reference-remove")?.addEventListener("click", () => portraitRequest("/api/portrait/reference", { image: null }, "reference"));
for (const key of ["sex", "species", "apparent_age", "height_cm", "weight_kg", "build", "skin", "hair_color", "hair_texture", "hair_description", "eyes", "scars", "distinguishing_marks", "distinctive_traits", "description"])
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
    // Portrait Gallery V2: the Avatar (never the Full Body) replaces the initial when one exists.
    if (card.avatar_url) { const image = document.createElement("img"); image.className = "portrait-image"; image.setAttribute("alt", ""); image.setAttribute("src", card.avatar_url); portrait.append(image, presence); }
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
    if (capsOf(card).can_edit_npc_plus) {
      const edit = document.createElement("button"); edit.className = "member-edit"; edit.setAttribute("type", "button"); edit.setAttribute("aria-label", `Edit ${card.name}`); edit.textContent = "Edit";
      edit.addEventListener("click", () => openEditor(card.ref)); article.append(edit);
    }
    ui("household-cards").append(article);
  }
}
ui("household-nav")?.addEventListener("click", () => { editorRef = undefined; editorMode = "npc"; switchView("household"); renderHousehold(); });
ui("household-close")?.addEventListener("click", () => switchView("play"));
for (const key of ["all", "here", "elsewhere"]) ui(`filter-${key}`)?.addEventListener("click", () => { householdFilter = key; renderHousehold(); });
for (const id of ["editor-back", "editor-cancel"]) ui(id)?.addEventListener("click", () => { const player = editorMode === "player"; editorRef = undefined; editorMode = "npc"; switchView(player ? "play" : "household"); });
// Player Character page: the shared editor in "player" mode (Avatar, Full Body, Gallery, appearance, prompts). The profile and its visual
// projection are the server's; "Narrator sees" is exactly what the narrator receives, never a client-side rendering. Nicco is not an NPC+.
function renderPlayer() {
  const p = playerProfile, card = playerCard();
  if (ui("player-nav")) ui("player-nav").disabled = !p;
  const avatar = resolveCharacterAvatar(card);
  showImage(ui("player-nav-avatar"), avatar);
  if (ui("player-nav-initial")) ui("player-nav-initial").hidden = !!avatar;
  if (editorMode === "player" && activeView === "editor") {
    if (!card) { editorRef = undefined; editorMode = "npc"; switchView("play"); return; }
    editorRef = card.ref; renderEditor(card, false);
  }
}
function openPlayer() {
  const card = playerCard();
  if (!card) return;
  editorMode = "player"; editorRef = card.ref;
  switchView("editor");
  renderEditor(card, true);
  ui("editor-back")?.focus();
}
ui("player-nav")?.addEventListener("click", () => openPlayer());
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
  showImage(ui("character-avatar-image"), card.avatar_url);
  ui("portrait-initial").hidden = !!card.avatar_url;
  if (ui("character-portrait-label")) ui("character-portrait-label").hidden = !!card.avatar_url;
  ui("character-affiliations").textContent = card.affiliations.length ? card.affiliations.join(" · ") : "None known.";
  ui("character-badges").replaceChildren();
  for (const label of [card.household ? "Household" : "", card.npc_plus ? "NPC+" : ""].filter(Boolean)) {
    const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = label; ui("character-badges").append(badge);
  }
  renderCharacterActions(card);
  ui("character-overlay").hidden = false;
  if (trigger) ui("character-close").focus();
}
// Tier-based absence: Upload / Generate / Edit NPC+ exist only for a character whose tier has them. A control that exists may still be
// disabled for a real, stated reason (generation blocked, character no longer active); a lower tier never gets a disabled placeholder.
function renderCharacterActions(card) {
  const caps = capsOf(card), portraitActions = ui("character-portrait-actions"), footer = ui("character-footer-actions");
  const make = (label, reason, onClick) => { const b = document.createElement("button"); b.setAttribute("type", "button"); b.textContent = label; if (reason) { b.disabled = true; b.setAttribute("title", reason); } else b.addEventListener("click", onClick); return b; };
  const open = () => { closeCharacter(); openEditor(card.ref); };
  const portrait = [];
  if (caps.can_upload_avatar) portrait.push(make("Upload", null, open));
  if (caps.can_generate_avatar) portrait.push(make("Generate", caps.generate_unavailable_reason, open));
  if (portraitActions) { portraitActions.replaceChildren(...portrait); portraitActions.hidden = !portrait.length; }
  const footerButtons = [];
  if (caps.can_edit_npc_plus) footerButtons.push(make("Edit NPC+", null, open));
  else if (caps.tier === "npc_plus" && caps.edit_unavailable_reason) footerButtons.push(make("Edit NPC+", caps.edit_unavailable_reason, open));
  if (footer) footer.replaceChildren(...footerButtons);
  renderPromotion(card);
}
// Heartstone rite confirmation (explicit NPC+ promotion). The arrow exists only when the server-derived capability says so; the first click
// only opens an inline confirmation, and only "Promote" sends the one request. Success re-renders the card from the returned state.
let promotingRef, promoting = false, drawerCard;
function renderPromotion(card) {
  const row = ui("character-promote"); if (!row) return;
  drawerCard = card;
  const can = !!capsOf(card).can_promote_to_npc_plus;
  row.hidden = !can; if (!can) { promotingRef = undefined; return; }
  const open = promotingRef === card.ref, confirm = ui("character-promote-confirm");
  confirm.hidden = !open;
  ui("character-promote-title").textContent = `Promote ${card.name} to NPC+?`;
  ui("character-promote-body").textContent = `Confirm that ${card.name} has completed the Heartstone household rite. This will add them to the household and permanently unlock NPC+ capabilities.`;
  ui("character-promote-button").setAttribute("aria-label", `Promote ${card.name} to NPC+`);
  ui("character-promote-button").setAttribute("title", "Promote to NPC+");
  ui("character-promote-button").hidden = open;
  for (const id of ["character-promote-cancel", "character-promote-confirm-button"]) ui(id).disabled = promoting;
}
ui("character-promote-button")?.addEventListener("click", () => {
  if (!selectedCharacter || promoting) return;
  promotingRef = selectedCharacter; ui("character-promote-error").hidden = true;
  if (drawerCard) renderPromotion(drawerCard);
  ui("character-promote-cancel")?.focus();
});
ui("character-promote-cancel")?.addEventListener("click", () => {
  if (promoting) return;
  promotingRef = undefined; ui("character-promote-confirm").hidden = true; ui("character-promote-button").hidden = false; ui("character-promote-error").hidden = true;
  ui("character-promote-button").focus();
});
ui("character-promote-confirm-button")?.addEventListener("click", async () => {
  if (!promotingRef || promoting) return;
  promoting = true; ui("character-promote-error").hidden = true;
  for (const id of ["character-promote-cancel", "character-promote-confirm-button"]) ui(id).disabled = true;
  try {
    const response = await fetch("/api/npc-plus/promote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: promotingRef, expected_revision: currentRevision }) });
    const data = await response.json();
    promoting = false;
    if (data?.ok) promotingRef = undefined;
    if (data?.messages) render(data);
    if (!data?.ok) {
      for (const id of ["character-promote-cancel", "character-promote-confirm-button"]) ui(id).disabled = false;
      ui("character-promote-error").textContent = data?.error?.message ?? "The promotion was not saved."; ui("character-promote-error").hidden = false;
    }
  } catch {
    promoting = false;
    for (const id of ["character-promote-cancel", "character-promote-confirm-button"]) ui(id).disabled = false;
    ui("character-promote-error").textContent = "The promotion request failed. Check the connection and try again."; ui("character-promote-error").hidden = false;
  }
});
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
// While a turn runs the player sees status words only. The words come from this closed table, never from the server's text, and no narrator
// prose exists in the page until the finished, audited and committed narration arrives once inside the final result.
const PHASE_LABELS = { thinking: "Thinking…", narrating: "Narrating…", resolving: "Resolving…" };
function progress(event) {
  const label = PHASE_LABELS[event.phase];
  if (!pending || !label) return;
  pending.narrator.text.textContent = label;
  status.textContent = label;
}
function renderScene(data) {
  householdCharacters.clear(); editableCharacters.clear();
  householdLoaded = Array.isArray(data.play?.household);
  for (const card of data.play?.household?.flatMap(g => g.members) ?? []) { householdCharacters.set(card.ref, card); editableCharacters.set(card.ref, card); }
  for (const person of data.play?.participants ?? []) if (person.card && capsOf(person.card).can_edit_npc_plus && !editableCharacters.has(person.card.ref)) editableCharacters.set(person.card.ref, person.card);
  if (ui("household-title")) ui("household-title").textContent = data.play?.household_title ?? "Household";
  renderHousehold();
  if (activeView === "editor" && editorMode === "player") { /* refreshed by renderPlayer */ }
  else if (activeView === "editor") {
    const card = editorCard(editorRef);
    if (card?.appearance_editor_eligible && capsOf(card).can_edit_npc_plus) renderEditor(card, false);
    else { editorRef = undefined; switchView("household"); }
  }
  locationLabel.textContent = data.scene?.location ?? "Caldrevan";
  // The calendar date (year, month, day, weekday) replaces the old "Late Morning · Day N" label; the time of day stays as a tooltip.
  daypart.textContent = data.scene?.date_text ?? data.scene?.time_of_day ?? "—";
  daypart.title = data.scene?.time_of_day ?? "";
  if (ui("day")) ui("day").textContent = "";
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
      // The player's own entry carries no card; its portrait comes from the same central resolver as the Player page and nav avatar
      // (the selected Player Avatar from the server's player projection, else the initial placeholder).
      const avatarUrl = person.ref === "player" ? resolveCharacterAvatar(playerCard()) : person.card?.avatar_url;
      if (avatarUrl) { const image = document.createElement("img"); image.className = "avatar-image"; image.setAttribute("alt", ""); image.setAttribute("src", avatarUrl); avatar.replaceChildren(image); avatar.className += " has-image"; }
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
    if (member.card?.avatar_url) { const image = document.createElement("img"); image.className = "avatar-image"; image.setAttribute("alt", ""); image.setAttribute("src", member.card.avatar_url); card.append(image); card.className += " has-avatar"; }
    card.setAttribute("title", `${member.name} · ${member.presence === "present" ? "Here" : "Elsewhere"}`);
    const name = document.createElement("strong"); name.textContent = member.name;
    const detail = document.createElement("span");
    detail.textContent = member.presence === "present" ? `Present${member.location ? ` · ${member.location}` : ""}` : "Away";
    card.append(name, detail); household.append(card);
  }
}

// Actual Offer V1: one compact inline card for the single standing trade offer (never a shop, a modal or a counteroffer form). BUY and SELL differ by
// text and icon, not by colour alone; a person offer carries its own marker. The browser holds only the opaque offer ref; accepting sends the ref and the
// revision it rendered, nothing else. Names arrive already masked by the server.
let tradeBusy = false, tradeError = "", tradeErrorRef = "", tradeReceipts = [];
function tradeRegion() {
  let region = ui("trade-region");
  if (!region) { region = document.createElement("div"); region.id = "trade-region"; region.className = "trade-region"; }
  return region;
}
function renderTrade(data) {
  const region = tradeRegion(), trade = data.trade ?? { offer: null, notice: null, receipt: null };
  if (trade.receipt && !tradeReceipts.some(r => r.ref === trade.receipt.ref)) tradeReceipts.push(trade.receipt);
  const children = [];
  for (const receipt of tradeReceipts.slice(-3)) {
    const done = document.createElement("p"); done.className = "trade-receipt"; done.dataset.tradeReceipt = receipt.ref;
    done.textContent = `\u2713 ${receipt.summary}.`; children.push(done);
  }
  if (trade.notice && !trade.offer) { const note = document.createElement("p"); note.className = "trade-notice"; note.textContent = trade.notice.text; children.push(note); }
  const offer = trade.offer;
  if (offer) {
    const card = document.createElement("section"); card.className = `trade-card trade-${offer.direction}`; card.dataset.tradeRef = offer.ref;
    card.setAttribute("aria-label", `${offer.direction === "buy" ? "Buy" : "Sell"} offer`);
    const head = document.createElement("div"); head.className = "trade-head";
    const label = document.createElement("span"); label.className = "trade-label"; label.textContent = "ACTUAL OFFER"; head.append(label);
    const kind = document.createElement("strong"); kind.className = "trade-kind";
    kind.textContent = offer.direction === "buy" ? "\u25BC BUY" : "\u25B2 SELL"; head.append(kind);
    if (offer.kind === "person") { const mark = document.createElement("span"); mark.className = "trade-person"; mark.textContent = "\u265F Person"; head.append(mark); }
    const price = document.createElement("span"); price.className = "trade-price"; price.textContent = `${offer.price_gold} gold`; head.append(price);
    const who = document.createElement("p"); who.className = "trade-party"; who.textContent = offer.direction === "buy" ? `${offer.counterparty} offers to sell` : `${offer.counterparty} offers to buy`;
    const list = document.createElement("ul"); list.className = "trade-lines";
    for (const line of offer.lines) { const li = document.createElement("li"); li.textContent = line; list.append(li); }
    const foot = document.createElement("div"); foot.className = "trade-foot";
    const accept = document.createElement("button"); accept.type = "button"; accept.className = "trade-accept"; accept.textContent = "Accept offer";
    accept.setAttribute("aria-label", `Accept offer: ${offer.summary}`);
    const blocked = offer.affordable === false;
    accept.disabled = tradeBusy || blocked || !(data.status === undefined ? ready : data.status === "idle");
    foot.append(accept);
    if (offer.gold !== null) { const purse = document.createElement("span"); purse.className = "trade-purse"; purse.textContent = blocked ? `Not enough gold (you have ${offer.gold}).` : `You have ${offer.gold} gold.`; foot.append(purse); }
    const problem = document.createElement("p"); problem.className = "trade-error"; problem.setAttribute("role", "alert"); const showProblem = !!tradeError && tradeErrorRef === offer.ref; problem.hidden = !showProblem; problem.textContent = showProblem ? tradeError : "";
    accept.addEventListener("click", () => acceptTrade(offer.ref));
    card.append(head, who, list, foot, problem); children.push(card);
  }
  region.replaceChildren(...children);
  region.hidden = !children.length;
  // Present in the conversation only while there is something to show (and always last, right after the newest Narrator response).
  if (children.length) conversation.append(region); else region.remove();
}
async function acceptTrade(ref) {
  if (tradeBusy) return;
  tradeBusy = true; tradeError = ""; tradeErrorRef = ref;
  for (const button of document.querySelectorAll(".trade-accept")) button.disabled = true;
  try {
    const response = await fetch("/api/trade/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref, expected_revision: currentRevision }) });
    const data = await response.json();
    tradeBusy = false;
    if (!data?.ok) tradeError = data?.error?.message ?? "The trade was not completed.";
    else if (data.receipt && !tradeReceipts.some(r => r.ref === data.receipt.ref)) tradeReceipts.push(data.receipt);
    if (data?.messages) render(data); else renderTrade({ trade: undefined });
  } catch {
    tradeBusy = false; tradeError = "The request failed. Check the connection and try again."; load();
  }
}
// Block 5A: generic pending-confirmation cards. One compact inline card per request awaiting the player's explicit decision ("Free Maren?"). The browser holds
// only the opaque ref and display strings (the server derives the label from the current view, so a rename or a name reveal re-renders the same card). Confirm and
// Cancel send the ref and the revision this page rendered, nothing else: no name, ID, payload or amount. Both buttons carry meaningful verbs for assistive tech.
let confirmBusy = false, confirmError = "", confirmErrorRef = "";
const shownConfirmations = new Set(), dismissedConfirmations = new Set();
function confirmationRegion() {
  let region = ui("confirmation-region");
  if (!region) { region = document.createElement("div"); region.id = "confirmation-region"; region.className = "confirm-region"; region.setAttribute("aria-live", "polite"); }
  return region;
}
function renderConfirmations(data) {
  const region = confirmationRegion(), view = data.confirmations ?? { cards: [], recent: [] }, children = [];
  // Only outcomes of cards this page showed are echoed (a reload does not resurface old history).
  for (const notice of (view.recent ?? []).filter(n => shownConfirmations.has(n.ref) && !dismissedConfirmations.has(n.ref)).slice(-2)) {
    const note = document.createElement("p"); note.className = `confirm-notice confirm-${notice.status}`; note.dataset.confirmationNotice = notice.ref;
    note.textContent = `${notice.status === "confirmed" ? "\u2713" : "\u2022"} ${notice.subject_label}: ${notice.text}`; children.push(note);
  }
  for (const item of view.cards ?? []) {
    shownConfirmations.add(item.ref);
    const card = document.createElement("section"); card.className = "confirm-card"; card.dataset.confirmationRef = item.ref; card.setAttribute("role", "group"); card.setAttribute("aria-label", `Confirmation needed: ${item.title}`);
    const head = document.createElement("div"); head.className = "confirm-head";
    const label = document.createElement("span"); label.className = "confirm-label"; label.textContent = "NEEDS YOUR CONFIRMATION"; head.append(label);
    const title = document.createElement("strong"); title.className = "confirm-title"; title.textContent = item.title; head.append(title);
    const body = document.createElement("p"); body.className = "confirm-body"; body.textContent = item.body;
    const foot = document.createElement("div"); foot.className = "confirm-foot";
    const blocked = confirmBusy || !(data.status === undefined ? ready : data.status === "idle");
    const confirm = document.createElement("button"); confirm.type = "button"; confirm.className = "confirm-accept"; confirm.textContent = item.confirm_label; confirm.setAttribute("aria-label", `Confirm: ${item.confirm_label}`); confirm.disabled = blocked;
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "confirm-cancel"; cancel.textContent = item.cancel_label; cancel.setAttribute("aria-label", `Cancel: ${item.title} ${item.cancel_label}`); cancel.disabled = blocked;
    confirm.addEventListener("click", () => actOnConfirmation("confirm", item.ref)); cancel.addEventListener("click", () => actOnConfirmation("cancel", item.ref));
    foot.append(confirm, cancel);
    const problem = document.createElement("p"); problem.className = "confirm-error"; problem.setAttribute("role", "alert"); const show = !!confirmError && confirmErrorRef === item.ref; problem.hidden = !show; problem.textContent = show ? confirmError : "";
    card.append(head, body, foot, problem); children.push(card);
  }
  region.replaceChildren(...children);
  region.hidden = !children.length;
  if (children.length) conversation.append(region); else region.remove();
}
async function actOnConfirmation(action, ref) {
  if (confirmBusy) return;
  confirmBusy = true; confirmError = ""; confirmErrorRef = ref;
  for (const button of document.querySelectorAll(".confirm-accept, .confirm-cancel")) button.disabled = true;
  try {
    const response = await fetch(`/api/confirmation/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref, expected_revision: currentRevision }) });
    const data = await response.json();
    confirmBusy = false;
    if (!data?.ok) confirmError = data?.error?.message ?? "That could not be completed. Nothing changed.";
    if (data?.messages) render(data); else renderConfirmations({ confirmations: undefined });
  } catch {
    confirmBusy = false; confirmError = "The request failed. Check the connection and try again."; load();
  }
}
// Block 12 (KPG-1): temporary (provisional) people of the scene. They are not characters: no card, no drawer. [ Keep track ] sends only the opaque
// token and the revision this page rendered; on success the person becomes an ordinary character and appears above with a card like anyone else.
let keepBusy = false, keepError = "", keepErrorToken = "";
function renderProvisional(data) {
  const region = ui("provisional-people");
  if (!region) return;
  const people = data.provisional?.people ?? [], children = [];
  if (people.length) { const heading = document.createElement("h3"); heading.className = "provisional-heading"; heading.textContent = "Temporary"; children.push(heading); }
  const idle = data.status === undefined ? ready : data.status === "idle";
  for (const person of people) {
    const row = document.createElement("div"); row.className = "provisional-person"; row.dataset.keepToken = person.token;
    const detail = document.createElement("span"), name = document.createElement("strong"), note = document.createElement("small");
    name.textContent = person.label; note.textContent = person.keepable ? (person.held ? "Temporary · held" : "Temporary · not kept") : person.reason ?? "Cannot be kept";
    detail.append(name, note);
    const keep = document.createElement("button"); keep.type = "button"; keep.className = "keep-track"; keep.textContent = "Keep track";
    keep.setAttribute("aria-label", `Keep track of ${person.label}`); keep.disabled = keepBusy || !person.keepable || !idle;
    keep.addEventListener("click", () => keepTrack(person.token));
    row.append(detail, keep);
    if (keepError && keepErrorToken === person.token) { const problem = document.createElement("p"); problem.className = "keep-error"; problem.setAttribute("role", "alert"); problem.textContent = keepError; row.append(problem); }
    children.push(row);
  }
  region.replaceChildren(...children);
  region.hidden = !children.length;
}
async function keepTrack(token) {
  if (keepBusy) return;
  keepBusy = true; keepError = ""; keepErrorToken = token;
  for (const button of document.querySelectorAll(".keep-track")) button.disabled = true;
  try {
    const response = await fetch("/api/people/keep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, expected_revision: currentRevision }) });
    const data = await response.json();
    keepBusy = false;
    if (!data?.ok) keepError = data?.error?.message ?? "That person could not be kept. Nothing changed.";
    if (data?.messages) render(data); else load();
  } catch {
    keepBusy = false; keepError = "The request failed. Check the connection and try again."; load();
  }
}
function showError(text) {
  error.textContent = text;
  error.hidden = !text;
}
function render(data) {
  // Save/Load v1: host mode sends `campaign` (null = start screen); the disposable playtest mode sends none.
  renderCampaign(data);
  if ("inventory" in data || data.campaign === null) {
    const incoming = data.campaign === null ? null : data.inventory;
    if (incoming?.campaign_id !== inventoryData?.campaign_id) { inventoryRequest++; inventoryFilter = "all"; inventoryQuery = ""; selectedItemId = undefined; if (ui("inventory-search")) ui("inventory-search").value = ""; }
    inventoryData = incoming; renderInventory();
    if (ui("inventory-nav")) ui("inventory-nav").disabled = !incoming;
  }
  if (data.campaign === null) { clearTimeout(poll); ready = false; input.disabled = send.disabled = true; status.textContent = "Choose or create a campaign."; playerProfile = null; renderPlayer(); return; }
  currentRevision = data.revision;
  if ("player_character" in data) playerProfile = data.player_character ?? null;
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
  renderTrade(data);
  renderConfirmations(data);
  renderProvisional(data);
  follow(wasNear);
  shown = data.messages.length;
  ready = data.status === "idle";
  input.disabled = send.disabled = submitting || !ready;
  renderPlayer();
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
  pending = { player: bubble("player", text), narrator: bubble("narrator pending", "") };
  pending.narrator.text.textContent = PHASE_LABELS.thinking;
  pending.narrator.article.setAttribute("aria-busy", "true");
  follow(wasNear);
  try {
    // One key per submission: a connection that drops after the server accepted the turn is answered from the same turn, never run twice.
    const data = await sendTurn(JSON.stringify({ text, turn_key: newTurnKey(), expected_revision: currentRevision }));
    if (!Array.isArray(data.messages)) throw new Error();
    if (data.ok) { input.value = ""; if (data.warnings?.length) showError("Your turn was saved. Some details could not be refreshed; reload if the story looks out of date."); }
    else {
      clearPending();
      const detail = data.error?.provider_code === "configuration_error" ? "Set OPENROUTER_API_KEY and restart to play." : data.error?.message;
      showError(data.error?.code === "stale_turn" ? "The story changed since you last looked. Your message was not sent; review the story and send it again."
        : data.error?.turn_state_changed ? "Turn failed after state changed. Reload to check the session." : `Turn failed. Your message was not applied.${detail ? ` ${detail}` : ""}`);
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
function newTurnKey() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes); else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
async function sendTurn(body) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body });
      return response.headers?.get("content-type")?.startsWith("application/x-ndjson") ? await readStream(response) : await response.json();
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}
async function readStream(response) {
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", result;
  function lines() {
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "progress") progress(event);
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
// ------------------------------------------------------------------ Save/Load v1: campaigns, save control, load report
// The server owns campaign truth; the browser only shows the list, sends a chosen campaign ID / slot / name, and renders the result.
let campaignMode = false, activeCampaign, saveRequest = false, savePoll;
const SAVE_LABELS = { saving: "Saving…", failed: "Save failed", unsaved: "Unsaved changes", saved: "Saved" };
function resetConversation() {
  ui("conversation")?.replaceChildren(); shown = 0; pending = undefined; comparisonViews.clear(); tradeReceipts = []; tradeError = ""; tradeErrorRef = ""; confirmError = ""; confirmErrorRef = ""; shownConfirmations.clear(); dismissedConfirmations.clear();
}
function renderSaveStatus(save) {
  const el = ui("save-status"), button = ui("save-button");
  if (!el || !button) return;
  const key = saveRequest || save?.saving ? "saving" : save?.error ? "failed" : save?.state === "saved" ? "saved" : "unsaved";
  el.hidden = !campaignMode || !activeCampaign; el.textContent = save ? SAVE_LABELS[key] : "";
  el.className = `save-status save-${key}`;
  el.setAttribute("title", key === "failed" ? "The last save failed. Your progress is still in this session; press Save to retry." : save?.autosave === "stopped" ? "Autosave is paused until the campaign is saved." : "");
  button.disabled = !activeCampaign || saveRequest;
}
function renderCampaign(data) {
  campaignMode = Object.prototype.hasOwnProperty.call(data, "campaign");
  const id = data.campaign?.id ?? null;
  if (campaignMode && id !== activeCampaign) { resetConversation(); closeLightbox(); activeCampaign = id; if (activeView !== "play") switchView("play"); }
  if (ui("campaign-screen")) ui("campaign-screen").hidden = !campaignMode || !!data.campaign;
  if (ui("campaigns-nav")) ui("campaigns-nav").hidden = !campaignMode || !data.campaign;
  if (ui("save-button")) ui("save-button").hidden = !campaignMode || !data.campaign;
  renderSaveStatus(data.campaign?.save);
  // Autosave runs in the background: a light status poll keeps the indicator honest without re-rendering the story.
  clearTimeout(savePoll);
  if (campaignMode && data.campaign) savePoll = setTimeout(function next() { void refreshSaveStatus(); savePoll = setTimeout(next, 4000); }, 4000);
  if (campaignMode && !data.campaign) void loadCampaignList();
}
async function refreshSaveStatus() {
  if (!activeCampaign || saveRequest) return;
  try { const data = await (await fetch("/api/save-status")).json(); if (data.campaign?.id === activeCampaign) renderSaveStatus(data.campaign.save); } catch { /* next tick */ }
}
function showCampaignError(text) { const el = ui("campaign-error"); if (el) { el.textContent = text; el.hidden = !text; } }
function showLoadReport(report) {
  const box = ui("load-report"), text = ui("load-report-text");
  if (!box || !text) return;
  const warnings = report?.warnings ?? [];
  text.textContent = warnings.join(" ");
  box.hidden = !warnings.length;
}
const dayLabel = minute => typeof minute === "number" ? `Day ${Math.floor(minute / 1440)}, ${String(Math.floor(minute % 1440 / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}` : "";
async function campaignRequest(url, body) {
  showCampaignError("");
  for (const id of ["campaign-create", "campaigns-nav"]) if (ui(id)) ui(id).disabled = true;
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (data.ok) { showLoadReport(data.load_report); render(data); }
    else { showCampaignError(data.error?.message ?? "That did not work."); if (!data.campaign) void loadCampaignList(); }
    return data;
  } catch { showCampaignError("The game server did not answer. Check that it is running."); }
  finally { for (const id of ["campaign-create", "campaigns-nav"]) if (ui(id)) ui(id).disabled = false; }
}
async function loadCampaignList() {
  const list = ui("campaign-list");
  if (!list) return;
  let data;
  try { data = await (await fetch("/api/campaigns")).json(); } catch { showCampaignError("Could not list campaigns."); return; }
  const scenarioSelect = ui("campaign-scenario");
  if (scenarioSelect && !scenarioSelect.children?.length) {
    for (const scenario of data.scenarios ?? []) { const option = document.createElement("option"); option.value = scenario.id; option.setAttribute("value", scenario.id); option.textContent = scenario.label; scenarioSelect.append(option); }
    scenarioSelect.value = data.scenarios?.[0]?.id ?? "";
    if (ui("campaign-scenario-description")) ui("campaign-scenario-description").textContent = data.scenarios?.[0]?.description ?? "";
  }
  list.replaceChildren();
  if (!data.campaigns?.length) { const empty = document.createElement("p"); empty.className = "campaign-empty"; empty.textContent = "No campaigns yet. Create one below."; list.append(empty); return; }
  for (const c of data.campaigns) {
    const row = document.createElement("article"); row.className = "campaign-row";
    const info = document.createElement("div"); info.className = "campaign-info";
    const name = document.createElement("strong"); name.textContent = c.display_name;
    const meta = document.createElement("small");
    meta.textContent = c.status === "valid" ? [c.location_name, dayLabel(c.world_minute), c.household_members ? `${c.household_members} in household` : "", c.saved_at ? `saved ${c.saved_at.slice(0, 16).replace("T", " ")} UTC` : ""].filter(Boolean).join(" · ")
      : c.status === "unsupported_version" ? "Made by a newer version of Caldrevan." : "The latest save cannot be read.";
    info.append(name, meta);
    const actions = document.createElement("div"); actions.className = "campaign-actions";
    const button = (label, slot) => { const b = document.createElement("button"); b.setAttribute("type", "button"); b.textContent = label; b.disabled = c.locked; b.addEventListener("click", () => campaignRequest("/api/campaigns/load", { campaign_id: c.campaign_id, slot })); return b; };
    if (c.status === "valid") actions.append(button(c.locked ? "Open elsewhere" : "Load", "current"));
    else {
      if (c.previous_valid) actions.append(button("Load previous save", "previous"));
      if (c.backups?.length) actions.append(button("Load latest backup", `backup:${c.backups[0]}`));
    }
    const remove = document.createElement("button"); remove.setAttribute("type", "button"); remove.className = "campaign-delete"; remove.textContent = "Delete"; remove.disabled = c.locked;
    remove.setAttribute("aria-label", `Delete campaign ${c.display_name}`);
    remove.addEventListener("click", () => {
      // Lightweight confirm step: Delete turns into Cancel / Delete permanently before anything is sent.
      const confirm = document.createElement("button"); confirm.setAttribute("type", "button"); confirm.className = "campaign-delete"; confirm.textContent = "Confirm delete";
      const cancel = document.createElement("button"); cancel.setAttribute("type", "button"); cancel.textContent = "Cancel";
      const note = document.createElement("small"); note.className = "campaign-delete-note"; note.textContent = "Delete this campaign and its saves?";
      actions.replaceChildren(note, cancel, confirm);
      cancel.addEventListener("click", () => void loadCampaignList());
      confirm.addEventListener("click", async () => { confirm.disabled = cancel.disabled = true; await campaignRequest("/api/campaigns/delete", { campaign_id: c.campaign_id }); void loadCampaignList(); });
    });
    actions.append(remove);
    row.append(info, actions); list.append(row);
  }
}
ui("campaign-new")?.addEventListener("submit", event => {
  event.preventDefault();
  const name = ui("campaign-name")?.value?.trim() ?? "";
  if (!name) { showCampaignError("Enter a campaign name."); return; }
  void campaignRequest("/api/campaigns/create", { display_name: name, scenario_id: ui("campaign-scenario")?.value || undefined });
});
ui("campaigns-nav")?.addEventListener("click", () => campaignRequest("/api/campaigns/close", {}));
ui("load-report-dismiss")?.addEventListener("click", () => { if (ui("load-report")) ui("load-report").hidden = true; });
ui("save-button")?.addEventListener("click", async () => {
  if (!activeCampaign || saveRequest) return;
  saveRequest = true; renderSaveStatus({ state: "unsaved" });
  try {
    const data = await (await fetch("/api/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
    saveRequest = false;
    renderSaveStatus(data.campaign?.save ?? { state: "unsaved", error: data.ok ? undefined : "failed" });
    if (!data.ok) showError(data.error?.message ?? "The campaign could not be saved.");
  } catch { saveRequest = false; renderSaveStatus({ state: "unsaved", error: "failed" }); showError("The save request failed. Your progress is still in this session."); }
});
// Missing image files (Save/Load v1): a portrait whose file is gone shows a placeholder instead of a broken image.
document.addEventListener?.("error", event => { if (event.target?.tagName === "IMG") event.target.setAttribute("data-missing", "true"); }, true);
document.addEventListener?.("load", event => { if (event.target?.tagName === "IMG") event.target.removeAttribute?.("data-missing"); }, true);
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});
void load();
