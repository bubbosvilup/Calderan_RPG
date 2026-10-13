import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TestContext } from "node:test";
import { mannerismFixture } from "../../src/dev/support/d10-mannerism-corpus.js";
import type { CampaignState } from "../../src/campaign/campaign-state.js";
import type { CampaignCommand, CharacterPortraitVersion, ReflectionNote } from "../../src/campaign/types.js";
import { corePartition } from "../../src/campaign/optional-state.js";
import { canonicalJson } from "../../src/persistence/optional-store.js";

export const NOW = "2026-10-12T10:00:00.000Z";
export const HASH = "a".repeat(64);
export const run = (campaign: CampaignState, ...commands: CampaignCommand[]) => campaign.apply({ expected_revision: campaign.revision, commands });
export async function tempRoot(t: TestContext, prefix = "caldrevan-block7-"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix)); t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}
export const portraitVersion = (n: number, kind: "avatar" | "fullbody" = "avatar"): CharacterPortraitVersion => ({ version_id: `portrait_v${n}`, prompt_version: "portrait-prompt-v2-anime", prompt_fingerprint: "0123456789abcdef",
  model: "image-model", created_at: NOW, media_type: "image/png", asset_file: `portrait_v${n}.png`, kind, seed: n, cost_usd: 0.01 * n });
export const reflectionNote = (revision: number, n = 1): ReflectionNote => ({ id: `r${revision}_stance_${n}`, kind: "stance", label: `stance_${n}`, text: "Maren holds a steady, watchful regard for Nicco.",
  evidence_refs: ["npcmem:maren:history:r3.0"], confidence: "medium", created_revision: revision, updated_revision: revision });

export type Part = "reflection" | "mannerism" | "sprites" | "portraits";
/**
 * A campaign with every optional domain populated (deterministic, no providers): a reflection note, mannerism learning (journal + candidate evidence), three item
 * sprites (pending / ready / failed) and a three-version portrait gallery with a selected avatar. `parts` limits which domains are filled.
 */
export function populated(parts: readonly Part[] = ["reflection", "mannerism", "sprites", "portraits"]) {
  const f = mannerismFixture();
  if (parts.includes("sprites")) {
    const make = (name: string): CampaignCommand => ({ kind: "create_item", name, description: `A ${name}.`, visual_description: `A small ${name} with simple plain lines and no decoration at all.`, category: "valuable", owner_id: "maren", position: { kind: "carried", character_id: "maren" } });
    run(f.campaign, make("brass lamp"), make("wooden comb"), make("clay cup"));
    const ids = f.campaign.exportSnapshot().items.filter(i => i.id.startsWith("campaign_item_0")).map(i => i.id);
    run(f.campaign, ...ids.map(item_id => ({ kind: "set_item_sprite" as const, item_id, sprite: { status: "pending" as const } })));
    const visual = (id: string) => f.campaign.exportSnapshot().items.find(i => i.id === id)!.visual_description!;
    run(f.campaign, { kind: "set_item_sprite", item_id: ids[0]!, sprite: { status: "ready", asset_ref: "portrait_item_lamp.png", generated_from_visual_description: visual(ids[0]!) } },
      { kind: "set_item_sprite", item_id: ids[1]!, sprite: { status: "failed", error_code: "provider_failed" } });
  }
  if (parts.includes("portraits")) run(f.campaign, { kind: "record_portrait_batch", character_id: "nicco", versions: [portraitVersion(1), portraitVersion(2), portraitVersion(3, "fullbody")], avatar_version_id: "portrait_v1" });
  if (parts.includes("reflection")) {
    const rev = f.campaign.revision;
    run(f.campaign, { kind: "record_reflection", character_id: "maren", reflected_revision: rev, notes: [reflectionNote(rev)] });
  }
  if (parts.includes("mannerism")) {
    f.campaign.maintainMannerisms({ kind: "finalized", expected_revision: f.campaign.revision, source: { turn_id: "t1", narration_hash: HASH, narration_length: 400, character_ids: ["maren"], available_items: [] } });
    f.campaign.maintainMannerisms({ kind: "observations", expected_revision: f.campaign.revision, through_sequence: 1, observations: [{ character_id: "maren", sequence: 1, action: "lips_press", trigger: "while_waiting",
      span_start: 0, span_end: 20, equivalent_owned_ids: [] }] });
  }
  return f;
}
/** The authoritative partition of a campaign as a stable string: equality of this string is "identical authoritative state". */
export const coreOf = (campaign: CampaignState) => canonicalJson(corePartition(campaign.exportSnapshot()));

import { dirname, join as joinPath } from "node:path";
import { nodeSaveFileSystem, type SaveFileSystem } from "../../src/persistence/filesystem.js";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { toLegacyFile } from "./raw-save.js";

export type FsOp = "writeNew" | "rename" | "syncDirectory";
export type Where = "store" | "snapshot";
/** A filesystem that fails the n-th call of `op` aimed at the side stores (directory `optional/`) or at the snapshot side (the campaign directory and its backups). */
export function faultFs(op: FsOp, where: Where, nth = 1, log: string[] = []): SaveFileSystem {
  let count = 0;
  const side = (path: string): Where => { const dir = op === "syncDirectory" ? path : dirname(path); return /[\\/]optional$/.test(dir) ? "store" : "snapshot"; };
  const guard = <A extends unknown[]>(name: FsOp, fn: (...args: A) => Promise<void>, pathOf: (...args: A) => string) => async (...args: A) => {
    const target = pathOf(...args);
    if (name === op && side(target) === where && ++count === nth) { log.push(`${name}:${where}:${count}`); throw Object.assign(new Error("injected crash"), { code: "EIO" }); }
    await fn(...args);
  };
  return { ...nodeSaveFileSystem,
    writeNew: guard("writeNew", (p: string, t: string) => nodeSaveFileSystem.writeNew(p, t), p => p),
    // A rename is attributed to the side of its DESTINATION.
    rename: guard("rename", (from: string, to: string) => nodeSaveFileSystem.rename(from, to), (_from, to) => to),
    syncDirectory: guard("syncDirectory", (p: string) => nodeSaveFileSystem.syncDirectory(p), p => p) };
}
/** Saves `campaign` with a current repository, then rewrites the files into the exact pre-block-7 shape (schema 7, inline optional state, no `optional/`). */
export async function legacyCampaign(t: TestContext, f: { world: import("../../src/world/world-store.js").WorldStore; campaign: CampaignState }) {
  const root = await tempRoot(t), repository = new FileCampaignRepository(f.world, root, { now: () => NOW }), id = f.campaign.exportSnapshot().campaign_id;
  await repository.saveCampaign(f.campaign);
  const path = joinPath(root, id, "save.json"); await toLegacyFile(path, f.world);
  return { root, id, path, repository, dir: joinPath(root, id) };
}
