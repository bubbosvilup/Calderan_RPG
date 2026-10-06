import { economicRelevance, renderEconomicReference, type EconomicRelevance } from "../economy/economy.js";
import type { TurnContext } from "./context-builder.js";
import type { RecentExchange } from "./recent-conversation.js";

/**
 * P8 selective economic context. The SAME decision feeds the narrator prompt and the grounding audit, so a turn that received
 * anchors may state concrete Gold/Silver prices, and a non-economic turn keeps the old "no exact price" protection.
 */
export function economicTurn(input: string, context: TurnContext, recent: readonly RecentExchange[]): EconomicRelevance | null {
  const present = new Set(context.characters.map(c => c.id));
  const trade_negotiation = context.social.legal.some(l => l.status === "enslaved" && !!l.holder_id && l.holder_id !== "nicco" && present.has(l.holder_id));
  const place = context.primary.scene.player_location;
  return economicRelevance({ input, recent, location: `${place?.id ?? ""} ${place?.display_name ?? ""}`, trade_negotiation });
}
/**
 * The narrator block, or "" on a non-economic turn. Only foreground sellers get a tendency line: P6 background actors stay out of
 * it (an unaddressed seller is baseline). Seller names pass through the caller's identity mask.
 */
export function economicBlock(input: string, context: TurnContext, recent: readonly RecentExchange[], background: ReadonlySet<string> = new Set()): string {
  const relevance = economicTurn(input, context, recent);
  return relevance ? renderEconomicReference(relevance, (context.social.price_indices ?? []).filter(p => !background.has(p.character_id)).map(p => ({ name: p.name, percent: p.percent }))) : "";
}
