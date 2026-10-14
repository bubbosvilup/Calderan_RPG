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

export interface TranscriptMessage {
  readonly role: "player" | "narrator" | "system";
  readonly text: string;
  /** Stable, increasing position of the message (the render key). */
  readonly seq?: number;
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

export interface PlayerCharacterDto {
  readonly name: string;
  readonly role_label: string;
  readonly narrator_summary: string;
  readonly visual: { readonly avatar_url: string | null } | null;
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
  readonly trade: TradeViewDto;
  readonly confirmations: ConfirmationViewDto;
  readonly provisional: ProvisionalPeopleDto;
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

/** NDJSON progress phases of a running turn (status words only; never narrator prose). */
export type TurnPhase = "thinking" | "narrating" | "resolving";
