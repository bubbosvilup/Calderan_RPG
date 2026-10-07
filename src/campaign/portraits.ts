import { createHash } from "node:crypto";
import type { CampaignCommand, CampaignSnapshot, CharacterPortraitRecord } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { PreparationContext } from "./preparation.js";
import { fail } from "./validation.js";

/**
 * Portrait Image Generation V1: derived-media metadata only. A generated portrait is downstream of the permanent appearance and
 * never feeds back into it; these commands touch nothing but the `portraits` extension. Bytes live in the local asset store.
 */
export const MAX_PORTRAIT_VERSIONS = 64;
export function preparePortraitCommand(context: PreparationContext, command: CampaignCommand): boolean {
  const { draft, refs } = context;
  const recordFor = (characterId: string): CharacterPortraitRecord => {
    refs.character(characterId);
    if (!draft.characters.some(c => c.id === characterId)) fail("character_id", "portraits belong to a campaign character record");
    const records = draft.portraits ??= [];
    let record = records.find(r => r.character_id === characterId);
    if (!record) { record = { character_id: characterId, versions: [] }; records.push(record); }
    return record;
  };
  switch (command.kind) {
    case "record_portrait": {
      const record = recordFor(command.character_id);
      if (record.versions.some(v => v.version_id === command.version.version_id || v.asset_file === command.version.asset_file)) fail("version_id", "portrait version already recorded");
      if (record.versions.length >= MAX_PORTRAIT_VERSIONS) fail("versions", "portrait version limit reached");
      record.versions.push(command.version);
      record.active_version_id = command.version.version_id;
      return true;
    }
    case "set_portrait_reference": {
      const record = recordFor(command.character_id);
      if (command.reference) record.reference = command.reference; else delete record.reference;
      if (!record.versions.length && !record.reference) draft.portraits = draft.portraits!.filter(r => r !== record);
      return true;
    }
    default: return false;
  }
}
/** Opaque URL token for one stored file (a portrait version or the reference): no ID, name or path is derivable from it. */
export function portraitAssetToken(campaignId: string, characterId: string, file: string): string {
  return createHash("sha256").update(`portrait-asset:${campaignId}:${characterId}:${file}`).digest("hex").slice(0, 32);
}
/** The portrait record of one character, if any. */
export function portraitRecord(snapshot: DeepReadonly<Pick<CampaignSnapshot, "portraits">>, characterId: string) {
  return snapshot.portraits?.find(r => r.character_id === characterId);
}
export function activePortrait(snapshot: DeepReadonly<Pick<CampaignSnapshot, "portraits">>, characterId: string) {
  const record = portraitRecord(snapshot, characterId);
  return record?.versions.find(v => v.version_id === record.active_version_id);
}
