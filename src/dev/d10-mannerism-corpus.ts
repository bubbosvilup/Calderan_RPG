import { turnFixture } from "./turn-fixture.js";
import type { MannerismAction, MannerismTrigger } from "../campaign/mannerism-concepts.js";
export const D10_HOME = "campaign_household_d10";
/** Production-shaped noncanonical controls; grounded objects are registered before any observation. */
export function mannerismFixture() {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "create_household", id: D10_HOME },
    { kind: "set_membership", household_id: D10_HOME, membership: { character_id: "nicco", status: "member", role: "owner" } },
    ...["brenna", "maren"].map(character_id => ({ kind: "join_household" as const, household_id: D10_HOME, character_id })),
    { kind: "register_item", item: { id: "campaign_item_cloth_doll", origin: { kind: "created" }, name: "cloth doll", owner_id: "maren", position: { kind: "carried", character_id: "maren" } } },
    { kind: "register_item", item: { id: "campaign_item_plain_shirt", origin: { kind: "created" }, name: "plain shirt", owner_id: "brenna", position: { kind: "equipped", character_id: "brenna", slot: "body", mode: "worn" } } },
  ] });
  for (const p of f.campaign.exportSnapshot().premium_characters) for (const m of p.mannerisms ?? []) f.campaign.deleteMannerism({ expected_revision: f.campaign.revision, character_id: p.character_id, id: m.id });
  f.campaign.addMannerism({ expected_revision: f.campaign.revision, character_id: "brenna", definition: { canonical_key: "brow_raise_during_exchange", text: "Raises one eyebrow during a short exchange." } });
  f.campaign.addMannerism({ expected_revision: f.campaign.revision, character_id: "maren", definition: { canonical_key: "head_tilt_while_listening", text: "Tilts their head slightly while listening." } });
  return f;
}
export interface MannerismCorpusCase { id: string; category: "valid" | "personality" | "unsupported" | "nsfw" | "ambiguous" | "saved_play" | "global_duplicate"; narration: string;
  expected?: { character_id: string; action: MannerismAction; trigger: MannerismTrigger; requires_item_id?: string } }
export const MANNERISM_CORPUS: readonly MannerismCorpusCase[] = [
  { id: "gaze_a", category: "valid", narration: "Maren lowers her gaze immediately before an obvious lie.", expected: { character_id: "maren", action: "gaze_lower", trigger: "before_lie" } },
  { id: "gaze_b", category: "valid", narration: "Maren looks down just before telling a lie.", expected: { character_id: "maren", action: "gaze_lower", trigger: "before_lie" } },
  { id: "tap_a", category: "valid", narration: "Brenna taps two fingers lightly while waiting to answer.", expected: { character_id: "brenna", action: "two_finger_tap", trigger: "while_waiting" } },
  { id: "tap_b", category: "valid", narration: "Brenna drums two fingertips while waiting.", expected: { character_id: "brenna", action: "two_finger_tap", trigger: "while_waiting" } },
  { id: "shirt", category: "valid", narration: "Brenna smooths her plain shirt after an awkward moment.", expected: { character_id: "brenna", action: "clothing_smooth", trigger: "after_awkwardness", requires_item_id: "campaign_item_plain_shirt" } },
  { id: "doll", category: "valid", narration: "Maren clutches her cloth doll when visibly tense.", expected: { character_id: "maren", action: "object_grip", trigger: "when_visibly_tense", requires_item_id: "campaign_item_cloth_doll" } },
  { id: "cadence", category: "valid", narration: "Brenna leaves a short pause before addressing someone by name.", expected: { character_id: "brenna", action: "speech_pause", trigger: "before_name" } },
  { id: "door", category: "valid", narration: "Maren glances toward the door whenever someone raises their voice.", expected: { character_id: "maren", action: "door_glance", trigger: "when_voice_raised" } },
  { id: "vulnerability", category: "personality", narration: "Maren hides vulnerability behind sarcasm." },
  { id: "affection", category: "personality", narration: "Brenna avoids showing affection." },
  { id: "distrust", category: "personality", narration: "Maren distrusts authority." },
  { id: "protective", category: "personality", narration: "Brenna protects people she loves." },
  { id: "playful", category: "personality", narration: "Maren becomes playful around friends she trusts." },
  { id: "invented_ring", category: "unsupported", narration: "Maren grips her ring when visibly tense." },
  { id: "invented_doll", category: "unsupported", narration: "Brenna clutches her doll when visibly tense." },
  { id: "invented_weapon", category: "unsupported", narration: "Maren grips her sword when visibly tense." },
  { id: "preference", category: "nsfw", narration: "Maren prefers sexual submission." },
  { id: "consent", category: "nsfw", narration: "Brenna's silence shows consent and willingness." },
  { id: "attraction", category: "nsfw", narration: "Maren's gaze reveals her attraction." },
  { id: "ambiguous_smile", category: "ambiguous", narration: "Brenna smiles when nervous." },
  { id: "ambiguous_pause", category: "ambiguous", narration: "Maren pauses before answering." },
  { id: "ambiguous_look", category: "ambiguous", narration: "Brenna looks away." },
  // Recorded delivered narrations in tests/golden/turn-pipeline.json, not organic player-save samples.
  { id: "saved_handover", category: "saved_play", narration: "Brenna accepts boots from Nicco." },
  { id: "saved_carry", category: "saved_play", narration: "Nicco lifts Maren and carries her through the heavy door into the tower." },
  { id: "other_owner_gaze", category: "global_duplicate", narration: "Maren drops her eyes before telling an obvious lie." },
];
