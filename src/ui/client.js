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
  if (view !== "editor") closeLightbox();
  for (const [key, id] of [["play", "play-view"], ["inventory", "inventory-view"], ["household", "household-view"], ["editor", "member-editor"], ["player", "player-view"]]) if (ui(id)) ui(id).hidden = key !== view;
  ui("inventory-nav")?.setAttribute("aria-pressed", String(view === "inventory"));
  if (view !== "inventory") clearTimeout(inventoryPoll);
  ui("household-nav")?.setAttribute("aria-pressed", String(view === "household" || view === "editor"));
  ui("player-nav")?.setAttribute("aria-pressed", String(view === "player"));
  if (view === "household") ui("household-close")?.focus();
  else if (view === "player") ui("player-back")?.focus();
  else if (view === "inventory") ui("inventory-back")?.focus();
  else if (view === "play") ui("household-nav")?.focus();
}
// Inventory UI V1 is a projection of committed possession, never client-owned item state.
let inventoryData = null, inventoryFilter = "all", inventoryQuery = "", inventoryPoll, inventoryRequest = 0;
const inventoryCategory = category => (category ?? "miscellaneous").replaceAll("_", " ");
function renderInventory() {
  const container = ui("inventory-items"); if (!container) return;
  const all = inventoryData?.items ?? [];
  const equipped = all.filter(i => i.position.kind === "equipped").length;
  if (ui("inventory-count")) ui("inventory-count").textContent = `${all.length} ${all.length === 1 ? "item" : "items"} · ${all.length - equipped} carried · ${equipped} equipped`;
  for (const filter of ["all", "carried", "equipped"]) ui(`inventory-${filter}`)?.setAttribute("aria-pressed", String(inventoryFilter === filter));
  const items = all.filter(i => (inventoryFilter === "all" || i.position.kind === inventoryFilter) && `${i.name} ${i.description ?? ""} ${i.category ?? ""}`.toLowerCase().includes(inventoryQuery));
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p"); empty.className = "inventory-empty";
    empty.textContent = !all.length ? "Your inventory is empty. Items you take or equip will appear here." : "No items match this filter or search.";
    container.append(empty);
  }
  for (const item of items) {
    const card = document.createElement("article"); card.className = "inventory-item";
    const art = document.createElement("div"); art.className = "inventory-art";
    const placeholder = document.createElement("span"); placeholder.className = "inventory-placeholder";
    placeholder.textContent = item.sprite_status === "pending" ? "Illustration on its way" : item.sprite_status === "failed" ? "Illustration unavailable" : "No illustration yet";
    art.append(placeholder);
    if (item.sprite_status === "ready" && item.sprite_url) {
      const image = document.createElement("img"); image.alt = item.name; image.loading = "lazy"; image.src = item.sprite_url;
      placeholder.hidden = true;
      image.addEventListener("error", () => { image.hidden = true; placeholder.hidden = false; placeholder.textContent = "Illustration unavailable"; }, { once: true });
      art.append(image);
    }
    const content = document.createElement("div"); content.className = "inventory-item-content";
    const tag = document.createElement("span"); tag.className = "inventory-category"; tag.textContent = inventoryCategory(item.category);
    const name = document.createElement("h3"); name.textContent = item.name;
    const description = document.createElement("p"); description.className = "inventory-description"; description.textContent = item.description || "No description available.";
    const position = document.createElement("span"); position.className = "inventory-position";
    position.textContent = item.position.kind === "equipped" ? `Equipped · ${item.position.slot.replaceAll("_", " ")} · ${item.position.mode === "worn" ? "worn" : "held"}` : "Carried";
    content.append(tag, name, description, position); card.append(art, content); container.append(card);
  }
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
  if (ui("editor-image-prompt")) ui("editor-image-prompt").value = editor?.portrait_prompts?.avatar?.prompt ?? "";
  if (ui("editor-negative-prompt")) ui("editor-negative-prompt").value = editor?.portrait_prompts?.avatar?.negative_prompt ?? "";
  if (ui("editor-fullbody-prompt")) ui("editor-fullbody-prompt").value = editor?.portrait_prompts?.fullbody?.prompt ?? "";
  if (ui("editor-fullbody-negative-prompt")) ui("editor-fullbody-negative-prompt").value = editor?.portrait_prompts?.fullbody?.negative_prompt ?? "";
  if (fill) { showPortraitError(""); portraitResult = ""; }
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
// Portrait Gallery V2 + image generation v1. Generation is an explicit click (it costs money) asking the server for one batch of 3
// options of one kind (avatar or full body) in one curated pose; the browser sends only the opaque ref, the revision the editor opened
// with, the kind and a pose id from the server's list and, for role/delete actions, an opaque Gallery item token. What is shown is
// always the committed projection: nothing optimistic, nothing on open. The Full Body slot never falls back to the Avatar.
let portraitBusy = false, portraitAction = "", portraitKind = "", portraitResult = "", lightboxToken, lightboxConfirm = false, lightboxReturn;
const KIND_LABELS = { avatar: "Avatar image", fullbody: "Full-body image", legacy: "Earlier image" };
function showPortraitError(text) { const el = ui("portrait-error"); if (el) { el.textContent = text; el.hidden = !text; } }
function showLightboxError(text) { const el = ui("lightbox-error"); if (el) { el.textContent = text; el.hidden = !text; } }
function editorPortrait() { return householdCharacters.get(editorRef)?.appearance_editor?.portrait; }
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
  renderGallery(gallery);
  renderLightbox();
}
function galleryChip(label, aria, held, onClick, wrongKind = false) {
  const chip = document.createElement("button"); chip.className = `gallery-chip${label === "Delete" ? " danger" : ""}`; chip.setAttribute("type", "button");
  chip.setAttribute("aria-label", held ? `${label} (current)` : wrongKind ? `${aria} (not available for this image kind)` : aria); chip.textContent = label;
  if (label !== "Delete") chip.setAttribute("aria-pressed", String(held));
  if (wrongKind) chip.setAttribute("title", label === "Avatar" ? "Only avatar images can be the Avatar." : "Only full-body images can be the Full Body.");
  chip.disabled = portraitBusy || held || wrongKind; chip.addEventListener("click", onClick); return chip;
}
function renderGallery(gallery) {
  const grid = ui("portrait-gallery");
  if (!grid) return;
  grid.replaceChildren();
  if (!gallery.length) {
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
async function portraitRequest(url, body, action) {
  if (!editorRef || portraitBusy) return;
  if (action === "generate" && editorPortrait() && !editorPortrait().can_generate_batch) return;
  portraitBusy = true; portraitAction = action; portraitKind = action === "generate" ? body.kind : ""; showPortraitError(""); showLightboxError("");
  if (action === "generate") portraitResult = "";
  renderPortrait(householdCharacters.get(editorRef)?.appearance_editor);
  const inViewer = !!lightboxToken && (action === "role" || action === "delete" || action === "full-body-clear");
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: editorRef, expected_revision: editorRevision, ...body }) });
    const data = await response.json();
    portraitBusy = false; portraitAction = "";
    if (data?.messages) render(data);
    // Portrait media never touches appearance: unsaved form edits stay valid at the new revision.
    if (data?.ok) {
      if (data.changed) editorRevision = currentRevision;
      if (action === "generate") portraitResult = data.message ?? "";
      if (action === "delete") closeLightbox(); else lightboxConfirm = false;
    } else (inViewer ? showLightboxError : showPortraitError)(data?.error?.message ?? (action === "generate" ? "Portrait generation failed." : "The portrait change was not saved."));
  } catch {
    portraitBusy = false; portraitAction = "";
    (inViewer ? showLightboxError : showPortraitError)("The portrait request failed. Check the connection and try again.");
  }
  renderPortrait(householdCharacters.get(editorRef)?.appearance_editor);
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
// Player Character Profile V1: the active player character's visible appearance. View mode lists saved values; Edit fills the form
// from the committed profile and remembers the revision it opened with; Cancel discards; Save sends only changed keys (empty =
// clear). "Narrator sees" is the server's projection, exactly what the narrator receives, never a client-side rendering.
let playerProfile = null, playerEditing = false, playerRevision, playerSaving = false;
const playerInputs = new Map();
const playerFields = () => [...(playerProfile?.identity ?? []).map(f => ({ ...f, kind: "text" })), ...(playerProfile?.fields ?? [])];
function showPlayerError(text) { const el = ui("player-error"); if (el) { el.textContent = text; el.hidden = !text; } }
function playerPatch() {
  const patch = {}, invalid = [];
  for (const field of playerFields()) {
    const input = playerInputs.get(field.key);
    if (!input) continue;
    const next = editorValue(field, input.value), stored = field.value === null ? null : editorValue(field, field.value);
    const empty = Array.isArray(next) ? !next.length : next === "", range = NUMBER_RANGES[field.key];
    if (field.kind === "number" && !empty && (!Number.isInteger(next) || (range && (next < range[0] || next > range[1])))) { invalid.push(field.key); continue; }
    if (empty) { if (stored !== null) patch[field.key] = null; continue; }
    if (JSON.stringify(next) !== JSON.stringify(stored)) patch[field.key] = next;
  }
  return { patch, valid: !invalid.length, invalid };
}
function updatePlayerSave() {
  const { patch, valid, invalid } = playerPatch();
  for (const [key, input] of playerInputs) if (invalid.includes(key)) input.setAttribute("aria-invalid", "true"); else input.removeAttribute?.("aria-invalid");
  if (ui("player-save")) ui("player-save").disabled = playerSaving || !valid || !Object.keys(patch).length;
}
function buildPlayerForm() {
  const form = ui("player-form");
  if (!form) return;
  playerInputs.clear();
  form.replaceChildren(...playerFields().map(field => {
    const label = document.createElement("label"), input = document.createElement(field.kind === "lines" || field.key === "description" ? "textarea" : "input");
    label.textContent = field.kind === "lines" ? `${field.label} (one per line)` : field.unit ? `${field.label} (${field.unit})` : field.label;
    if (field.kind === "number") { input.setAttribute("type", "number"); input.setAttribute("step", "1"); }
    else input.setAttribute("maxlength", String(field.key === "description" ? 1000 : field.key in { sex: 1, species: 1, apparent_age: 1 } ? 60 : 200));
    if (field.kind === "lines" || field.key === "description") input.setAttribute("rows", field.key === "description" ? "4" : "3");
    input.setAttribute("aria-label", field.label); input.setAttribute("placeholder", "Not set");
    input.value = field.value ?? "";
    input.addEventListener("input", () => updatePlayerSave());
    playerInputs.set(field.key, input); label.append(input); return label;
  }));
}
function renderPlayer() {
  const p = playerProfile;
  if (ui("player-nav")) ui("player-nav").disabled = !p;
  if (!p) { if (activeView === "player") switchView("play"); return; }
  if (ui("player-name")) ui("player-name").textContent = p.name.toUpperCase();
  if (ui("player-role")) ui("player-role").textContent = p.role_label;
  if (ui("player-narrator-summary")) ui("player-narrator-summary").textContent = p.narrator_summary || "No visible appearance set.";
  const details = ui("player-details");
  if (details) details.replaceChildren(...playerFields().filter(f => f.value !== null).flatMap(f => {
    const dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = f.unit ? `${f.label} (${f.unit})` : f.label; dd.textContent = f.kind === "lines" ? f.value.split("\n").join(" · ") : f.value; return [dt, dd];
  }));
  if (details && !details.children.length) { const empty = document.createElement("dd"); empty.textContent = "No visible appearance set."; details.append(empty); }
  for (const [id, hidden] of [["player-details", playerEditing], ["player-form", !playerEditing], ["player-edit", playerEditing], ["player-cancel", !playerEditing], ["player-save", !playerEditing]]) if (ui(id)) ui(id).hidden = hidden;
  if (ui("player-edit")) ui("player-edit").disabled = !ready;
  updatePlayerSave();
}
function setPlayerEditing(editing) {
  playerEditing = editing; showPlayerError("");
  if (editing) { playerRevision = currentRevision; buildPlayerForm(); } else { playerInputs.clear(); ui("player-form")?.replaceChildren(); }
  renderPlayer();
  (editing ? [...playerInputs.values()][0] : ui("player-edit"))?.focus();
}
async function savePlayer() {
  const { patch, valid } = playerPatch();
  if (!playerEditing || playerSaving || !valid || !Object.keys(patch).length) return;
  playerSaving = true; updatePlayerSave();
  try {
    const response = await fetch("/api/player-character", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_revision: playerRevision, patch }) });
    const data = await response.json();
    playerSaving = false;
    if (data?.messages) render(data);
    if (data?.ok) setPlayerEditing(false);
    else showPlayerError(data?.error?.message ?? "The profile was not saved.");
  } catch { playerSaving = false; showPlayerError("The profile was not saved. Check the connection and try again."); }
  updatePlayerSave();
}
ui("player-nav")?.addEventListener("click", () => { if (!playerProfile) return; playerEditing = false; playerInputs.clear(); switchView("player"); renderPlayer(); });
ui("player-back")?.addEventListener("click", () => { playerEditing = false; playerInputs.clear(); switchView("play"); });
ui("player-edit")?.addEventListener("click", () => { if (playerProfile && ready) setPlayerEditing(true); });
ui("player-cancel")?.addEventListener("click", () => setPlayerEditing(false));
ui("player-save")?.addEventListener("click", () => savePlayer());
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
      if (person.card?.avatar_url) { const image = document.createElement("img"); image.className = "avatar-image"; image.setAttribute("alt", ""); image.setAttribute("src", person.card.avatar_url); avatar.replaceChildren(image); avatar.className += " has-image"; }
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

