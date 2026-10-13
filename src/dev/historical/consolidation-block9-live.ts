import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProductionDeps, GameSession } from "../../app/index.js";
import type { SessionDeps } from "../../app/game-session.js";
import { SLAVE_MARKET_V1 } from "../../app/scenarios.js";
import type { CampaignCommand, CampaignSnapshot } from "../../campaign/types.js";
import { learnCanonicalName } from "../../campaign/identity-knowledge.js";
import { characterLocation } from "../../turn/movement/character-movement.js";
import { buildTurnContext } from "../../turn/context/context-builder.js";
import { movementFactScope } from "../../turn/movement/movement-scope.js";
import { createFactSource } from "../../turn/narration-facts/index.js";

/**
 * Consolidation Block 9, phase 9: BOUNDED live movement checks (evaluation only) on the production GameSession -> TurnCoordinator path.
 *  A  a purchased, persistent, UNNAMED woman (held by the player) is asked to come to Heartstone ("Lira, come ...") -> same person moves, one commit, no duplicate; then "My name is Lira." names the SAME character.
 *  B  the same woman is told to stay at the market while the player leaves -> she must not move.
 *  D  as A, but the player authors the escort ("she follows him ... into Heartstone"); then "My name is Lira." in Heartstone.
 *  C  the player, at Heartstone, "*he goes back to the slave market*" -> player_location agrees with the delivered narration.
 * One attempt per scenario, no reroll. Results are recorded, never massaged. Usage: NODE_USE_ENV_PROXY=1 OPENROUTER_API_KEY=placeholder node .build/src/dev/historical/consolidation-block9-live.js [A] [B] [C]
 */
const MARKET = "calderan_slave_market", HEARTSTONE = "heartstone_lr", WOMAN = "campaign_character_woman_one";
const PLANS = [
  { id: "A", start: MARKET, held: true, turns: ["Lira, come, let's go together to Heartstone.", "She looks at me and says quietly: \"My name is Lira.\""] },
  { id: "B", start: MARKET, held: true, turns: ["I tell the woman to stay here at the market and wait, then I go to Heartstone alone."] },
  { id: "D", start: MARKET, held: true, turns: ["*Nicco takes the woman by the wrist, and she follows him out of the market, through the West District and in through the door of Heartstone.*", "She looks up at me and says: \"My name is Lira.\""] },
  { id: "C", start: HEARTSTONE, held: false, turns: ["*he goes back to the slave market*"] },
] as const;

async function main(): Promise<void> {
  const want = process.argv.slice(2).map(s => s.toUpperCase()), plans = PLANS.filter(p => !want.length || want.includes(p.id));
  const outDir = join("artifacts", "local", "evaluations", "consolidation_block9_live"); await mkdir(outDir, { recursive: true });
  const results: unknown[] = [];
  for (const plan of plans) {
    const saveDir = await mkdtemp(join(tmpdir(), `caldrevan-block9-live-${plan.id.toLowerCase()}-`));
    const base = await createProductionDeps({ save_dir: saveDir, persistent_campaigns: true, reflection_mode: "off" });
    const { portrait_generator: _pg, item_sprite_reviewer: _sr, autosave: _as, ...rest } = base; void _pg; void _sr; void _as;
    const deps: SessionDeps = { ...rest, autosave: false };
    const campaign = SLAVE_MARKET_V1.create(deps.world, `block9_live_${plan.id.toLowerCase()}`);
    const seed: CampaignCommand[] = [{ kind: "runtime_delta", delta: { player_location: plan.start } }, ...learnCanonicalName(deps.world, campaign.exportSnapshot(), "korvin")];
    if (plan.held) seed.push({ kind: "register_character", character: { id: WOMAN, origin: { kind: "created" }, profile: { sex: "female", age: { kind: "exact", years: 24 } }, current: { current_location: MARKET, status: "active" } } } as CampaignCommand,
      { kind: "set_legal_status", character_id: WOMAN, status: "enslaved", holder_id: "nicco" } as CampaignCommand);
    campaign.apply({ expected_revision: campaign.revision, commands: seed });
    const session = GameSession.fromCampaign(deps, campaign, { opening_text: SLAVE_MARKET_V1.opening_text });
    const snap = () => campaign.exportSnapshot() as unknown as CampaignSnapshot;
    const state = () => ({ player: snap().runtime.scene.player_location, woman: plan.held ? characterLocation(snap(), deps.world, WOMAN) : null, created: snap().characters.filter(c => c.origin.kind === "created").map(c => `${c.id}:${c.profile.name ?? "(unnamed)"}`) });
    const turns: unknown[] = [{ before: state() }];
    for (const say of plan.turns) {
      const rev0 = campaign.revision, outcome = await session.submitPlayerInput(say), trace = outcome.ok ? outcome.trace : undefined;
      turns.push({ input: say, ok: outcome.ok, error: outcome.ok ? null : outcome.error, narration: outcome.ok ? outcome.narration : outcome.uncommitted_narration ?? null,
        audit: trace?.audit_issue_kinds ?? [], committed: trace?.committed_command_kinds ?? [], rejected: trace?.rejected_command_kinds ?? [], revision_delta: campaign.revision - rev0, after: state(),
        revision_issue_kinds: trace?.revision_issue_kinds ?? [],
        // The facts the DELIVERED narration yields against the post-turn state (location claims and movement facts, exactly as extracted).
        delivered_facts: outcome.ok ? createFactSource(movementFactScope(snap(), deps.world, buildTurnContext(deps.world, snap()), [plan.start, snap().runtime.scene.player_location])).of(outcome.narration).movement
          .map(f => ({ kind: f.kind, form: f.form, modality: f.modality, subject: f.subject.entity_id ?? f.subject.resolution, location: "location_id" in f ? f.location_id : undefined, ambiguity: f.ambiguity, text: f.span.text })) : [] });
      console.log(JSON.stringify({ plan: plan.id, ok: outcome.ok, after: state(), committed: trace?.committed_command_kinds ?? [] }));
      if (!outcome.ok) break;
    }
    results.push({ id: plan.id, turns });
    await session.shutdown({ discard_unsaved: true }).catch(() => undefined); await rm(saveDir, { recursive: true, force: true });
  }
  await writeFile(join(outDir, `result_${plans.map(p => p.id).join("")}.json`), JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
