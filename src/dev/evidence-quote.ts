import type { CampaignCommand } from "../campaign/types.js";
import { quotedSpans } from "../turn/language/text.js";
/** Phase 1N shadow experiment: deterministic verification of controller-provided evidence quotes (never used for production commits). */
export const HEDGE = /\b(?:not|never|no|maybe|perhaps|might|could|would|if|unless|almost|imagin\w*|consider\w*|pretend\w*|refus\w*|declin\w*|reject\w*|back)\b|n't\b|\?/i;
export type QuotePolicy = "strict" | "quoted_tell";
/**
 * Deterministic quote checks. A verified quote is necessary, never sufficient.
 * strict: never accept evidence inside dialogue quotes. quoted_tell: additionally allow Nicco's own quoted statement of the
 * exact /tell fact when an attribution to Nicco/he with a speech verb sits next to the quotation.
 */
export function verifyQuote(narration: string, quote: string, command: CampaignCommand, statement: string | undefined, policy: QuotePolicy): string | null {
  const q = quote.trim();
  if (q.length < 8 || q.length > 200) return "quote_length";
  const at = narration.indexOf(q);
  if (at < 0) return "quote_not_verbatim";
  if (HEDGE.test(q)) return "quote_hedged_or_negated";
  const inside = quotedSpans(narration).find(([s, e]) => at >= s && at + q.length <= e) ?? quotedSpans(narration).find(([s, e]) => at < e && at + q.length > s);
  if (inside) {
    if (policy === "strict" || command.kind !== "set_knowledge" || !statement) return "quote_inside_dialogue";
    const span = narration.slice(inside[0], inside[1]);
    const around = narration.slice(Math.max(0, inside[0] - 40), inside[0]) + " " + narration.slice(inside[1], inside[1] + 40);
    const attributed = /\b(?:Nicco|he)\b[^"“]{0,25}\b(?:says|said|tells|told|states|stated)\b|\b(?:says|said|tells|told)\b[^"“]{0,15}\b(?:Nicco|he)\b/.test(around);
    const content = statement.toLowerCase().replace(/[.!]$/, "").replace(/^the /, "");
    if (!attributed || !span.toLowerCase().includes(content)) return "quote_inside_dialogue";
  }
  return null;
}

