/**
 * Client DTOs: the wire shapes of the play server's HTTP API, as the React client reads them. Declared HERE rather than imported from the
 * server's read-model modules, for two reasons:
 *   1. the server modules import Node and engine code that must never enter the browser program;
 *   2. each DTO lists only the fields the client is allowed to use. Masking happens server-side; a field that is not declared here
 *      (location ids, item ids, editor prompts, ...) is not rendered, even when the payload happens to carry it.
 *
 * This file is pure types with no imports, so the server test suite can type-check that every server read model is still assignable
 * to these DTOs (tests/ui/react-client-contract.test.ts): a server-side rename fails `npm test`, not a browser session.
 */

/** Server session status. Anything other than "idle" means actions wait. */
export type SessionStatus = "idle" | "running_turn" | "compacting_context" | "closed";

/** A comparison-only narration by another model (the narrator-alternatives developer aid). It never changes the story. */
export interface NarratorAlternativeDto { readonly model: string; readonly label: string; readonly text: string }
export interface AlternateModelDto { readonly id: string; readonly label: string }

export interface TranscriptMessage {
  readonly role: "player" | "narrator" | "system";
  readonly text: string;
  /** Stable, increasing position of the message (the render key). */
  readonly seq?: number;
  /** Narrator messages of a turn this server captured for comparison. The id is only sent back to ask for an alternative. */
  readonly comparison_id?: string;
  readonly comparison_available?: boolean;
  readonly alternatives?: readonly NarratorAlternativeDto[];
}

export interface SceneSummaryDto {
  readonly location: string;
  readonly time_of_day: string;
  readonly date_text: string;
}

/** Engine-derived tier and capabilities. The client renders controls from these flags and never re-derives eligibility. */
export interface CharacterCapabilitiesDto {
  readonly tier: "world_canon" | "campaign_npc" | "npc_plus" | "player";
  readonly can_promote_to_npc_plus: boolean;
  readonly promotion_unavailable_reason: string | null;
  /** The engine lets the player edit this character's appearance and portraits (an active NPC+). The client never derives it from tier or household. */
  readonly can_edit_npc_plus: boolean;
  /** Why an NPC+ cannot be edited right now (inactive, dead); null when editable or when the tier never has editing. */
  readonly edit_unavailable_reason: string | null;
}

/** An NPC+ editor field: the SAVED value plus the text that applies without one (reference only, never presented as saved). */
export interface NpcAppearanceFieldDto extends AppearanceFieldDto { readonly inherited: string | null }
/**
 * The NPC+ appearance and portrait editor, present on a card only when the engine says the character is editable. The server's image prompt
 * previews are deliberately not declared: the client neither renders nor sends prompts.
 */
export interface NpcEditorDto {
  readonly identity: readonly { readonly label: string; readonly value: string }[];
  readonly fields: readonly NpcAppearanceFieldDto[];
  readonly portrait: PortraitEditorDto;
}

/** The player-safe character card: names arrive already masked by the server's knowledge-aware projection. */
export interface CharacterCardDto {
  /** Opaque handle (hash); used as a React key and as the only identifier sent back. Never displayed. */
  readonly ref: string;
  readonly name: string;
  readonly name_known: boolean;
  readonly category: string;
  readonly household: boolean;
  readonly npc_plus: boolean;
  readonly character_capabilities: CharacterCapabilitiesDto;
  /** Whether the engine exposes an appearance editor for this character; `appearance_editor` is non-null exactly then. */
  readonly appearance_editor_eligible: boolean;
  readonly appearance_editor: NpcEditorDto | null;
  readonly avatar_url: string | null;
  readonly presence: "present" | "away";
  readonly role: string;
  readonly relationship: string;
  readonly state: string;
  readonly where: string;
  readonly known_location: string | null;
  readonly appearance: string;
  readonly affiliations: readonly string[];
  readonly public_summary: string | null;
  readonly story_facts: readonly { readonly text: string; readonly status: string }[];
  readonly history: readonly { readonly text: string; readonly source: string }[];
  readonly observations: readonly string[];
  readonly knowledge_boundary: string;
}

export interface ParticipantDto {
  /** "player" for the player's own entry, else the card's opaque ref. */
  readonly ref: string;
  readonly name: string;
  readonly name_known?: boolean;
  readonly category: string;
  readonly household: boolean;
  readonly npc_plus: boolean;
  /** null for the player's own entry (the player is not opened as a character card here). */
  readonly card: CharacterCardDto | null;
}

export interface PlayViewDto {
  readonly participants: readonly ParticipantDto[];
  readonly household: readonly { readonly members: readonly CharacterCardDto[] }[];
  readonly household_title: string;
  /** null = money is not tracked (not zero). */
  readonly gold: number | null;
}

