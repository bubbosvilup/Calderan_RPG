import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GameSession } from "../../app/index.js";
import { SLAVE_MARKET_V1 } from "../../app/scenarios.js";
import type { CampaignSnapshot } from "../../campaign/types.js";
import { liveSessionDeps, recordOpenRouterWire, submitWithTransientRetry, usageTotals } from "./support.js";

/**
 * Consolidation Block 12 (Keep track, KPG-1): BOUNDED live checks (evaluation only) on the production GameSession -> TurnCoordinator path.
 *  LIVE A  Maren-like stranger: the Narrator introduces an apple seller, the player asks her name; the player then presses Keep track on her
 *          -> the SAME provisional person becomes ONE persistent character (name kept), she is in the persistent people list, a later turn adds nobody.
 *  LIVE B  unnamed stranger: the player addresses a porter and presses Keep track BEFORE any name; then asks his name
 *          -> one persistent unnamed person; a later self-introduction names that SAME id in place.
 * One attempt per scenario, no reroll (a single retry only for a provider transient that changed no state). The model's wording decides whether the
 * intended shape was reached; the committed state decides PASS / FAIL. Keep track itself makes no provider call.
 * Usage: NODE_USE_ENV_PROXY=1 OPENROUTER_API_KEY=placeholder node .build/src/dev/live/keep-track-live.js [A] [B]
 */
const wire = recordOpenRouterWire();

type Id = "A" | "B";
type Step = { readonly say: string } | { readonly keep: "named" | "single" };
interface Plan { readonly id: Id; readonly purpose: string; readonly steps: readonly Step[] }
const PLANS: readonly Plan[] = [
  { id: "A", purpose: "Maren-like stranger: named provisional, then Keep track", steps: [
    { say: "I walk over to a young woman selling apples from a basket near the edge of the square." },
    { say: "I ask the apple seller what her name is." },
    { keep: "named" },
    { say: "I buy nothing yet, but I tell her I will come back tomorrow and ask how long she has sold apples here." }] },
  { id: "B", purpose: "unnamed stranger: Keep track before any name, then the name binds in place", steps: [
    { say: "I stop a porter hauling crates past the pens and ask him where the water trough is." },
    { keep: "single" },
    { say: "I thank the porter and ask him what his name is." }] },
];

