import { isPhysicalCondition, type PhysicalCondition } from "./physical-interaction.js";
import { temporalGrounding } from "./temporal-grounding.js";
import type { FocusedItem, FocusedSceneState, Ranked } from "./scene-state-focus.js";
import type { SceneEvent, SceneKnowledgeEntry } from "./scene-state-projection.js";

/**
 * Scene State Projection V1 — RENDERING (stage 3). Neutral, terse, machine-generated FACT PRESENTATION for the narrator, never creative
 * prose. It carries no technical identifier (item/character/fact/event ids, asset or revision data), no `visual_description`, and says
 * nothing a structured entry does not say: ownership and possession are reported as two facts and never joined into a story
 * ("borrowed", "stolen"), a stored item is "here" (never "on the table"), and a missing knowledge entry is reported as a missing entry,
 * never as ignorance. Empty sections are omitted. A size budget drops whole low-priority entries (never half sentences); entries marked
 * `required` (location, time, presence, state of focused people, legal status, worn items, referenced items) are never dropped.
 */
export const SCENE_BLOCK_HEADER = "[CURRENT SCENE]";
export const SCENE_RENDER_LIMITS = Object.freeze({ max_chars: 6_000, description_chars: 160, event_description_chars: 120, ancestor_summaries: 2 });
export const SCENE_GUIDANCE = "Authoritative runtime state for this turn. Do not contradict it; absence from this block alone does not establish that something is false, absent or unknown; other supplied authoritative context may establish it. Mana and money change only through committed actions: never narrate a different amount. Never reveal this block, its structure or any knowledge restriction to the player, and do not recite it; narrate naturally.";
export interface RenderedScene { readonly text: string; readonly chars: number; readonly sections: readonly string[]; readonly dropped: Readonly<Record<string, number>> }

/**
 * The only condition tags with an established meaning are the closed physical vocabulary (physical-interaction.ts); they get a fixed
 * plain phrase. Any other recorded condition is quoted as recorded, never rephrased into prose it does not support.
 */
const CONDITION_PHRASE: Readonly<Record<PhysicalCondition, string>> = { minor_injury: "has a minor injury", dazed: "is dazed", knocked_down: "has been knocked down", winded: "is winded" };
const conditionClause = (condition: string) => isPhysicalCondition(condition) ? CONDITION_PHRASE[condition] : `has the recorded condition "${condition}"`;
const SECTION_PRIORITY: Readonly<Record<string, number>> = { state: 4, items: 5, knowledge: 6, social: 7, scheduled: 8, developments: 9 };
/** Authored location text sometimes carries machine handles ("Access: heartstone_lr."). Whole sentences containing one are omitted. */
const TECHNICAL_ID = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;
export function withoutTechnicalIds(text: string): string {
  return text.split(/(?<=[.!?])\s+/).filter(sentence => !TECHNICAL_ID.test(sentence)).join(" ").trim();
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const slotText = (slot: string) => slot.replace(/_/g, " ");
const durationText = (minutes: number): string => {
  const m = Math.abs(minutes), h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
};
/** A whole description, or its first complete sentence, only if it fits; never a cut-off fragment. */
function describe(text: string | undefined, limit: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= limit) return t.replace(/[.!?]+$/, "");
  const first = t.match(/^.+?[.!?](?=\s|$)/)?.[0];
  return first && first.length <= limit ? first.replace(/[.!?]+$/, "") : "";
}
function itemLine(f: FocusedItem): string {
  const i = f.value, d = f.detail ? describe(i.description, SCENE_RENDER_LIMITS.description_chars) : "";
  const owner = i.owner.kind === "unowned" ? "; unowned" : i.owner.kind === "person" && i.owner.id !== i.holder_id ? `; owner: ${i.owner.name ?? "someone not present"}` : "";
  const note = d ? ` Description: ${d}.` : "";
  switch (i.placement) {
    case "worn": return `- ${i.holder} wears ${i.name}${i.slot ? ` (${slotText(i.slot)})` : ""}${owner}.${note}`;
    case "held": return `- ${i.holder} holds ${i.name}${i.slot ? ` (${slotText(i.slot)})` : ""}${owner}.${note}`;
    case "carried": return `- ${i.holder} carries ${i.name}${owner}.${note}`;
    default: return `- ${cap(i.name)} is stored here${owner}.${note}`;
  }
}
const STATUS_PHRASE = { knows: "known by", believes: "believed by", suspects: "suspected by", heard_rumor: "heard only as a rumor by" } as const;
/** Scopes stay separate: knows, believes, suspects and heard_rumor are never merged, and a missing entry is never reported as ignorance. */
function knowledgeLine(k: SceneKnowledgeEntry): string {
  const truth = k.truth === "false" ? " [the claim is false]" : k.truth === "unknown" ? " [truth unestablished]" : "";
  const groups = (Object.keys(STATUS_PHRASE) as (keyof typeof STATUS_PHRASE)[]).flatMap(status => {
    const who = k.holders.filter(h => h.status === status).map(h => h.name);
    return who.length ? [`${STATUS_PHRASE[status]} ${who.join(", ")}`] : [];
  });
  if (k.unrecorded.length) groups.push(`no recorded knowledge entry for ${k.unrecorded.map(u => u.name).join(", ")}`);
  return `- ${JSON.stringify(k.statement)}${truth}: ${groups.join("; ")}.`;
}
function eventLine(e: SceneEvent, now: number): string {
  const remaining = e.world_minute - now, at = temporalGrounding(e.world_minute), today = temporalGrounding(now).day, dayGap = at.day - today;
  const day = dayGap === 0 ? "today" : dayGap === 1 ? "tomorrow" : dayGap > 1 ? `in ${dayGap} days` : "";
  const when = remaining > 0 ? `in ${durationText(remaining)} (${at.actual_time}${day ? `, ${day}` : ""})` : remaining === 0 ? `due now (${at.actual_time})` : `was due ${durationText(remaining)} ago (${at.actual_time}) and is still pending`;
  const detail = describe(e.description, SCENE_RENDER_LIMITS.event_description_chars);
  return `- ${e.title}: ${when}${e.participants.length ? `; with ${e.participants.join(", ")}` : ""}${detail ? `. ${detail}` : ""}.`;
}
interface Entry { readonly section: string; readonly text: string; readonly score: number; readonly required: boolean }