/** Appearance editor field (a stored campaign value or none). Keys are the engine's closed set; the client renders whatever the server lists. */
export interface AppearanceFieldDto {
  readonly key: string;
  readonly label: string;
  readonly group: "body" | "hair" | "face" | "description";
  /** `number`: a whole number (unit shown); `lines`: one item per line; `text`: one line. */
  readonly kind: "number" | "text" | "lines";
  readonly unit?: "cm" | "kg";
  /** The SAVED value ("" lines joined by newline), or null when nothing is saved. */
  readonly override: string | null;
}

/** One Gallery image. `token` is the only handle sent back (never a path, version id or asset token); `url` is a same-origin display route. */
export interface PortraitGalleryItemDto {
  readonly token: string;
  readonly url: string;
  readonly is_avatar: boolean;
  readonly is_full_body: boolean;
  readonly stale: boolean;
  readonly generated_at: string;
  readonly model_label: string;
  readonly reference_used: boolean;
  /** `legacy` = generated before kinds existed: viewable, keeps any role it holds, cannot receive a new one. */
  readonly kind: "avatar" | "fullbody" | "legacy";
  readonly pose_label: string | null;
  /** Whether the engine lets this image take the role now (kind rule); a role it already holds shows through is_avatar / is_full_body. */
  readonly can_be_avatar: boolean;
  readonly can_be_full_body: boolean;
}
export type PortraitKindDto = "avatar" | "fullbody";
export interface PortraitRoleDto { readonly url: string; readonly stale: boolean }
export interface PortraitEditorDto {
  readonly avatar: PortraitRoleDto | null;
  readonly full_body: PortraitRoleDto | null;
  readonly gallery: readonly PortraitGalleryItemDto[];
  readonly gallery_limit: number;
  readonly batch_size: number;
  /** False when fewer than `batch_size` slots remain or generation is blocked. */
  readonly can_generate_batch: boolean;
  /** Why generation is unavailable for this character, else null. */
  readonly generation_blocked: string | null;
  /** The curated pose choices per kind: ids are what the client sends back. */
  readonly poses: Readonly<Record<PortraitKindDto, readonly { readonly id: string; readonly label: string }[]>>;
}

/** The player's visual state: the shared portrait pipeline in player mode. `ref` is the opaque handle the portrait routes accept. */
export interface PlayerVisualDto {
  readonly ref: string;
  readonly avatar_url: string | null;
  readonly full_body_url: string | null;
  readonly editor: {
    readonly fields: readonly AppearanceFieldDto[];
    /** What the narrator sees of the player (prompts and previews are not declared here and are never rendered). */
    readonly portrait: PortraitEditorDto;
  };
}

export interface PlayerCharacterDto {
  readonly name: string;
  readonly role_label: string;
  readonly narrator_summary: string;
  /** Identity lines the player may edit (sex, species, apparent age); `value` is the saved text or null. */
  readonly identity: readonly { readonly key: string; readonly label: string; readonly value: string | null }[];
  readonly visual: PlayerVisualDto | null;
}

/** An inventory item as the Inventory read model describes it. `id` is a React key only: it is never displayed or sent. */
export interface InventoryItemDto {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly category_label: string;
  readonly position: { readonly kind: string; readonly slot?: string; readonly mode?: string };
  /** The server's wording of the item's state ("Carried", "Equipped · weapon · held"). */
  readonly state_label: string;
  readonly equipped: boolean;
  /** Nicco carries it but it belongs to someone else (the owner is never named). */
  readonly held_for_other: boolean;
  readonly sprite_status: "none" | "pending" | "failed" | "ready";
  readonly visual: { readonly kind: string; readonly icon: { readonly url: string }; readonly detail: { readonly url: string } };
}
export interface EquipmentSlotDto { readonly id: string; readonly label: string; readonly item_ids: readonly string[]; readonly conflict: boolean }
export interface InventoryDto {
  /** Authoritative current funds, or null when no purse is tracked. */
  readonly gold: number | null;
  readonly counts: { readonly total: number; readonly carried: number; readonly equipped: number };
  readonly items: readonly InventoryItemDto[];
  readonly equipment: { readonly slots: readonly EquipmentSlotDto[]; readonly unclassified_equipped: readonly string[]; readonly full_body_url: string | null; readonly silhouette_url: string };
}

