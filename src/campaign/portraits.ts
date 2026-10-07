import { createHash } from "node:crypto";
import type { CampaignCommand, CampaignSnapshot, CharacterPortraitRecord } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { PreparationContext } from "./preparation.js";
import { fail } from "./validation.js";

/**
 * Portrait Gallery V2: derived-media metadata only. A generated portrait is downstream of the permanent appearance and never feeds
 * back into it; these commands touch nothing but the `portraits` extension. Bytes live in the local asset store.
 *
 * The Gallery is `versions`. Avatar and Full Body are roles naming Gallery versions of the same record; one version may hold both.
 * Avatar is bootstrapped once (first successful batch into an empty Gallery with no Avatar) and afterwards only reassigned, never
 * cleared. Full Body is only ever player-selected and may be cleared. A version holding a role cannot be deleted.
 */
export const MAX_PORTRAIT_VERSIONS = 64;
/** One generation action requests exactly this many independent candidates (the configured model advertises n = 1). */
export const PORTRAIT_BATCH_SIZE = 3;
export function preparePortraitCommand(context: PreparationContext, command: CampaignCommand): boolean {
  const { draft, refs } = context;
  const recordFor = (characterId: string, create = true): CharacterPortraitRecord => {
    refs.character(characterId);
    if (!draft.characters.some(c => c.id === characterId)) fail("character_id", "portraits belong to a campaign character record");
    const records = draft.portraits ??= [];
    let record = records.find(r => r.character_id === characterId);
    if (!record) {
      if (!create) fail("character_id", "no portrait gallery for this character");
      record = { character_id: characterId, versions: [] }; records.push(record);
    }
    return record;
  };
  const galleryVersion = (record: CharacterPortraitRecord, versionId: string) => {
    if (!record.versions.some(v => v.version_id === versionId)) fail("version_id", "not a version in this character's gallery");
    return versionId;
  };
  const dropIfEmpty = (record: CharacterPortraitRecord) => { if (!record.versions.length && !record.reference) draft.portraits = draft.portraits!.filter(r => r !== record); };
  switch (command.kind) {
    case "record_portrait_batch": {
      const record = recordFor(command.character_id);
      if (!command.versions.length) fail("versions", "a batch records at least one version");
      if (record.versions.length + command.versions.length > MAX_PORTRAIT_VERSIONS) fail("versions", "portrait version limit reached");
      for (const version of command.versions) {
        if ([...record.versions, ...command.versions.filter(v => v !== version)].some(v => v.version_id === version.version_id || v.asset_file === version.asset_file)) fail("version_id", "portrait version already recorded");
      }
      if (command.avatar_version_id !== undefined) {
        // First-batch bootstrap only: the Gallery was empty and no Avatar existed; the choice is one of THIS batch's versions.
        if (record.versions.length || record.avatar_version_id !== undefined) fail("avatar_version_id", "avatar is bootstrapped only by the first batch");
        if (!command.versions.some(v => v.version_id === command.avatar_version_id)) fail("avatar_version_id", "avatar must be a version of this batch");
      }
      record.versions.push(...command.versions);
      if (command.avatar_version_id !== undefined) record.avatar_version_id = command.avatar_version_id;
      return true;
    }
    case "set_portrait_avatar": {
      const record = recordFor(command.character_id, false);
      record.avatar_version_id = galleryVersion(record, command.version_id);
      return true;
    }
    case "set_portrait_full_body": {
      const record = recordFor(command.character_id, false);
      if (command.version_id === null) delete record.full_body_version_id;
      else record.full_body_version_id = galleryVersion(record, command.version_id);
      return true;
    }
    case "delete_portrait_version": {
      const record = recordFor(command.character_id, false);
      galleryVersion(record, command.version_id);
      if (record.avatar_version_id === command.version_id || record.full_body_version_id === command.version_id) fail("version_id", "a version holding a role cannot be deleted");
      record.versions = record.versions.filter(v => v.version_id !== command.version_id);
      dropIfEmpty(record);
      return true;
    }
    case "set_portrait_reference": {
      const record = recordFor(command.character_id);
      if (command.reference) record.reference = command.reference; else delete record.reference;
      dropIfEmpty(record);
      return true;
    }
    default: return false;
  }
}
/** Whole-snapshot integrity: unique versions and files per record; both roles name a version of the same record. */
export function validatePortraitRecords(snapshot: DeepReadonly<Pick<CampaignSnapshot, "portraits" | "characters">>): void {
  const seen = new Set<string>();
  for (const record of snapshot.portraits ?? []) {
    if (seen.has(record.character_id)) fail("portraits", "duplicate portrait record"); seen.add(record.character_id);
    if (!snapshot.characters.some(c => c.id === record.character_id)) fail("portraits.character_id", "portraits belong to a campaign character record");
    const ids = new Set(record.versions.map(v => v.version_id)), files = new Set(record.versions.map(v => v.asset_file));
    if (ids.size !== record.versions.length || files.size !== record.versions.length) fail("portraits.versions", "duplicate portrait version");
    if (record.avatar_version_id !== undefined && !ids.has(record.avatar_version_id)) fail("portraits.avatar_version_id", "avatar must name a gallery version");
    if (record.full_body_version_id !== undefined && !ids.has(record.full_body_version_id)) fail("portraits.full_body_version_id", "full body must name a gallery version");
  }
}
/** Opaque URL token for one stored file (a portrait version or the reference): no ID, name or path is derivable from it. */
export function portraitAssetToken(campaignId: string, characterId: string, file: string): string {
  return createHash("sha256").update(`portrait-asset:${campaignId}:${characterId}:${file}`).digest("hex").slice(0, 32);
}
/** Opaque browser handle for one Gallery item (role and delete actions). Distinct from the asset token; never a version ID or file name. */
export function portraitItemToken(campaignId: string, characterId: string, versionId: string): string {
  return createHash("sha256").update(`portrait-item:${campaignId}:${characterId}:${versionId}`).digest("hex").slice(0, 32);
}
/** The portrait record of one character, if any. */
export function portraitRecord(snapshot: DeepReadonly<Pick<CampaignSnapshot, "portraits">>, characterId: string) {
  return snapshot.portraits?.find(r => r.character_id === characterId);
}
/** The Gallery version holding the Avatar role (compact surfaces), if any. */
export function avatarPortrait(snapshot: DeepReadonly<Pick<CampaignSnapshot, "portraits">>, characterId: string) {
  const record = portraitRecord(snapshot, characterId);
  return record?.avatar_version_id === undefined ? undefined : record.versions.find(v => v.version_id === record.avatar_version_id);
}
/** The Gallery version holding the Full Body role (expanded surfaces), if any. Never falls back to the Avatar. */
export function fullBodyPortrait(snapshot: DeepReadonly<Pick<CampaignSnapshot, "portraits">>, characterId: string) {
  const record = portraitRecord(snapshot, characterId);
  return record?.full_body_version_id === undefined ? undefined : record.versions.find(v => v.version_id === record.full_body_version_id);
}
