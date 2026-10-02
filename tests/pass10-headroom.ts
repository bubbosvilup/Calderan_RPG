import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import type { CampaignCommand, ReflectionNote } from "../src/campaign/types.js";
import { buildTurnContext, CONTEXT_LIMITS } from "../src/turn/context-builder.js";
import { NPC_PLUS_LIMITS } from "../src/turn/npc-plus.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";

/** NPC+ Pass 10 context headroom boundary (diagnostic, no provider). `node .build/tests/pass10-headroom.js` prints the table used in the report. */
export interface Config { n: number; history: "none" | "full" | "rollup"; reflections: boolean; facts: number; events: number; rich: boolean; itemsPer: number; knowsPer: number; rules: number }
const world = await loadWorld("data");
const pad = (k: number, w = 3) => String(k).padStart(w, "0");
let serial = 0;
export function build(c: Config) {
  const campaign = createOpeningCampaign(world, `pass10_headroom_${++serial}`);
  const apply = (commands: CampaignCommand[]) => { for (let i = 0; i < commands.length; i += 100) campaign.apply({ expected_revision: campaign.revision, commands: commands.slice(i, i + 100) }); };
  const id = (k: number) => `campaign_character_h${pad(k)}`;
  const cmds: CampaignCommand[] = [];
  for (let k = 0; k < c.n; k++) cmds.push({ kind: "register_character", character: { id: id(k), origin: { kind: "created" },
    profile: { name: `Member${pad(k)}`, ...(c.rich ? { sex: "female", voice: "low, careful, with a habit of trailing off mid-sentence", appearance: { height_cm: 170, build: "slight", eyes: "grey", hair: { color: "dark brown" }, scars: [{ description: "an old wrist scar" }] } } : {}) },
    current: { current_location: OPENING_LOCATION, status: "active", ...(c.rich ? { presentation: "Standing close and watchful, hands folded", conditions: ["recovering"] } : {}) } } });
  for (let k = 0; k < c.n; k++) for (let j = 0; j < c.itemsPer; j++) cmds.push({ kind: "register_item", item: { id: `campaign_item_h${pad(k)}_${j}`, origin: { kind: "created" }, name: `worn satchel ${k}-${j}`, owner_id: id(k), position: { kind: "carried", character_id: id(k) } } });
  for (let k = 0; k < c.facts; k++) cmds.push({ kind: "create_fact", fact: { id: `campaign_fact_h${pad(k)}`, content: { kind: "campaign", statement: `Ledger entry ${pad(k)} records a debt in the harbor district.`, truth: "true" } } }, { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id: `campaign_fact_h${pad(k)}`, status: "knows" } });
  for (let k = 0; k < c.n; k++) for (let j = 0; j < Math.min(c.knowsPer, c.facts); j++) cmds.push({ kind: "set_knowledge", knowledge: { character_id: id(k), fact_id: `campaign_fact_h${pad((k + j) % c.facts)}`, status: "knows" } });
  for (let k = 0; k < c.events; k++) cmds.push({ kind: "schedule_event", id: `campaign_event_h${pad(k)}`, title: `Meeting ${pad(k)}`, scheduled_world_minute: 50_000 + k * 7, participants: ["nicco"] });
  for (let k = 0; k < c.n; k++) cmds.push({ kind: "seed_relationship", relationship: { from_character_id: id(k), to_character_id: "nicco", dimensions: { trust: "moderate", affection: "low", respect: "moderate" } } });
  apply(cmds);
  apply(Array.from({ length: c.n }, (_, k): CampaignCommand => ({ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: id(k) })));
  apply(Array.from({ length: c.rules }, (_, k): CampaignCommand => ({ kind: "add_household_rule", household_id: OPENING_HOUSEHOLD, text: `Rule ${k}: nobody enters the cellar alone after dusk.` })));
  if (c.history !== "none") {
    const rounds = c.history === "full" ? 12 : 30;
    for (let r = 0; r < rounds; r++) {
      const batch: CampaignCommand[] = [];
      for (let k = 0; k < c.n; k++) batch.push({ kind: "move_character", character_id: id(k), location_id: r % 2 === 0 ? "heartstone_lr" : OPENING_LOCATION });
      apply(batch);
    }
    // finish at the opening location so everyone is present with Nicco
    if (campaign.exportSnapshot().characters.some(ch => ch.id === id(0) && ch.current.current_location !== OPENING_LOCATION)) apply(Array.from({ length: c.n }, (_, k): CampaignCommand => ({ kind: "move_character", character_id: id(k), location_id: OPENING_LOCATION })));
    if (c.history === "rollup") for (let r = 0; r < 3; r++) apply(Array.from({ length: c.n }, (_, k): CampaignCommand => ({ kind: "adjust_relationship", from_character_id: id(k), to_character_id: "nicco", dimension: (["trust", "wariness", "affection"] as const)[r]!, direction: "raise" })));
  }
  if (c.reflections) {
    const kinds = [["stance", 4], ["signature_pattern", 4], ["shared_motif", 4], ["emerging_role", 3], ["unresolved_tension", 3]] as const;
    for (let k = 0; k < c.n; k++) apply([(() => {
      const rev = campaign.revision;
      const notes: ReflectionNote[] = kinds.flatMap(([kind, cap]) => Array.from({ length: cap }, (_, j) => ({ id: `r${rev + 1}_${kind}_${j + 1}`, kind, label: `${kind}_${j}`, text: "x".repeat(150), evidence_refs: [`npcmem:${id(k)}:history:r${3 + (k % 3)}.0`], confidence: "medium" as const, created_revision: rev + 1, updated_revision: rev + 1 })));
      return { kind: "record_reflection", character_id: id(k), notes, reflected_revision: rev } as CampaignCommand;
    })()]);
  }
  return { campaign, id };
}
export function measure(c: Config) {
  const { campaign } = build(c);
  const snapshot = campaign.exportSnapshot();
  try {
    const context = buildTurnContext(world, snapshot, { input: "Member000, come here." });
    const { npc_plus, ...authority } = context;
    const authorityChars = JSON.stringify(authority).length, total = JSON.stringify(context).length;
    return { ok: true as const, authority: authorityChars, npc_plus: npc_plus ? JSON.stringify(npc_plus).length : 0, total, tiers: npc_plus?.diagnostics.tier_counts, omitted: npc_plus?.diagnostics.omitted_fragments, refs: npc_plus?.diagnostics.recovery_refs,
      before: npc_plus?.diagnostics.chars_before, after: npc_plus?.diagnostics.chars_after, people: context.characters.length };
  } catch (e) { return { ok: false as const, error: (e as Error).message }; }
}
export const BASE: Config = { n: 5, history: "none", reflections: false, facts: 0, events: 0, rich: true, itemsPer: 2, knowsPer: 0, rules: 0 };
if (process.argv[1]?.endsWith("pass10-headroom.js")) {
  const rows: [string, Config][] = [];
  for (const n of [5, 10, 20]) for (const history of ["none", "full", "rollup"] as const) rows.push([`rich n=${n} history=${history}`, { ...BASE, n, history }]);
  for (const n of [30]) for (const history of ["none", "full", "rollup"] as const) rows.push([`lean n=${n} history=${history}`, { ...BASE, rich: false, itemsPer: 0, n, history }]);
  rows.push(["lean n=30 full history + all reflection caps", { ...BASE, rich: false, itemsPer: 0, n: 30, history: "full", reflections: true }]);
  rows.push(["lean n=30 rollup+reflect+facts64+events32+know3+rules5", { ...BASE, rich: false, itemsPer: 0, n: 30, history: "rollup", reflections: true, facts: 64, events: 32, knowsPer: 3, rules: 5 }]);
  rows.push(["rich n=10 rollup+reflect+facts64+events32+know3+rules5", { ...BASE, n: 10, history: "rollup", reflections: true, facts: 64, events: 32, knowsPer: 3, rules: 5 }]);
  console.log("limits", { cap: CONTEXT_LIMITS.serialized_characters, npc_plus_budget: NPC_PLUS_LIMITS.budget_characters });
  for (const [label, cfg] of rows) { const m = measure(cfg); console.log(label.padEnd(44), m.ok ? JSON.stringify(m) : `FAIL ${m.error}`); }
  // boundary: how many present NPC+ before context_too_large, per profile weight
  for (const [label, cfg] of [["lean (no profile, no items)", { ...BASE, rich: false, itemsPer: 0 }], ["rich (profile+2 items)", BASE], ["rich + 3 facts known each", { ...BASE, facts: 32, knowsPer: 3 }], ["rich + 5 rules", { ...BASE, rules: 5 }]] as [string, Config][]) {
    let lo = 1, hi = 400; while (lo < hi) { const mid = (lo + hi) >> 1; if (measure({ ...cfg, n: mid }).ok) lo = mid + 1; else hi = mid; }
    const at = measure({ ...cfg, n: lo - 1 }), per = at.ok ? Math.round(at.authority / (lo - 1)) : 0;
    console.log(`boundary ${label.padEnd(30)} first failing n=${lo}; last ok n=${lo - 1}; authority chars at last ok ${at.ok ? at.authority : "?"} (~${per}/present NPC+), npc_plus there ${at.ok ? at.npc_plus : "?"}`);
  }
}
if (process.argv[1]?.endsWith("pass10-headroom.js")) {
  // Anatomy of the authority context per present NPC+ (what grows first). Each row isolates one growth factor against the lean baseline.
  const anatomy = (label: string, cfg: Config) => {
    const { campaign } = build(cfg), ctx = buildTurnContext(world, campaign.exportSnapshot(), { input: "Member000, come here." }) as Record<string, unknown>;
    const per = Object.fromEntries(Object.entries(ctx).filter(([k]) => k !== "npc_plus").map(([k, v]) => [k, JSON.stringify(v).length]));
    console.log(`anatomy ${label.padEnd(26)} n=${cfg.n}`, JSON.stringify(per));
  };
  anatomy("lean", { ...BASE, rich: false, itemsPer: 0, n: 20 });
  anatomy("rich profile", { ...BASE, rich: true, itemsPer: 0, n: 20 });
  anatomy("+2 items each", { ...BASE, rich: false, itemsPer: 2, n: 20 });
  anatomy("+3 known facts each", { ...BASE, rich: false, itemsPer: 0, n: 20, facts: 32, knowsPer: 3 });
  anatomy("+5 rules", { ...BASE, rich: false, itemsPer: 0, n: 20, rules: 5 });
  anatomy("+32 events", { ...BASE, rich: false, itemsPer: 0, n: 20, events: 32 });
}
if (process.argv[1]?.endsWith("pass10-headroom.js")) {
  for (const knows of [3, 8, 16, 32]) {
    const cfg: Config = { ...BASE, rich: false, itemsPer: 0, facts: 32, knowsPer: knows };
    let lo = 1, hi = 200; while (lo < hi) { const mid = (lo + hi) >> 1; if (measure({ ...cfg, n: mid }).ok) lo = mid + 1; else hi = mid; }
    console.log(`boundary lean, each present NPC+ knows ${String(knows).padStart(2)} of the 32 shown facts: first failing n=${lo}`);
  }
}