async function main(): Promise<void> {
  const want = process.argv.slice(2).map(s => s.toUpperCase()), plans = PLANS.filter(p => !want.length || want.includes(p.id));
  const outDir = join("artifacts", "local", "evaluations", "keep_track_live"); await mkdir(outDir, { recursive: true });
  const results: Record<string, unknown>[] = []; let tokens = 0, cost = 0;
  for (const plan of plans) {
    const saveDir = await mkdtemp(join(tmpdir(), `caldrevan-keep-track-live-${plan.id.toLowerCase()}-`));
    const deps = await liveSessionDeps(saveDir);
    const campaign = SLAVE_MARKET_V1.create(deps.world, `keep_track_live_${plan.id.toLowerCase()}`);
    let session = GameSession.fromCampaign(deps, campaign, { opening_text: SLAVE_MARKET_V1.opening_text });
    const snap = () => session.getPlayUiView() && (live.campaign.exportSnapshot() as unknown as CampaignSnapshot);
    const live = { campaign };
    const created = () => snap().characters.filter(c => c.origin.kind === "created").map(c => ({ id: c.id, name: c.profile.name ?? null, trigger: c.origin_snapshot?.trigger ?? null, ref: c.origin_snapshot?.ephemeral_ref ?? null, location: c.current.current_location ?? null }));
    const wire0 = wire.length, start = { revision: campaign.revision }, log: Record<string, unknown>[] = [];
    let failed: string | undefined, reached = true, keptId: string | undefined, keptName: string | null = null;
    const problems: string[] = [];
    for (const [index, step] of plan.steps.entries()) {
      if ("keep" in step) {
        const people = session.getProvisionalPeopleView().people;
        const named = people.filter(p => p.keepable && /^[A-Z][a-z]+$/.test(p.label));
        const choice = step.keep === "named" ? (named.length === 1 ? named[0] : undefined) : (people.length === 1 && people[0]!.keepable ? people[0] : undefined);
        log.push({ step: index + 1, keep: step.keep, offered: people.map(p => ({ label: p.label, keepable: p.keepable, held: p.held })), chosen: choice?.label ?? null });
        console.log(JSON.stringify({ plan: plan.id, step: index + 1, offered: people.map(p => p.label), chosen: choice?.label ?? null }));
        if (!choice) { reached = false; break; }
        const before = campaign.revision, calls = wire.length;
        const out = session.keepTrack({ token: choice.token, expected_revision: session.getView().session.revision });
        const again = session.keepTrack({ token: choice.token, expected_revision: before });
        const kept = created();
        log.push({ step: index + 1, keep_outcome: out.ok ? { ok: true, changed: out.changed } : { ok: false, reason: out.reason }, replay: again.ok ? { already: again.already ?? false } : { reason: again.reason }, revision_delta: campaign.revision - before, provider_calls: wire.length - calls, created: kept });
        if (!out.ok || !out.changed) problems.push(`Keep track refused: ${JSON.stringify(out.ok ? out : out.reason)}`);
        if (!again.ok || !again.already) problems.push("the replay was not `already`");
        if (campaign.revision !== before + 1) problems.push(`revision moved by ${campaign.revision - before}`);
        if (wire.length !== calls) problems.push("Keep track made a provider call");
        if (kept.length !== 1) problems.push(`expected one persistent character, got ${JSON.stringify(kept)}`);
        keptId = kept[0]?.id; keptName = kept[0]?.name ?? null;
        if (step.keep === "named" && keptName !== choice.label) problems.push(`name not kept: ${keptName} vs ${choice.label}`);
        if (step.keep === "single" && keptName !== null && keptName !== choice.label.replace(/ \(\d+\)$/, "")) problems.push(`unexpected name ${keptName}`);
        if (!session.getPlayUiView().participants.some(p => p.card && (keptName ? p.name === keptName : true) && p.ref !== "player")) problems.push("not in the persistent people list");
        if (session.getProvisionalPeopleView().people.some(p => p.token === choice.token)) problems.push("still listed as provisional");
        continue;
      }
      const { outcome, attempts } = await submitWithTransientRetry(session, step.say);
      const trace = outcome.ok ? outcome.trace : undefined, { tokens: tk, cost_usd: cs } = usageTotals(trace?.usage);
      tokens += tk; cost += cs;
      const narration = outcome.ok ? outcome.narration : outcome.uncommitted_narration ?? null;
      log.push({ step: index + 1, input: step.say, ok: outcome.ok, attempts, error: outcome.ok ? null : outcome.error, narration, audit: trace?.audit_issue_kinds ?? [], committed: trace?.committed_command_kinds ?? [],
        provisional: session.getProvisionalPeopleView().people.map(p => p.label), created: created(), tokens: tk, cost_usd: cs });
      console.log(JSON.stringify({ plan: plan.id, step: index + 1, ok: outcome.ok, provisional: session.getProvisionalPeopleView().people.map(p => p.label), created: created().map(c => c.name ?? "(unnamed)") }));
      if (!outcome.ok) { failed = `step ${index + 1} failed: ${JSON.stringify(outcome.error)}`; break; }
    }
    if (reached && !failed && keptId) {
      const after = created();
      if (after.length !== 1 || after[0]!.id !== keptId) problems.push(`after the later turn: ${JSON.stringify(after)}`);
      if (plan.id === "B" && after[0]?.name) log.push({ late_name: after[0].name, same_id: after[0].id === keptId });
      // Save and reload: the kept person survives as the same id.
      const saved = await session.save(); if (!saved.ok) problems.push(`save failed: ${JSON.stringify(saved)}`);
      const loaded = await GameSession.loadCampaign(deps, campaign.exportSnapshot().campaign_id);
      if (!loaded.ok) problems.push(`load failed: ${JSON.stringify(loaded)}`);
      else {
        const ids = loaded.session.getPlayUiView().participants.filter(p => p.card).map(p => p.name);
        log.push({ reload_participants: ids });
        if (keptName && !ids.includes(keptName)) problems.push("the kept person is missing after reload");
        await loaded.session.shutdown({ discard_unsaved: true }).catch(() => undefined);
      }
      if ((snap().premium_characters ?? []).length) problems.push("an NPC+ appeared");
      if (snap().households.some(h => h.members.some(m => m.character_id === keptId))) problems.push("a household membership appeared");
      if (snap().legal_statuses.some(l => l.character_id === keptId)) problems.push("a legal status appeared");
    }
    const verdict = failed ? "ERROR" : !reached ? "NOT REACHED" : problems.length ? "FAIL" : "PASS";
    results.push({ id: plan.id, purpose: plan.purpose, verdict, problems, created: created(), revision_delta: campaign.revision - start.revision, wire_calls: wire.length - wire0, steps: log });
    console.log(JSON.stringify({ plan: plan.id, verdict, problems }));
    await session.shutdown({ discard_unsaved: true }).catch(() => undefined); await rm(saveDir, { recursive: true, force: true });
    session = undefined as unknown as GameSession;
  }
  const out = { generated_at: new Date().toISOString(), wire_total: wire.length, wire_by_model: Object.fromEntries([...new Set(wire.map(w => String(w.model)))].map(m => [m, wire.filter(w => String(w.model) === m).length])),
    tokens, cost_usd: Number(cost.toFixed(5)), results };
  await writeFile(join(outDir, `result_${plans.map(p => p.id).join("")}.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ wire_total: wire.length, tokens, cost_usd: out.cost_usd, verdicts: results.map(r => `${String(r.id)}:${String(r.verdict)}`) }, null, 1));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
