import type { CampaignSnapshot, TransferDocumentation } from "../../campaign/types.js";
import type { PendingProposal } from "../pending-proposals.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { TurnContext } from "../context-builder.js";
import { exactNamePattern } from "../language/text.js";

/**
 * Household Pass 1: deterministic resolution of the player-authored act of freeing a person (manumission).
 *
 * Purchases are NOT resolved here any more. Actual Offer V1: a person sale is an explicit trade offer (turn/commerce/person-offers.ts reads the
 * seller's stated price from delivered narration; the player accepts it in the interface). Neither the player's prose ("deal", "*pays*")
 * nor this module settles a purchase.
 *
 * Manumission: an unhedged, explicitly legal act of freeing a present person Nicco legally holds. Unchaining is not manumission.
 * AUTH-1 (block 5A): recognition only PROPOSES the act. The words never commit a legal-status change; the player confirms in the interface.
 */
export interface ManumissionResolution {
  /** AUTH-1 (block 5A): the player's words PROPOSE freeing a held person; nothing here is a command. Only the interface can confirm it. */
  readonly proposals: readonly PendingProposal[];
  readonly notes: readonly string[];
  readonly diagnostics: readonly { readonly kind: "manumission"; readonly status: "proposed" | "blocked" | "ambiguous" | "no_offer"; readonly detail: Readonly<Record<string, unknown>> }[];
}
const FREE = /\b(?:i (?:hereby )?(?:free|manumit) you|you(?:'re| are) (?:now )?a free (?:woman|man|person)|you(?:'re| are) no longer (?:a |my )?(?:slave|property)|grants? (?:her|him|them|you|[A-Z][a-z]+) (?:her|his|their|your) freedom|manumi\w+|you(?:'re| are) (?:now )?free(?! to\b)(?!\s+(?:from|of) (?:the |those |these )?(?:chains?|cage|shackles?|irons?)))\b/i;
function sentences(text: string): string[] { return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean); }

export function resolveManumission(input: string, context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>, baseRevision: number): ManumissionResolution {
  const proposals: PendingProposal[] = [], notes: string[] = [], diagnostics: ManumissionResolution["diagnostics"][number][] = [];
  const present = new Set(context.characters.map(c => c.id));
  const name = (id: string) => id === "nicco" ? "Nicco" : context.characters.find(c => c.id === id)?.profile.name ?? id;
  const legal = (id: string) => snapshot.legal_statuses.find(l => l.character_id === id);
  const named = (text: string, id: string) => { const n = name(id); return exactNamePattern([n, ...n.split(/\s+/).filter(t => t.length > 2)], "i").test(text); };
  const pick = (ids: readonly string[]) => { const byName = ids.filter(id => named(input, id)); return byName.length === 1 ? byName[0] : byName.length === 0 && ids.length === 1 ? ids[0] : undefined; };
  const clauses = sentences(input.replace(/\*/g, " . "));
  const freeing = clauses.find(c => FREE.test(c) && !/\b(?:if|maybe|perhaps|would|could|might|not yet|someday|one day|when)\b|\?/i.test(c));
  if (freeing) {
    const held = [...present].filter(id => { const l = legal(id); return l?.status === "enslaved" && l.holder_id === "nicco"; });
    const subject = pick(held);
    if (!held.length) { /* nobody Nicco legally holds is present */ }
    else if (!subject) { diagnostics.push({ kind: "manumission", status: "ambiguous", detail: { held, freeing } }); notes.push(`It is unclear whom Nicco means to free (${held.map(name).join(", ")}): no legal status changes this turn.`); }
    else {
      const papers: TransferDocumentation = /\b(?:papers?|writ|document|signed|sealed)\b/i.test(input) ? "documented" : "unestablished";
      proposals.push({ kind: "manumission", subject_id: subject, actor_id: "nicco", payload: { holder_id: "nicco", documentation: papers === "documented" ? "documented" : "unestablished" } });
      diagnostics.push({ kind: "manumission", status: "proposed", detail: { subject, freeing, papers } });
    }
  }
  return { proposals, notes, diagnostics };
}
