import type { ActiveSessionPayload, CharacterCardDto, TradeCardDto } from "../api/types";

/** Read-model fixtures shaped like the server's payloads (the server contract test pins the real shapes to these DTOs). */
export function makeCard(overrides: Partial<CharacterCardDto> = {}): CharacterCardDto {
  return {
    ref: "c0ffee0000000000000000aa",
    name: "Korvin",
    name_known: true,
    category: "Canonical NPC",
    household: false,
    npc_plus: false,
    character_capabilities: { tier: "world_canon", can_promote_to_npc_plus: false, promotion_unavailable_reason: null },
    avatar_url: null,
    presence: "present",
    role: "Slave trader",
    relationship: "Not recorded",
    state: "Not recorded",
    where: "Here",
    known_location: "Slave market",
    appearance: "A broad man in a stained leather apron.",
    affiliations: [],
    public_summary: null,
    story_facts: [],
    history: [],
    observations: [],
    knowledge_boundary: "Only what Nicco knows.",
    ...overrides,
  };
}

export function makeOffer(overrides: Partial<TradeCardDto> = {}): TradeCardDto {
  return { ref: "0ffe70000000000000000001", direction: "buy", kind: "goods", counterparty: "Korvin", price_gold: 15, lines: ["Halberd"], affordable: true, gold: 500, summary: "Buy Halberd for 15 gold", ...overrides };
}

export function makeSession(overrides: Partial<ActiveSessionPayload> = {}): ActiveSessionPayload {
  const korvin = makeCard();
  return {
    campaign: { id: "campaign_test", display_name: "Test campaign", save: { state: "saved", saving: false, autosave: "on" } },
    messages: [{ role: "narrator", text: "The market is loud. *Korvin waves you over.*", seq: 0 }],
    status: "idle",
    configured: true,
    revision: 7,
    scene: { location: "Slave market", time_of_day: "Late morning", date_text: "Year 1191, Vesp Alpha 1, Stonewake" },
    play: {
      participants: [
        { ref: "player", name: "Nicco", category: "You", household: false, npc_plus: false, card: null },
        { ref: korvin.ref, name: korvin.name, name_known: true, category: korvin.category, household: false, npc_plus: false, card: korvin },
      ],
      household: [{ members: [] }],
      household_title: "Household",
      gold: 500,
    },
    player_character: { name: "Nicco", role_label: "Player Character", narrator_summary: "A young man.", visual: { avatar_url: null } },
    trade: { offer: null, notice: null, receipt: null },
    confirmations: { cards: [], recent: [] },
    provisional: { people: [] },
    ...overrides,
  };
}
