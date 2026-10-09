import { SpriteQualityError, validateSpriteQuality, type SpriteQualityReviewer } from "../llm/sprite-quality.js";
import { randomBytes, randomInt } from "node:crypto";
import type { CampaignState } from "../campaign/campaign-state.js";
import type { CampaignCommand, CampaignItem } from "../campaign/types.js";
import { ITEM_SPRITE_NEGATIVE_PROMPT, itemSpritePrompt, itemSpriteRetryPrompt } from "../campaign/item-sprite-prompt.js";
import { ImageGenerationError, validateImageBytes, type PortraitImageGenerator } from "../llm/image-generator.js";
import { extensionFor, type PortraitAssetStore } from "./portrait-store.js";
import { RAENA_IMAGE_STACK } from "./image-stack.js";

export interface ItemSpriteJobDeps {
  readonly generator?: PortraitImageGenerator | undefined;
  readonly reviewer?: SpriteQualityReviewer | undefined;
  readonly store?: PortraitAssetStore | undefined;
  /** Metadata commits are synchronous and allowed only between gameplay turns. */
  readonly can_commit?: () => boolean;
  readonly changed?: () => void;
  readonly trigger?: string | undefined;
  /** Lazy legacy enrichment, explicitly requested only; no bulk backfill or extra creation LLM call. */
  readonly enrich?: (item: Readonly<CampaignItem>) => Promise<string>;
}
/** Session-local queue sharing the production image/provider/storage seams. No gameplay await and no automatic provider retries. */
export class ItemSpriteJobs {
  readonly #queued = new Set<string>();
  readonly #running = new Map<string, Promise<void>>();
  readonly #completed: { id: string; commands: CampaignCommand[] }[] = [];
  constructor(readonly campaign: CampaignState, readonly deps: ItemSpriteJobDeps) {}
  get busy(): boolean { return !!(this.#queued.size || this.#running.size || this.#completed.length); }
  request(itemId: string): boolean {
    const item = this.campaign.exportSnapshot().items.find(i => i.id === itemId);
    if (!item || item.sprite?.status === "ready" || item.sprite?.status === "pending" || this.#queued.has(itemId) || this.#running.has(itemId)) return false;
    this.#queued.add(itemId); this.flush(); return true;
  }
  /** Only restore interrupted pending work, never requeue a pending job in this process. */
  resumeInterrupted(): void {
    for (const item of this.campaign.exportSnapshot().items) if (item.sprite?.status === "pending" && !this.#running.has(item.id) && !this.#completed.some(r => r.id === item.id)) this.#queued.add(item.id);
    this.flush();
  }
  #commit(commands: CampaignCommand[]): void {
    this.campaign.apply({ expected_revision: this.campaign.revision, commands });
    try { this.deps.changed?.(); } catch { /* Observation is non-authoritative. */ }
  }
  /** Called on session idle and on background completion. Never mutates a running turn. */
  flush(): void {
    if (this.deps.can_commit && !this.deps.can_commit()) return;
    for (const result of this.#completed.splice(0)) {
      const item = this.campaign.exportSnapshot().items.find(i => i.id === result.id);
      const ready = result.commands.find(c => c.kind === "set_item_sprite" && c.sprite.status === "ready");
      try {
        if (item?.sprite?.status === "pending") this.#commit(result.commands);
        else throw new Error("superseded sprite job");
      } catch {
        // Bad/stale enrichment must never escape into the gameplay lifecycle or strand an asset.
        if (ready?.kind === "set_item_sprite" && ready.sprite.status === "ready") {
          void this.deps.store?.remove(this.campaign.exportSnapshot().campaign_id, result.id, ready.sprite.asset_ref);
        }
        if (item?.sprite?.status === "pending") this.#commit([{ kind: "set_item_sprite", item_id: result.id, sprite: { status: "failed", error_code: "visual_commit_failed" } }]);
      }
    }
    for (const id of this.#queued) {
      this.#queued.delete(id);
      const item = this.campaign.exportSnapshot().items.find(i => i.id === id);
      if (!item || item.sprite?.status === "ready" || this.#running.has(id)) continue;
      if (item.sprite?.status !== "pending") this.#commit([{ kind: "set_item_sprite", item_id: id, sprite: { status: "pending" } }]);
      const work = Promise.resolve().then(() => this.#generate(id)).finally(() => { this.#running.delete(id); this.flush(); });
      this.#running.set(id, work);
    }
  }
  async #generate(id: string): Promise<void> {
    const item = this.campaign.exportSnapshot().items.find(i => i.id === id)!;
    let staged: string | undefined, final: string | undefined;
    const store = this.deps.store, campaignId = this.campaign.exportSnapshot().campaign_id;
    try {
      let visual = item.visual_description;
      if (!visual && this.deps.enrich) visual = await this.deps.enrich(structuredClone(item) as CampaignItem);
      if (!visual?.trim() || visual.length > 8000) throw new Error("missing_visual_description");
      if (!this.deps.generator || !store) throw new ImageGenerationError("configuration_error");
      if (!this.deps.reviewer) throw new SpriteQualityError("review_failed");
      const identity = { name: item.name ?? "Unnamed item", category: item.category, visual_description: visual };
      let validated: ReturnType<typeof validateImageBytes> | undefined;
      // At most two image requests; transport/reviewer failures never regenerate.
      for (const attempt of [1, 2] as const) {
        const image = await this.deps.generator.generate({ prompt: attempt === 1 ? itemSpritePrompt(identity, this.deps.trigger ?? RAENA_IMAGE_STACK.trigger) : itemSpriteRetryPrompt(identity, this.deps.trigger ?? RAENA_IMAGE_STACK.trigger),
          negative_prompt: ITEM_SPRITE_NEGATIVE_PROMPT,
          width: RAENA_IMAGE_STACK.avatar_size.width, height: RAENA_IMAGE_STACK.avatar_size.height, seed: randomInt(1, 2 ** 31 - 1) });
        const candidate = validateImageBytes(image.bytes, image.media_type);
        let accepted: boolean;
        try { accepted = validateSpriteQuality(await this.deps.reviewer.review({ ...identity, image: candidate })).accepted; }
        catch { throw new SpriteQualityError("review_failed"); }
        if (accepted) { validated = candidate; break; }
        // Rejected bytes are released without staging in campaign storage.
      }
      if (!validated) throw new SpriteQualityError("quality_rejected");
      staged = await store.stage(campaignId, id, validated.bytes);
      final = `portrait_item_${randomBytes(8).toString("hex")}.${extensionFor(validated.media_type)}`;
      await store.finalize(staged, campaignId, id, final); staged = undefined;
      this.#completed.push({ id, commands: [
        ...(!item.visual_description ? [{ kind: "enrich_item_visual" as const, item_id: id, visual_description: visual }] : []),
        { kind: "set_item_sprite", item_id: id, sprite: { status: "ready", asset_ref: final, generated_from_visual_description: visual } },
      ] });
    } catch (error) {
      if (staged && store) await store.discard(staged);
      if (final && store) await store.remove(campaignId, id, final);
      const code = error instanceof SpriteQualityError || error instanceof ImageGenerationError ? error.code : error instanceof Error && error.message === "missing_visual_description" ? "missing_visual_description" : "storage_or_enrichment_error";
      this.#completed.push({ id, commands: [{ kind: "set_item_sprite", item_id: id, sprite: { status: "failed", error_code: code } }] });
    }
  }
  /** Host/test seam; callers must first allow idle metadata commits. */
  async settled(): Promise<void> { await Promise.all(this.#running.values()); this.flush(); }
}