export interface TradeCardDto {
  /** Opaque offer token. */
  readonly ref: string;
  readonly direction: "buy" | "sell";
  readonly kind: "goods" | "person";
  readonly counterparty: string;
  readonly price_gold: number;
  readonly lines: readonly string[];
  /** BUY only: a hint that tracked gold covers the price; the engine decides at acceptance. */
  readonly affordable: boolean | null;
  readonly gold: number | null;
  readonly summary: string;
}
export interface TradeNoticeDto { readonly ref: string; readonly status: "withdrawn" | "invalidated"; readonly text: string }
export interface TradeReceiptDto { readonly ref: string; readonly direction: "buy" | "sell"; readonly kind: "goods" | "person"; readonly gold: number; readonly summary: string }
export interface TradeViewDto { readonly offer: TradeCardDto | null; readonly notice: TradeNoticeDto | null; readonly receipt: TradeReceiptDto | null }

export interface ConfirmationCardDto {
  readonly ref: string;
  readonly title: string;
  readonly body: string;
  readonly confirm_label: string;
  readonly cancel_label: string;
}
export interface ConfirmationNoticeDto { readonly ref: string; readonly status: "confirmed" | "cancelled" | "invalidated"; readonly subject_label: string; readonly text: string }
export interface ConfirmationViewDto { readonly cards: readonly ConfirmationCardDto[]; readonly recent: readonly ConfirmationNoticeDto[] }

export interface ProvisionalPersonDto { readonly token: string; readonly label: string; readonly held: boolean; readonly keepable: boolean; readonly reason?: string }
export interface ProvisionalPeopleDto { readonly people: readonly ProvisionalPersonDto[] }

export interface SaveStateDto {
  readonly state: "saved" | "unsaved";
  readonly saving?: boolean;
  readonly error?: string;
  readonly autosave?: "off" | "on" | "stopped";
  readonly size_warning?: true;
}
export interface CampaignInfoDto { readonly id: string; readonly display_name: string; readonly save: SaveStateDto }

/** `GET /api/session` in host mode with no open campaign (the start screen). */
export interface NoCampaignPayload {
  readonly campaign: null;
  readonly messages: readonly TranscriptMessage[];
  readonly status: SessionStatus;
  readonly configured: boolean;
}

/** `GET /api/session` with a live session. `campaign` is absent in the disposable playtest mode. */
export interface ActiveSessionPayload {
  readonly campaign?: CampaignInfoDto;
  readonly messages: readonly TranscriptMessage[];
  readonly status: SessionStatus;
  /** false = the narrator provider has no key; turns will fail with a configuration error. */
  readonly configured: boolean;
  readonly revision: number;
  readonly scene: SceneSummaryDto;
  readonly play: PlayViewDto;
  readonly player_character: PlayerCharacterDto | null;
  readonly inventory: InventoryDto;
  readonly trade: TradeViewDto;
  readonly confirmations: ConfirmationViewDto;
  readonly provisional: ProvisionalPeopleDto;
  /** Models offered for narrator comparison (present when the server captures comparisons). */
  readonly alternate_models?: readonly AlternateModelDto[];
}

export type SessionPayload = NoCampaignPayload | ActiveSessionPayload;

/** The player-safe application error the server attaches to a refused operation. `message` is already player-safe. */
export interface AppErrorDto {
  readonly code: string;
  readonly provider_code?: string;
  readonly message: string;
  readonly retryable?: boolean;
  readonly turn_state_changed?: boolean;
}

export interface CampaignListEntryDto {
  readonly campaign_id: string;
  readonly display_name: string;
  /** "valid", "unsupported_version", or an unreadable state; only "valid" loads the current slot. */
  readonly status: string;
  readonly saved_at?: string;
  readonly location_name?: string;
  readonly world_minute?: number;
  readonly household_members?: number;
  readonly previous_valid: boolean;
  readonly backups: readonly string[];
  readonly locked: boolean;
}
export interface ScenarioDto { readonly id: string; readonly label: string; readonly description: string }
export interface CampaignListDto { readonly campaigns: readonly CampaignListEntryDto[]; readonly scenarios: readonly ScenarioDto[]; readonly active_campaign_id: string | null }

export interface SaveStatusDto { readonly campaign: { readonly id: string; readonly save: SaveStateDto } | null }

/** One optional service's runtime health (`GET /api/optional-services`): diagnostics only, never campaign state. */
export interface OptionalServiceDto {
  readonly service: "reflection" | "mannerism_learning" | "portrait_generation" | "item_sprite_generation" | "sprite_qa" | "semantic_retrieval";
  readonly enabled: boolean;
  readonly running: number;
  readonly last_success_at?: string;
  readonly last_error?: { readonly at: string; readonly code: string };
}
export interface OptionalServicesDto { readonly services: readonly OptionalServiceDto[] }

/** NDJSON progress phases of a running turn (status words only; never narrator prose). */
export type TurnPhase = "thinking" | "narrating" | "resolving";
