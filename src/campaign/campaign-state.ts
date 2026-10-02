import type { WorldStore } from "../world/world-store.js";
import { RuntimeState } from "../world/runtime-state.js";
import { prepareRuntimeDelta, type RuntimeDomainSnapshot } from "../world/runtime-domain.js";
import type { SceneState, PlayerMana } from "../types/scene.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { CampaignSnapshot } from "./types.js";
import { CampaignIdentityResolver } from "./identity.js";
import { fail, parseCampaignProposal, validateId } from "./validation.js";
import { prepareCharacterCommand } from "./characters.js";
import { prepareItemCommand } from "./items.js";
import { prepareSocialCommand } from "./social.js";
import { prepareAgendaCommand } from "./agenda.js";
import { prepareLegalCommand } from "./legal.js";
import { compareIds } from "../world/provenance.js";
import { validateCampaignSnapshot } from "./snapshot-validation.js";
import { preparePremiumCommand, syncPremiumCharacters } from "./premium-characters.js";
const RESTORE = Symbol("validated campaign restore");

export interface PreparedCampaignChange {
  readonly expected_revision: number;
  readonly next_revision: number;
  readonly changed: boolean;
  readonly snapshot: DeepReadonly<CampaignSnapshot>;
}
/** Compare data independently of object property insertion order. Never called on raw input. */
function stableData(value: unknown): string {
  return JSON.stringify(value, (_key, child: unknown) => child && typeof child === "object" && !Array.isArray(child)
    ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => compareIds(a, b))) : child);
}
function orderDomains(draft: CampaignSnapshot): void {
  for (const records of [draft.characters, draft.items, draft.households, draft.facts, draft.goals, draft.scheduled_events, draft.transactions]) records.sort((a, b) => compareIds(a.id, b.id));
  draft.funds.sort((a, b) => compareIds(a.character_id, b.character_id));
  draft.legal_statuses.sort((a, b) => compareIds(a.character_id, b.character_id));
  draft.premium_characters.sort((a, b) => compareIds(a.character_id, b.character_id));
  draft.premium_reflections.sort((a, b) => compareIds(a.character_id, b.character_id));
  draft.knowledge.sort((a, b) => compareIds(a.character_id, b.character_id) || compareIds(a.fact_id, b.fact_id));
  draft.relationships.sort((a, b) => compareIds(a.from_character_id, b.from_character_id) || compareIds(a.to_character_id, b.to_character_id));
  draft.runtime.npc_locations.sort((a, b) => compareIds(a.character_id, b.character_id));
  for (const h of draft.households) h.members.sort((a, b) => compareIds(a.character_id, b.character_id));
  for (const c of draft.characters) c.current.empty_slots?.sort();
  for (const e of draft.scheduled_events) e.participants?.sort();
}
/** Pure domain preparation over an engine-owned snapshot, not a restore/deserialization API. */
export function prepareCampaignChange(base: DeepReadonly<CampaignSnapshot>, world: WorldStore, input: unknown): PreparedCampaignChange {
  if (base.dataset_id !== world.datasetId || base.schema_version !== 3) fail("dataset_id", "snapshot/canon mismatch");
  const proposal = parseCampaignProposal(input);
  if (proposal.expected_revision !== base.revision) fail("expected_revision", "stale campaign proposal");
  const draft = structuredClone(base) as CampaignSnapshot;
  const context = { draft, refs: new CampaignIdentityResolver(world, draft) };
  for (const command of proposal.commands) {
    if (command.kind === "runtime_delta") draft.runtime = structuredClone(prepareRuntimeDelta(draft.runtime, command.delta, world, base.revision).snapshot) as RuntimeDomainSnapshot;
    else if (!prepareCharacterCommand(context, command) && !prepareItemCommand(context, command) && !prepareSocialCommand(context, command) && !prepareAgendaCommand(context, command) && !prepareLegalCommand(context, command) && !preparePremiumCommand(context, command)) fail("command", "unsupported command");
  }
  // NPC+ Pass 1: premium state follows membership changes made by this proposal, atomically, in the same revision.
  syncPremiumCharacters(draft, base);
  orderDomains(draft);
  const comparison = structuredClone(base) as CampaignSnapshot;
  orderDomains(comparison);
  const changed = stableData(draft) !== stableData(comparison);
  if (changed && !Number.isSafeInteger(base.revision + 1)) fail("revision", "revision overflow");
  draft.revision = base.revision + (changed ? 1 : 0);
  return Object.freeze({ expected_revision: base.revision, next_revision: draft.revision, changed, snapshot: changed ? validateCampaignSnapshot(draft, world) : base });
}

/** One in-memory authority. No domain mutators, disk I/O, history replay or external callbacks. */
export class CampaignState {
  readonly #world: WorldStore;
  #snapshot: DeepReadonly<CampaignSnapshot>;
  readonly #prepared = new WeakMap<object, { base: DeepReadonly<CampaignSnapshot>; next: DeepReadonly<CampaignSnapshot> }>();
  /** Trusted engine initialization, following the existing RuntimeState startup contract. */
  constructor(world: WorldStore, campaignId: string, initialScene: SceneState, initialMana?: PlayerMana);
  constructor(world: WorldStore, token: typeof RESTORE, snapshot: DeepReadonly<CampaignSnapshot>);
  constructor(world: WorldStore, campaignId: string | typeof RESTORE, initialScene: SceneState | DeepReadonly<CampaignSnapshot>, initialMana?: PlayerMana) {
    this.#world = world;
    if (campaignId === RESTORE) { this.#snapshot = initialScene as DeepReadonly<CampaignSnapshot>; return; }
    validateId(campaignId, "campaign_id");
    const { revision, ...runtime } = new RuntimeState(world, initialScene as SceneState, initialMana).exportSnapshot();
    this.#snapshot = validateCampaignSnapshot({ schema_version: 3 as const, campaign_id: campaignId, dataset_id: world.datasetId, revision,
      runtime: structuredClone(runtime), characters: [], items: [], households: [], facts: [], knowledge: [], relationships: [], goals: [], scheduled_events: [], funds: [], legal_statuses: [], transactions: [], premium_characters: [], premium_reflections: [] }, world);
  }
  /** Unknown-input boundary. Assigns validated current state directly, with fresh receipt ownership. */
  static restore(world: WorldStore, snapshot: unknown): CampaignState {
    return new CampaignState(world, RESTORE, validateCampaignSnapshot(snapshot, world));
  }
  get revision(): number { return this.#snapshot.revision; }
  exportSnapshot(): DeepReadonly<CampaignSnapshot> { return this.#snapshot; }
  prepare(input: unknown): PreparedCampaignChange {
    const prepared = prepareCampaignChange(this.#snapshot, this.#world, input);
    this.#prepared.set(prepared, { base: this.#snapshot, next: prepared.snapshot }); return prepared;
  }
  commit(prepared: unknown): Readonly<{ revision: number; changed: boolean }> {
    if (!prepared || typeof prepared !== "object") fail("commit", "unknown preparation receipt");
    const entry = this.#prepared.get(prepared);
    if (!entry) fail("commit", "foreign, forged or consumed preparation receipt");
    if (entry.base !== this.#snapshot) fail("commit", "stale preparation receipt");
    const changed = entry.next !== entry.base;
    this.#prepared.delete(prepared);
    this.#snapshot = entry.next;
    return Object.freeze({ revision: this.revision, changed });
  }
  apply(input: unknown): Readonly<{ revision: number; changed: boolean }> { return this.commit(this.prepare(input)); }
}
