import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProductionDeps, GameSession } from "../app/index.js";
import type { SessionDeps } from "../app/game-session.js";
import { SLAVE_MARKET_V1 } from "../app/scenarios.js";
import type { CampaignCommand, CampaignSnapshot, TradeOfferRecord } from "../campaign/types.js";
import { learnCanonicalName } from "../campaign/identity-knowledge.js";
import { buildTurnContext } from "../turn/context/context-builder.js";
import { establishNames } from "../turn/name-establishment.js";
import { dialogueUnits, presentPeople } from "../turn/narration-facts/index.js";
import type { RecentExchange } from "../turn/recent-conversation.js";

/**
 * Consolidation Block 11 (identity / speaker / recipient facts): BOUNDED live checks (evaluation only) on the production GameSession -> TurnCoordinator path.
 *  LIVE A  KPG-2 real shape: Korvin shows one woman, the player asks the price      -> the person card appears at the seller's price, no seller_authority_unestablished, nothing paid.
 *  LIVE B  a provisional stranger answers "My name is Maren."                        -> no CampaignCharacter, ONE provisional Maren, no NPC+.
 *  LIVE C  a purchased (seeded: unnamed, held by Nicco) woman says "My name is Lira." -> the SAME character id is named Lira; nobody else is created.
 *  LIVE D  ambiguous speaker: the player asks Korvin and Mistress Elara together      -> a price line the facts leave ambiguous makes no offer (NOT REACHED when the model attributes clearly).
 * One attempt per scenario, no reroll (a single retry only for a provider transient that changed no state). The model's wording decides whether the
 * intended shape was reached; the committed state decides PASS / FAIL.
 * Usage: NODE_USE_ENV_PROXY=1 OPENROUTER_API_KEY=placeholder node .build/src/dev/consolidation-block11-live.js [A] [B] [C] [D]
 */
interface Wire { readonly n: number; readonly model: unknown; status?: number }
const wire: Wire[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  if (!url.includes("openrouter.ai") || typeof init?.body !== "string") return realFetch(input, init);
  const entry: Wire = { n: wire.length + 1, model: (JSON.parse(init.body) as { model?: unknown }).model }; wire.push(entry);
  const response = await realFetch(input, init); entry.status = response.status; return response;
}) as typeof fetch;

const TRANSIENT = new Set(["network_error", "timeout", "rate_limited", "provider_unavailable"]);
const MARKET = "calderan_slave_market", LIRA = "campaign_character_live_lira";
type Id = "A" | "B" | "C" | "D";
interface Plan { readonly id: Id; readonly purpose: string; readonly knows_korvin: boolean; readonly seed?: readonly CampaignCommand[]; readonly turns: readonly string[] }
const PLANS: readonly Plan[] = [
  { id: "A", purpose: "KPG-2 real shape: seller beat + plain price line", knows_korvin: true, turns: [
    "goes to Korvin, among the private licensed sellers",
    "I tell Korvin I want to see exactly one woman from his stock, only one, and ask his price. Korvin looks over one woman in the pens and says plainly: \"This one is 100 gold.\""] },
  { id: "B", purpose: "provisional stranger: \"My name is Maren.\"", knows_korvin: false, turns: [
    "I walk over to a young woman selling apples from a basket near the edge of the square.",
    "I ask the apple seller what her name is. She answers: \"My name is Maren.\""] },
  { id: "C", purpose: "purchased person (seeded): \"My name is Lira.\"", knows_korvin: true, seed: [
    { kind: "register_character", character: { id: LIRA, origin: { kind: "created" }, profile: { sex: "female", age: { kind: "exact", years: 23 } }, current: { current_location: MARKET, status: "active" } } },
    { kind: "set_legal_status", character_id: LIRA, status: "enslaved", holder_id: "nicco" }], turns: [
    "I turn to the woman I just bought from Korvin, who waits beside me, and crouch in front of her.",
    "I ask her what her name is. She answers: \"My name is Lira.\""] },
  { id: "D", purpose: "ambiguous speaker: two sellers asked together", knows_korvin: true, turns: [
    "goes to Korvin, among the private licensed sellers",
    "I ask Korvin and the elegant platinum-haired woman with the fan, both at once, what a strong female worker costs. They glance at each other before one of them answers with a price."] },
];
const PRICE = /\b(?:\d{2,4}|hundred|fifty|ninety|eighty|seventy|sixty|forty|thirty|twenty)\b[^.!?]{0,20}\b(?:gold|for her|crowns?)\b|\b(?:hundred|\d{2,4}) gold\b/i;

