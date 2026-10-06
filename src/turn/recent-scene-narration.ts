import { rpgNarration } from "./rpg-dialogue.js";
import type { RecentExchange } from "./recent-conversation.js";

export const RECENT_SCENE_NARRATION_TURNS = 2;
export const RECENT_SCENE_NARRATION_CHARACTERS = 2_000;
export const RECENT_SCENE_NARRATION_RULE = "Immediate continuity only. CURRENT STRUCTURED STATE overrides recent scene narration on conflict; do not resurrect actors, items, conditions or positions contradicted by committed state.";

/** Derived prompt text, never state. A location boundary (including unknown metadata) ends the current visit. */
export function recentSceneNarration(entries: readonly RecentExchange[], location: string | undefined, mask: (text: string) => string = text => text): string {
  if (!location) return "";
  const finalized = entries.filter(e => e.status === "finalized"), selected: string[] = [];
  let remaining = RECENT_SCENE_NARRATION_CHARACTERS;
  for (let i = finalized.length - 1, turns = 0; i >= 0 && turns < RECENT_SCENE_NARRATION_TURNS; i--, turns++) {
    const entry = finalized[i]!;
    if (entry.location_id !== location) break;
    // Prefer newest complete spans. Never cut an asterisk pair or infer a semantic fact.
    const spans = rpgNarration(entry.narration);
    for (let j = spans.length - 1; j >= 0; j--) {
      const span = mask(spans[j]!);
      const cost = span.length + (selected.length ? 1 : 0);
      if (cost > remaining) continue;
      selected.push(span); remaining -= cost;
    }
  }
  return selected.reverse().join("\n");
}
