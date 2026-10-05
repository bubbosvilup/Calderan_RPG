import type { TurnContext } from "./context-builder.js";
import { narratorIdentityGate } from "./narrator-identity.js";
import { escapeRegExp } from "./language/text.js";

/** Explicit present canonical references only; never inferred from importance or prior conversation. */
export function canonicalInteractionTargets(context: TurnContext, text: string): ReadonlySet<string> {
  const gate = narratorIdentityGate(context);
  const canonical = context.characters.filter(c => c.id !== "nicco" && gate?.identities.has(c.id));
  const foundTargets = new Set(canonical.filter(c => {
    const identity = gate!.identities.get(c.id)!;
    return [c.id, c.profile.name, ...(c.profile.aliases ?? []), identity.ref,
      // A generic human label is not a unique identity.
      ...(identity.observable_label.includes(":") ? [identity.observable_label] : [])]
      .some(n => n && new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(n)}(?![\\p{L}\\p{N}_])`, "iu").test(text));
  }).map(c => c.id));
  for (const m of text.matchAll(/\b(?:look\w* (?:at|towards?)|inspect\w*|examin\w*|approach\w*|address\w*|speak\w* to|talk\w* to)\s+(?:the |that |a )?([^*.!?\n]{1,100})/gi)) {
    const terms = (m[1]!.toLowerCase().match(/[a-z]+/g) ?? []).filter(w => !/^(?:the|a|an|man|woman|person|seller|slaver|with|in|and|his|her|to|at|of)$/.test(w));
    const found = canonical.filter(c => {
      const appearance = (gate!.identities.get(c.id)!.observable_appearance ?? "").toLowerCase();
      return terms.length > 0 && terms.every(t => new RegExp(`\\b${escapeRegExp(t)}(?:e)?\\b`).test(appearance));
    });
    if (found.length === 1) foundTargets.add(found[0]!.id);
  }
  return foundTargets;
}