async function main(): Promise<void> {
  const want = process.argv.slice(2).map(s => s.toUpperCase()), plans = PLANS.filter(p => !want.length || want.includes(p.id));
  const outDir = join("artifacts", "local", "evaluations", "consolidation_block11_live"); await mkdir(outDir, { recursive: true });
  const results: Record<string, unknown>[] = []; let tokens = 0, cost = 0;
  for (const plan of plans) {
    const saveDir = await mkdtemp(join(tmpdir(), `caldrevan-block11-live-${plan.id.toLowerCase()}-`));
    const base = await createProductionDeps({ save_dir: saveDir, persistent_campaigns: true, reflection_mode: "off" });
    const { portrait_generator: _pg, item_sprite_reviewer: _sr, autosave: _as, ...rest } = base; void _pg; void _sr; void _as;
    const deps: SessionDeps = { ...rest, autosave: false };
    const campaign = SLAVE_MARKET_V1.create(deps.world, `block11_live_${plan.id.toLowerCase()}`);
    if (plan.knows_korvin) campaign.apply({ expected_revision: campaign.revision, commands: learnCanonicalName(deps.world, campaign.exportSnapshot(), "korvin") });
    if (plan.seed) campaign.apply({ expected_revision: campaign.revision, commands: [...plan.seed] });
    const session = GameSession.fromCampaign(deps, campaign, { opening_text: SLAVE_MARKET_V1.opening_text });
    const snap = () => campaign.exportSnapshot() as unknown as CampaignSnapshot;
    const offers = () => (snap().trade_offers ?? []) as unknown as readonly TradeOfferRecord[];
    const gold = () => snap().funds.find(f => f.character_id === "nicco")!.gold;
    const created = () => snap().characters.filter(c => c.origin.kind === "created").map(c => ({ id: c.id, name: c.profile.name ?? null }));
    const wire0 = wire.length, start = { revision: campaign.revision, characters: snap().characters.length }, turns: Record<string, unknown>[] = [], recent: RecentExchange[] = [];
    let failed: string | undefined;
    for (const [index, say] of plan.turns.entries()) {
      let outcome, attempts = 0;
      for (;;) {
        attempts++; outcome = await session.submitPlayerInput(say);
        if (outcome.ok || attempts >= 2) break;
        if (!(TRANSIENT.has(outcome.error.provider_code ?? "") && !outcome.error.turn_state_changed)) break;
      }
      const trace = outcome.ok ? outcome.trace : undefined, usage = JSON.stringify(trace?.usage ?? {}); let tk = 0, cs = 0;
      for (const m of usage.matchAll(/"total_tokens":(\d+)/g)) tk += Number(m[1]); for (const m of usage.matchAll(/"cost(?:_usd)?":([\d.]+)/g)) cs += Number(m[1]);
      tokens += tk; cost += cs;
      const narration = outcome.ok ? outcome.narration : outcome.uncommitted_narration ?? null;
      if (outcome.ok && narration) recent.push({ player: say, narration, status: "finalized", location_id: snap().runtime.scene.player_location });
      // How the shared dialogue facts read the delivered text (evaluation evidence only).
      const context = buildTurnContext(deps.world, campaign.exportSnapshot());
      const spoken = narration ? dialogueUnits(narration, 0, presentPeople(context), [], { rpg: true }).filter(u => u.quoted).map(u => ({ text: u.text.slice(0, 160), speaker: u.speaker ?? null, method: u.attribution?.method ?? null, ambiguity: u.attribution?.ambiguity ?? null, candidates: u.attribution?.candidates ?? [], price: PRICE.test(u.text) })) : [];
      const card = session.getTradeView().offer;
      turns.push({ turn: index + 1, input: say, ok: outcome.ok, attempts, error: outcome.ok ? null : outcome.error, narration, spoken,
        audit: trace?.audit_issue_kinds ?? [], committed: trace?.committed_command_kinds ?? [], rejected: trace?.rejected_command_kinds ?? [], person_transactions: trace?.person_transactions ?? [], revision_issues: trace?.revision_issue_kinds ?? [],
        card: card ? { kind: card.kind, price_gold: card.price_gold } : null, offers: offers().map(o => ({ status: o.status, price_gold: o.price_gold, subject: o.subject.kind })),
        gold: gold(), created: created(), tokens: tk, cost_usd: cs });
      console.log(JSON.stringify({ plan: plan.id, turn: index + 1, ok: outcome.ok, card: card?.price_gold ?? null, spoken: spoken.map(s => `${s.speaker ?? "?"}/${s.method ?? s.ambiguity}`) }));
      if (!outcome.ok) { failed = `turn ${index + 1} failed: ${JSON.stringify(outcome.error)}`; break; }
    }
    const reading = establishNames(recent, buildTurnContext(deps.world, campaign.exportSnapshot()), deps.world, campaign.exportSnapshot(), [], campaign.revision);
    const provisional = reading.provisional.map(p => ({ ref: p.ref, name: p.name ?? null }));
    const last = turns.at(-1) as { spoken: { price: boolean; speaker: string | null; method: string | null; ambiguity: string | null }[]; rejected: string[]; narration: string | null } | undefined;
    const problems: string[] = []; let reached = true;
    const nothingPaid = gold() === 500 && snap().transactions.length === 0;
    switch (plan.id) {
      case "A": {
        const priceLine = last?.spoken.find(s => s.price);
        reached = !!priceLine;
        const active = offers().filter(o => o.status === "active");
        if (reached) {
          if (active.length !== 1 || active[0]!.subject.kind !== "person") problems.push(`expected one active person offer, got ${JSON.stringify(offers())}`);
          if (!session.getTradeView().offer) problems.push("no Actual Offer card");
          if (JSON.stringify(last).includes("seller_authority_unestablished")) problems.push("seller_authority_unestablished was raised");
          if (!nothingPaid || created().length) problems.push("payment or materialization before Accept");
        }
        break;
      }
      case "B": {
        reached = !!last?.narration && /\bMaren\b/.test(last.narration);
        if (reached) {
          if (created().length) problems.push(`a CampaignCharacter was created: ${JSON.stringify(created())}`);
          if (provisional.filter(p => p.name === "Maren").length !== 1) problems.push(`provisional Maren count ${provisional.filter(p => p.name === "Maren").length}: ${JSON.stringify(provisional)}`);
          if ((snap().premium_characters ?? []).length) problems.push("an NPC+ appeared");
        }
        break;
      }
      case "C": {
        reached = !!last?.narration && /\bLira\b/.test(last.narration);
        const lira = snap().characters.find(c => c.id === LIRA);
        if (reached) {
          if (lira?.profile.name !== "Lira") problems.push(`the seeded character is named ${lira?.profile.name ?? "(none)"}`);
          if (snap().characters.length !== start.characters) problems.push(`characters ${start.characters} -> ${snap().characters.length}`);
          if (provisional.some(p => p.name === "Lira")) problems.push("a provisional Lira twin exists");
        }
        break;
      }
      case "D": {
        const ambiguous = last?.spoken.filter(s => s.price && !s.speaker && s.ambiguity === "ambiguous") ?? [];
        reached = ambiguous.length > 0 && !(last?.spoken.some(s => s.price && s.speaker));
        if (reached && offers().some(o => o.status === "active")) problems.push(`an ambiguous price line made an offer: ${JSON.stringify(offers())}`);
        if (!nothingPaid) problems.push("payment happened");
        break;
      }
    }
    const verdict = failed ? "ERROR" : !reached ? "NOT REACHED" : problems.length ? "FAIL" : "PASS";
    results.push({ id: plan.id, purpose: plan.purpose, verdict, problems, provisional, created: created(), revision_delta: campaign.revision - start.revision, wire_calls: wire.length - wire0, turns });
    console.log(JSON.stringify({ plan: plan.id, verdict, problems }));
    await session.shutdown({ discard_unsaved: true }).catch(() => undefined); await rm(saveDir, { recursive: true, force: true });
  }
  const out = { generated_at: new Date().toISOString(), wire_total: wire.length, wire_by_model: Object.fromEntries([...new Set(wire.map(w => String(w.model)))].map(m => [m, wire.filter(w => String(w.model) === m).length])),
    tokens, cost_usd: Number(cost.toFixed(5)), results };
  await writeFile(join(outDir, `result_${plans.map(p => p.id).join("")}.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ wire_total: wire.length, tokens, cost_usd: out.cost_usd, verdicts: results.map(r => `${String(r.id)}:${String(r.verdict)}`) }, null, 1));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
