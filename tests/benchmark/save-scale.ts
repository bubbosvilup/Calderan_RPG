import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadWorld } from "../../src/world/loader.js";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { buildScaleCampaign, ROADMAP_SCALE } from "../support/scale-fixture.js";

/**
 * Block B4 (P0): offline measurement of save, load and `prepare` on the roadmap-scale campaign (tests/support/scale-fixture.ts).
 * `npm run measure:save-scale` (builds first). No provider call; the saves go to a temporary directory that is removed afterwards.
 */
const ms = (t: bigint) => Number(process.hrtime.bigint() - t) / 1e6;
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
const world = await loadWorld("data");
let t = process.hrtime.bigint();
const campaign = buildScaleCampaign(world);
const buildMs = ms(t), snapshot = campaign.exportSnapshot();
const root = await mkdtemp(join(tmpdir(), "caldrevan-save-scale-"));
try {
  const repository = new FileCampaignRepository(world, join(root, "saves"));
  const saves: number[] = [];
  for (let i = 0; i < 3; i++) { t = process.hrtime.bigint(); await repository.saveCampaign(campaign, { metadata: { save_reason: "manual" } }); saves.push(ms(t)); }
  const directory = join(root, "saves", snapshot.campaign_id), file = await readFile(join(directory, "save.json"), "utf8");
  const loads: number[] = [];
  for (let i = 0; i < 3; i++) { t = process.hrtime.bigint(); await repository.loadCampaign(snapshot.campaign_id); loads.push(ms(t)); }
  const prepares: number[] = [];
  for (let i = 0; i < 5; i++) { t = process.hrtime.bigint(); campaign.prepare({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 5 } }] }); prepares.push(ms(t)); }
  const parsed = JSON.parse(file) as Record<string, unknown> & { snapshot: Record<string, unknown> };
  const top = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, bytes(v)]));
  const inner = Object.fromEntries(Object.entries(parsed.snapshot).map(([k, v]) => [k, bytes(v)]).sort((a, b) => (b[1] as number) - (a[1] as number)));
  const offers = snapshot.trade_offers ?? [];
  const byKind = (kind: string) => offers.filter(o => o.subject.kind === kind);
  const avg = (list: readonly unknown[]) => list.length ? Math.round(list.reduce<number>((s, o) => s + bytes(o), 0) / list.length) : 0;
  const store = async (name: string) => { try { return (await stat(join(directory, "optional", `${name}.json`))).size; } catch { return 0; } };
  const median = (list: number[]) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]!.toFixed(1);
  console.log(JSON.stringify({
    shape: ROADMAP_SCALE, revision: snapshot.revision,
    counts: { characters: snapshot.characters.length, facts: snapshot.facts.length, knowledge: snapshot.knowledge.length, items: snapshot.items.length, trade_offers: offers.length,
      person_offers: byKind("person").length, goods_offers: byKind("goods").length, accepted: offers.filter(o => o.status === "accepted").length, transactions: snapshot.transactions.length },
    file_bytes: Buffer.byteLength(file, "utf8"), compact_bytes: bytes(parsed), pretty_overhead_pct: +((Buffer.byteLength(file, "utf8") / bytes(parsed) - 1) * 100).toFixed(1),
    store_bytes: { learning: await store("learning"), media: await store("media") },
    per_top_level_key: top, per_snapshot_key: inner,
    average_offer_bytes: { person: avg(byKind("person")), goods: avg(byKind("goods")) },
    ms: { build_fixture: +buildMs.toFixed(0), save_median: median(saves), load_median: median(loads), prepare_median: median(prepares), saves, loads, prepares },
  }, null, 1));
} finally { await rm(root, { recursive: true, force: true }); }
