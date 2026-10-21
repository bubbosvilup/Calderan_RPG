import type { ActiveSessionPayload, CharacterCapabilitiesDto, CharacterCardDto, InventoryDto, InventoryItemDto, NpcEditorDto, PlayerCharacterDto, PortraitEditorDto, PortraitGalleryItemDto, TradeCardDto } from "../api/types";

/** Read-model fixtures shaped like the server's payloads (the server contract test pins the real shapes to these DTOs). */
export function makeCapabilities(overrides: Partial<CharacterCapabilitiesDto> = {}): CharacterCapabilitiesDto {
  return { tier: "world_canon", can_promote_to_npc_plus: false, promotion_unavailable_reason: null, can_edit_npc_plus: false, edit_unavailable_reason: null, ...overrides };
}

export function makeCard(overrides: Partial<CharacterCardDto> = {}): CharacterCardDto {
  return {
    ref: "c0ffee0000000000000000aa",
    name: "Korvin",
    name_known: true,
    category: "Canonical NPC",
    household: false,
    npc_plus: false,
    character_capabilities: makeCapabilities(),
    appearance_editor_eligible: false,
    appearance_editor: null,
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
    player_character: makePlayerCharacter(),
    inventory: makeInventory(),
    trade: { offer: null, notice: null, receipt: null },
    confirmations: { cards: [], recent: [] },
    provisional: { people: [] },
    ...overrides,
  };
}

export function makeItem(overrides: Partial<InventoryItemDto> = {}): InventoryItemDto {
  return {
    id: "item_a", name: "Iron dagger", description: "A plain, well-kept dagger.", category_label: "weapon",
    position: { kind: "carried" }, state_label: "Carried", equipped: false, held_for_other: false, sprite_status: "none",
    visual: { kind: "weapon", icon: { url: "/api/item-glyph/weapon" }, detail: { url: "/api/item-glyph/weapon" } },
    ...overrides,
  };
}

export function makeInventory(overrides: Partial<InventoryDto> = {}): InventoryDto {
  const items = overrides.items ?? [
    makeItem(),
    makeItem({ id: "item_b", name: "Traveller's cloak", description: "Wool, patched at the hem.", category_label: "armor", position: { kind: "equipped", slot: "chest", mode: "worn" }, state_label: "Equipped · chest · worn", equipped: true,
      visual: { kind: "armor", icon: { url: "/api/item-glyph/armor" }, detail: { url: "/api/item-glyph/armor" } } }),
    makeItem({ id: "item_c", name: "Sealed letter", description: null, category_label: "document", held_for_other: true, visual: { kind: "document", icon: { url: "/api/item-glyph/document" }, detail: { url: "/api/item-glyph/document" } } }),
  ];
  const equipped = items.filter(i => i.equipped);
  return {
    gold: 500,
    counts: { total: items.length, carried: items.length - equipped.length, equipped: equipped.length },
    items,
    equipment: { slots: [{ id: "head", label: "Head", item_ids: [], conflict: false }, { id: "chest", label: "Chest", item_ids: equipped.map(i => i.id), conflict: false }], unclassified_equipped: [], full_body_url: null, silhouette_url: "/api/item-glyph/silhouette" },
    ...overrides,
  };
}

export function makeGalleryItem(overrides: Partial<PortraitGalleryItemDto> = {}): PortraitGalleryItemDto {
  return {
    token: "g1", url: "/api/portrait/asset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1", is_avatar: false, is_full_body: false, stale: false, generated_at: "2026-10-14T10:00:00.000Z", model_label: "Test model",
    reference_used: false, kind: "avatar", pose_label: "Neutral", can_be_avatar: true, can_be_full_body: false, ...overrides,
  };
}

export function makePortrait(overrides: Partial<PortraitEditorDto> = {}): PortraitEditorDto {
  return {
    avatar: null, full_body: null, gallery: [], gallery_limit: 64, batch_size: 3, can_generate_batch: true, generation_blocked: null,
    poses: { avatar: [{ id: "neutral", label: "Neutral" }, { id: "smile", label: "Slight smile" }], fullbody: [{ id: "standing", label: "Standing" }] },
    ...overrides,
  };
}

export function makePlayerCharacter(overrides: Partial<PlayerCharacterDto> = {}, portrait: PortraitEditorDto = makePortrait()): PlayerCharacterDto {
  return {
    name: "Nicco", role_label: "Player Character", narrator_summary: "A young man with dark hair.",
    identity: [{ key: "sex", label: "Sex", value: "male" }, { key: "species", label: "Species", value: null }, { key: "apparent_age", label: "Apparent age", value: null }],
    visual: {
      ref: "a1b2c3d4e5f6a1b2c3d4e5f6", avatar_url: portrait.avatar?.url ?? null, full_body_url: portrait.full_body?.url ?? null,
      editor: {
        fields: [
          { key: "height_cm", label: "Height", group: "body", kind: "number", unit: "cm", override: "178" },
          { key: "build", label: "Build", group: "body", kind: "text", override: null },
          { key: "hair_color", label: "Hair color", group: "hair", kind: "text", override: "black" },
          { key: "scars", label: "Scars", group: "face", kind: "lines", override: null },
          { key: "description", label: "Description", group: "description", kind: "text", override: null },
        ],
        portrait,
      },
    },
    ...overrides,
  };
}

/** An editable NPC+ card: the engine's capability flag, its appearance editor and its portrait state, exactly as the read model carries them. */
export function makeNpcPlus(overrides: Partial<CharacterCardDto> = {}, portrait: PortraitEditorDto = makePortrait(), editor: Partial<NpcEditorDto> = {}): CharacterCardDto {
  return makeCard({
    ref: "feed00000000000000000bb", name: "Maren", category: "Household · NPC+", household: true, npc_plus: true, role: "Healer", relationship: "Trusted", presence: "present", known_location: "Slave market",
    character_capabilities: makeCapabilities({ tier: "npc_plus", can_edit_npc_plus: true }),
    appearance_editor_eligible: true,
    appearance_editor: {
      identity: [{ label: "Species", value: "human" }, { label: "Sex", value: "female" }],
      fields: [
        { key: "height_cm", label: "Height", group: "body", kind: "number", unit: "cm", override: "165", inherited: null },
        { key: "hair_color", label: "Hair color", group: "hair", kind: "text", override: null, inherited: null },
        { key: "scars", label: "Scars", group: "face", kind: "lines", override: null, inherited: null },
        { key: "description", label: "Description", group: "description", kind: "text", override: null, inherited: "A slim woman with ash-grey hair." },
      ],
      portrait,
      ...editor,
    },
    ...overrides,
  });
}