function showError(text) {
  error.textContent = text;
  error.hidden = !text;
}
function render(data) {
  // Save/Load v1: host mode sends `campaign` (null = start screen); the disposable playtest mode sends none.
  renderCampaign(data);
  if ("inventory" in data || data.campaign === null) {
    const incoming = data.campaign === null ? null : data.inventory;
    if (incoming?.campaign_id !== inventoryData?.campaign_id) { inventoryRequest++; inventoryFilter = "all"; inventoryQuery = ""; if (ui("inventory-search")) ui("inventory-search").value = ""; }
    inventoryData = incoming; renderInventory();
    if (ui("inventory-nav")) ui("inventory-nav").disabled = !incoming;
  }
  if (data.campaign === null) { clearTimeout(poll); ready = false; input.disabled = send.disabled = true; status.textContent = "Choose or create a campaign."; playerProfile = null; playerEditing = false; renderPlayer(); return; }
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
// ------------------------------------------------------------------ Save/Load v1: campaigns, save control, load report
// The server owns campaign truth; the browser only shows the list, sends a chosen campaign ID / slot / name, and renders the result.
let campaignMode = false, activeCampaign, saveRequest = false, savePoll;
const SAVE_LABELS = { saving: "Saving…", failed: "Save failed", unsaved: "Unsaved changes", saved: "Saved" };
function resetConversation() {
  ui("conversation")?.replaceChildren(); shown = 0; pending = undefined; comparisonViews.clear();
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
