/**
 * NPC+ Pass 10 — offline prompt variants for the invitation turn (evaluation tooling only; never imported by production code).
 * Each variant is a pure string transform of the narrator's user message and differs from `production` by exactly one factor.
 * `pass9_note` restores the Pass 9 invited-NPC+ note; `away_labels` (hypothetical, NOT in production) rewrites the "away" labels of the
 * invited person to their real pre-turn location; `invited_first` (hypothetical) puts the invited note before the conservative stay note.
 */
export type VariantId = "production" | "pass9_note" | "away_labels" | "invited_first";
const PASS9_NOTE = (from: string, to: string, who: string) => `Nicco leaves ${from} for ${to}. ${who} was invited to come along and decides freely whether to follow him: do not assume either choice. If someone follows, narrate that completed choice explicitly; if someone stays, narrate that instead. Do not have Nicco bring or carry anyone.`;
export interface VariantContext { readonly from: string; readonly to: string; readonly who: string }
export function applyVariant(id: VariantId, prompt: string, c: VariantContext): string {
  const lines = prompt.split("\n"), noteIndex = lines.findIndex(l => l.startsWith(`Nicco leaves ${c.from} for ${c.to}. ${c.who} `));
  if (id === "production") return prompt;
  if (id === "pass9_note") return noteIndex < 0 ? prompt : lines.map((l, i) => i === noteIndex ? PASS9_NOTE(c.from, c.to, c.who) : l).join("\n");
  if (id === "away_labels") return prompt.replace(`${c.who} (away)`, `${c.who} (in ${c.from})`).replace(new RegExp(`(${c.who}: [^\\n]*?); away;`), `$1; in ${c.from};`);
  const stay = lines.findIndex(l => l.startsWith(`Nicco leaves ${c.from}. `));
  if (stay < 0 || noteIndex < 0 || stay > noteIndex) return prompt;
  const rest = lines.filter((_, i) => i !== stay && i !== noteIndex);
  rest.splice(stay, 0, lines[noteIndex]!, lines[stay]!);
  return rest.join("\n");
}
