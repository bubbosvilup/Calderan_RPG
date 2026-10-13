import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorld } from "../../src/world/loader.js";
import type { WorldStore } from "../../src/world/world-store.js";
import { mannerismFixture } from "../../src/dev/d10-mannerism-corpus.js";
import { turnFixture } from "../../src/dev/turn-fixture.js";
import { createOpeningCampaign } from "../../src/campaign/opening-state.js";
import type { CampaignState } from "../../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../../src/campaign/types.js";
import { learnCanonicalName } from "../../src/campaign/identity-knowledge.js";
import { GameSession, type SessionDeps } from "../../src/app/game-session.js";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { TurnCoordinator } from "../../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../../src/retrieval/hybrid-search.js";
import type { NarratorProvider } from "../../src/llm/narrator-provider.js";
import { characterLocation } from "../../src/turn/movement/character-movement.js";
import { metadata } from "../turn-fixtures.js";

/**
 * Modern regression benchmark harness. Every scenario builds its OWN rig: a real GameSession over a real TurnCoordinator and a real file repository in a
 * private temp directory, with the Narrator and the Controller replaced by per-turn fixtures. No state is shared between rigs.
 */
export type WorldKind = "fixture" | "market" | "mannerism";
export const MARKET = "calderan_slave_market";
let realWorld: Promise<WorldStore> | undefined;
const loadReal = () => (realWorld ??= loadWorld("data"));
let serial = 0;

export interface Rig {
  readonly kind: WorldKind; readonly world: WorldStore; readonly campaign: CampaignState; readonly session: GameSession; readonly coordinator: TurnCoordinator;
  readonly dir: string; readonly deps: SessionDeps;
  say(player: string, narration: string, controller?: readonly CampaignCommand[], options?: TurnOptions): Promise<{ ok: boolean; error?: string }>;
  /** Provider calls made so far (the benchmark never reaches a network provider: these are the scripted fixtures). */
  calls(): { narrator: number; controller: number };
  /** The last submitted turn: the narration the player was shown and the audit issue kinds raised for the draft. */
  readonly last: { narration: string; audit: readonly string[] };
  /** Saves, then replaces the session with a fresh one loaded from disk (everything not persisted is gone, like a real restart). */
  reload(): Promise<void>;
  release(): Promise<void>;
}
export interface TurnOptions { readonly turn_key?: string; readonly expected_revision?: number; /** Verbatim quotes the Controller cites as evidence for its proposals. */ readonly evidence?: readonly string[] }
export interface RigSpec { readonly world: WorldKind; readonly commands?: readonly CampaignCommand[]; readonly gold?: number }

export async function makeRig(spec: RigSpec, id: string): Promise<Rig> {
  let world: WorldStore, campaign: CampaignState;
  if (spec.world === "fixture") ({ world, campaign } = turnFixture());
  else if (spec.world === "mannerism") ({ world, campaign } = mannerismFixture());
  else {
    world = await loadReal(); campaign = createOpeningCampaign(world, `bench_${id.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${++serial}`);
    campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, { kind: "runtime_delta", delta: { time_advance_minutes: 600 } },
      ...learnCanonicalName(world, campaign.exportSnapshot(), "korvin")] });
  }
  if (spec.commands?.length) campaign.apply({ expected_revision: campaign.revision, commands: [...spec.commands] });
  const dir = await mkdtemp(join(tmpdir(), "caldrevan-bench-")), files = new FileCampaignRepository(world, dir);
  // A reloaded session does not expose its campaign: the wrapper remembers the campaign object the repository handed to it.
  let lastLoaded: CampaignState | undefined;
  const repository = new Proxy(files, { get(target, prop) {
    if (prop === "loadCampaign") return async (...args: Parameters<FileCampaignRepository["loadCampaign"]>) => { const loaded = await target.loadCampaign(...args); lastLoaded = loaded.campaign; return loaded; };
    const value = Reflect.get(target, prop, target); return typeof value === "function" ? value.bind(target) : value; } });
  let narration = "", proposals: readonly CampaignCommand[] = [], evidence: readonly string[] = [];
  const count = { narrator: 0, controller: 0 }, last = { narration: "", audit: [] as readonly string[] };
  const narrator: NarratorProvider = { async generate() { throw new Error("unused"); }, async *stream() { count.narrator++; yield { type: "text_delta", text: narration }; yield { type: "completed", result: { text: narration, ...metadata } }; } };
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, narrator, { async propose() { count.controller++; return { commands: [...proposals], ...(evidence.length ? { evidence: [...evidence] } : {}), ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const deps: SessionDeps = { world, repository, createCoordinator: () => coordinator };
  let session = GameSession.fromCampaign(deps, campaign);
  if (spec.gold !== undefined) campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "set_funds", character_id: "nicco", gold: spec.gold }] });
  const rig: Rig = { kind: spec.world, world, coordinator, dir, deps,
    get campaign() { return campaign; }, get session() { return session; },
    calls: () => ({ ...count }), last,
    async say(player, text, controller = [], options = {}) { narration = text; proposals = controller; evidence = options.evidence ?? []; const { evidence: _evidence, ...submit } = options; const r = await session.submitPlayerInput(player, submit); last.narration = r.ok ? r.narration : ""; last.audit = r.ok ? r.trace?.audit_issue_kinds ?? [] : []; return r.ok ? { ok: true } : { ok: false, error: JSON.stringify((r as { error?: unknown }).error) }; },
    async reload() {
      const saved = await session.save(); if (!saved.ok) throw new Error(`save failed: ${JSON.stringify(saved)}`);
      const loaded = await GameSession.loadCampaign(deps, campaign.exportSnapshot().campaign_id); if (!loaded.ok) throw new Error(`load failed: ${JSON.stringify(loaded)}`);
      await session.shutdown({ discard_unsaved: true }).catch(() => undefined); session = loaded.session; campaign = lastLoaded!;
    },
    async release() { await session.shutdown({ discard_unsaved: true }).catch(() => undefined); await rm(dir, { recursive: true, force: true }); } };
  return rig;
}
export const whereIs = (rig: Rig, id: string) => id === "nicco" ? rig.campaign.exportSnapshot().runtime.scene.player_location : characterLocation(rig.campaign.exportSnapshot(), rig.world, id);