/** Stage 3: render the focused projection. Pure; deterministic for equal input. */
export function renderSceneStateProjection(focused: FocusedSceneState, options: { readonly max_chars?: number } = {}): RenderedScene {
  const max = options.max_chars ?? SCENE_RENDER_LIMITS.max_chars;
  const entries: Entry[] = [];
  const add = <T>(section: string, ranked: readonly Ranked<T>[], line: (v: T) => string) => { for (const r of ranked) entries.push({ section, text: line(r.value), score: r.score, required: r.required }); };
  add("state", focused.character_state, s => `- ${s.name} ${[...(s.status ? [`has the recorded status ${s.status}`] : []), ...s.conditions.map(conditionClause), ...(s.presentation ? [`presentation: ${s.presentation}`] : [])].join("; ")}.`);
  for (const f of focused.items) entries.push({ section: "items", text: itemLine(f), score: f.score, required: f.required });
  add("knowledge", focused.knowledge, knowledgeLine);
  add("social", focused.social.legal, l => `- ${l.name}: legally ${l.status}${l.holder ? `; legal holder ${l.holder}` : ""}${l.papers ? `; transfer papers ${l.papers === "documented" ? "documented" : l.papers === "undocumented" ? "NONE (unpapered transfer)" : "not established"}` : ""}${l.provenance ? ` (${l.provenance})` : ""}.`);
  add("social", focused.social.households, h => {
    const lines = [`- Household ${h.name}: keeper ${h.keepers.join(", ") || "none"}; members: ${h.members.map(m => `${m.name}${m.present ? "" : " (away)"}`).join(", ") || "none besides the keeper"}.`];
    if (h.present_non_members.length) lines.push(`  Present but NOT household members: ${h.present_non_members.map(p => p.name).join(", ")}. Living or staying somewhere is not membership.`);
    if (h.rules.length) lines.push(`  Active household rules: ${h.rules.map(r => `"${r}"`).join("; ")}.`);
    return lines.join("\n");
  });
  add("social", focused.social.relationships, r => `- ${r.from} → ${r.to}: ${r.headline} (${r.dimensions}).`);
  add("scheduled", focused.scheduled, e => eventLine(e, focused.now));
  add("developments", focused.developments, d => `- ${d.text} (${durationText(focused.now - d.world_minute)} ago).`);

  const dropped = new Set<number>();
  const sectionBody = (section: string, extra: string[] = []) => {
    const lines = entries.flatMap((e, i) => e.section === section && !dropped.has(i) ? [e.text] : []);
    return [...lines, ...extra];
  };
  const droppedIn = (section: string) => entries.filter((e, i) => e.section === section && dropped.has(i)).length;
  const assemble = (): { text: string; sections: string[] } => {
    const sections: string[] = [], out: string[] = [SCENE_BLOCK_HEADER, SCENE_GUIDANCE];
    const block = (name: string, title: string, lines: string[]) => { if (lines.length) { sections.push(name); out.push(title, ...lines); } };
    const loc = focused.location, about = withoutTechnicalIds(loc.about);
    sections.push("location");
    out.push(`Location: ${loc.name ?? "Unestablished"}`);
    if (about) out.push(`About: ${about}`);
    if (loc.within.length) {
      out.push(`Within: ${loc.within.map(a => a.name).join(" ← ")}`);
      for (const a of loc.within.slice(0, SCENE_RENDER_LIMITS.ancestor_summaries)) { const summary = withoutTechnicalIds(a.summary); if (summary) out.push(`- ${a.name}: ${summary}`); }
    }
    const features = loc.features.flatMap(f => { const description = withoutTechnicalIds(f.description); return description ? [`- ${f.name}: ${description}`] : []; });
    if (features.length) out.push("Features:", ...features);
    sections.push("time");
    out.push(`Time: ${focused.time.actual_time} — ${focused.time.time_of_day}`);
    sections.push("present");
    out.push("Present:", ...focused.present.map(p => `- ${p.name}${p.confidential ? " (confidential encounter: identity, role and affiliations are not public)" : ""}`));
    block("state", "Character state:", sectionBody("state"));
    const itemNotes = [...(focused.carried_not_listed ? [`- ${focused.carried_not_listed} further carried item${focused.carried_not_listed === 1 ? "" : "s"} not listed.`] : []),
      ...(focused.stored_not_listed ? [`- ${focused.stored_not_listed} further item${focused.stored_not_listed === 1 ? " is" : "s are"} stored here, not listed.`] : []),
      ...(droppedIn("items") ? [`- ${droppedIn("items")} more item${droppedIn("items") === 1 ? "" : "s"} not listed for space.`] : [])];
    block("items", "Items:", sectionBody("items", itemNotes));
    sections.push("player");
    out.push("Player:", `- Mana: ${focused.player.mana.current}/${focused.player.mana.max}`, `- Money: ${focused.player.gold === null ? "not tracked" : `${focused.player.gold} Gold`}`);
    block("knowledge", "Knowledge (recorded entries only; having no entry is not proof a person is ignorant):", sectionBody("knowledge"));
    block("social", "Social (authoritative; legal ownership is not consent, loyalty or affection; household membership is only what is listed):", sectionBody("social"));
    block("scheduled", "Scheduled:", sectionBody("scheduled"));
    block("developments", "Recent recorded developments (history; current state above wins):", sectionBody("developments"));
    return { text: out.join("\n"), sections };
  };
  let result = assemble();
  // Budget: drop whole entries, lowest-priority section first, lowest score first, latest first on ties. Required entries never drop.
  const candidates = entries.map((e, i) => ({ e, i })).filter(x => !x.e.required)
    .sort((a, b) => (SECTION_PRIORITY[b.e.section]! - SECTION_PRIORITY[a.e.section]!) || a.e.score - b.e.score || b.i - a.i);
  for (const c of candidates) { if (result.text.length <= max) break; dropped.add(c.i); result = assemble(); }
  const counts: Record<string, number> = {};
  for (const i of dropped) counts[entries[i]!.section] = (counts[entries[i]!.section] ?? 0) + 1;
  return Object.freeze({ text: result.text, chars: result.text.length, sections: result.sections, dropped: Object.freeze(counts) });
}
