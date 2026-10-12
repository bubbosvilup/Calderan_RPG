import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import { activeNpcPlus } from "../campaign/premium-characters.js";
import { GATES } from "./language/gates.js";
import { escapeRegExp as esc } from "./language/text.js";
import { invitedFollowers } from "./follow-invitation.js";
import { persistentCharactersAt, type MovableCharacter } from "./character-movement.js";

/**
 * Consolidation block 3 — who MAY follow Nicco. One pure, per-turn, derived answer shared by the intent notes, narrated-follow authorization
 * and the narration audit (so all three always agree). It is NOT a party: nothing here is persisted, and being a candidate never moves anyone.
 * A candidate only becomes movement through (A) a completed narrated follow of THAT SAME person (evidence, then authorization) or (B) the
 * narrow deterministic escort of a person Nicco holds whom the player's own words address and lead (`resolveHeldEscort`).
 *
 * Reasons: an active NPC+; a person Nicco legally holds (a Slave NPC he bought); a current household member; a person the player invited by name
 * this turn. Ownership and membership are only ELIGIBILITY. A free, uninvited, non-household person is never a candidate. Authored NPCs other than
 * active NPC+ are never candidates (their whereabouts are canon-owned).
 */
export type FollowReason = "npc_plus_active" | "held_by_player" | "household_member" | "invited_this_turn";
export type FollowCandidates = ReadonlyMap<string, readonly FollowReason[]>;

export function followCandidates(snapshot: DeepReadonly<CampaignSnapshot>, people: readonly MovableCharacter[], player_input: string): FollowCandidates {
  const npcPlus = activeNpcPlus(snapshot);
  const created = new Set(snapshot.characters.filter(c => c.origin.kind === "created" && c.current.status !== "dead").map(c => c.id));
  const held = new Set(snapshot.legal_statuses.filter(l => l.status === "enslaved" && l.holder_id === "nicco").map(l => l.character_id));
  const members = new Set(snapshot.households.flatMap(h => h.members.filter(m => m.status === "member").map(m => m.character_id)));
  const mine = people.filter(p => created.has(p.id));
  const named = (m: MovableCharacter) => m.names.some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(player_input));
  const invited = new Set(invitedFollowers(player_input, mine).filter(id => { const m = mine.find(x => x.id === id); return !!m && named(m); }));
  const out = new Map<string, FollowReason[]>();
  for (const p of people) {
    const reasons: FollowReason[] = [];
    if (npcPlus.has(p.id)) reasons.push("npc_plus_active");
    if (created.has(p.id)) {
      if (held.has(p.id)) reasons.push("held_by_player");
      if (members.has(p.id)) reasons.push("household_member");
      if (invited.has(p.id)) reasons.push("invited_this_turn");
    }
    if (reasons.length) out.set(p.id, reasons);
  }
  return out;
}
export const followerIds = (candidates: FollowCandidates): ReadonlySet<string> => new Set(candidates.keys());

/** The player leads someone along: a cohortative or imperative that includes the addressee. */
const LEAD = /\b(?:let'?s|lets)\s+(?:go|head|leave|get|return|walk|move|set off|depart|be off|get going)\b|\bcome\s+(?:with|along|on|home|back)\b|\bfollow\s+me\b|\bwalk\s+with\s+me\b|\b(?:we|you and I|you and me)\s+(?:will\s+|shall\s+|are\s+|'re\s+|'ll\s+)?(?:go|head|leave|return|going|heading)\b|\bwe'?re\s+(?:going|heading|leaving)\b|\b(?:with me|along with me)\b|\b(?:i'?m|i am|i will|i'?ll)\s+(?:taking|bringing|leading)\s+you\b|\btaking you\b|\bbringing you\b/i;
/** The player tells the person to stay or otherwise withholds them. */
const STAY = /\b(?:stay|stays|remain|remains|wait(?:s)?\s+(?:here|there|for)|not\s+(?:coming|come|follow|with)|don'?t\s+(?:come|follow)|do not\s+(?:come|follow)|you(?:'ll|\s+will)?\s+stay|alone|without you|without her|without him|without them|go on without|behind)\b/i;
const sentencesOfInput = (input: string) => input.replace(/[*"“”]/g, " ").split(/(?<=[.!?])\s+|\n+/).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);

/**
 * (B) The narrow deterministic escort. Nicco's own movement to another place resolved this turn (`natural` carries the runtime_delta), and the
 * player's sentence NAMES a person Nicco legally holds who stands here with him and LEADS them along ("Alright Maren, I just purchased you,
 * let's go home."). The person moves with him in the SAME atomic batch (the `move_character` is bound to his resolved arrival), exactly like a
 * physical carry. No pronoun guessing, no unnamed "come with me", no plural, nobody who is not held, nobody who is not here, no refusal or stay
 * wording, and no semantics for consent: this is the player's own act, not an NPC decision.
 */
export function resolveHeldEscort(input: string, snapshot: DeepReadonly<CampaignSnapshot>, context: TurnContext, world: WorldStore, natural: readonly CampaignCommand[], already: readonly string[] = []):
  { readonly runtime: readonly CampaignCommand[]; readonly notes: readonly string[]; readonly escorted: readonly string[] } {
  const none = { runtime: [], notes: [], escorted: [] };
  const here = snapshot.runtime.scene.player_location;
  const moved = natural.find((c): c is Extract<CampaignCommand, { kind: "runtime_delta" }> => c.kind === "runtime_delta" && !!c.delta.player_location && c.delta.player_location !== here);
  if (!moved) return none;
  const people = persistentCharactersAt(snapshot, world, [here]).filter(m => context.characters.some(c => c.id === m.id) && !already.includes(m.id));
  const held = followCandidates(snapshot, people, "");
  const candidates = people.filter(p => held.get(p.id)?.includes("held_by_player"));
  if (!candidates.length) return none;
  const sentences = sentencesOfInput(input);
  const led: MovableCharacter[] = [];
  for (const p of candidates) {
    const named = (s: string) => p.names.some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(s));
    const addressed = sentences.filter(named);
    if (!addressed.length) continue;
    // Every sentence naming the person must lead them or be neutral; one that withholds them (or any stay/refusal wording anywhere with their name) fails closed.
    if (addressed.some(s => STAY.test(s) || GATES.invitation_not_offered.test(s))) continue;
    // "Tessa, I just bought you. Let's go." — the lead may be the named sentence or the one right after it, which then names nobody else present.
    const leads = (k: number) => LEAD.test(sentences[k]!) || (k + 1 < sentences.length && LEAD.test(sentences[k + 1]!) && !STAY.test(sentences[k + 1]!) && !GATES.invitation_not_offered.test(sentences[k + 1]!)
      && !people.some(o => o.id !== p.id && o.names.some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(sentences[k + 1]!))));
    if (!sentences.some((s, k) => named(s) && leads(k))) continue;
    led.push(p);
  }
  if (!led.length) return none;
  const to = world.getEntity(moved.delta.player_location!)?.display_name ?? moved.delta.player_location!;
  return {
    runtime: led.map(p => ({ kind: "move_character" as const, character_id: p.id, location_id: moved.delta.player_location! })),
    notes: [`Nicco leads ${led.map(p => p.names[0]!).join(" and ")} along with him: they leave together and arrive together in ${to}. ${led.map(p => p.names[0]!).join(" and ")} ${led.length === 1 ? "is" : "are"} NOT left behind and must appear with him at ${to}, not at the place he left.`],
    escorted: led.map(p => p.id),
  };
}
