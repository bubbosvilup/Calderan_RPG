import { parseCampaignProposal } from "../campaign/validation.js";
import type { CampaignCommand } from "../campaign/types.js";
import { ProviderError } from "./errors.js";

type Schema = { type?: string; enum?: readonly unknown[]; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: false; items?: Schema; maxItems?: number; anyOf?: Schema[] };
const string: Schema = { type: "string" }, integer: Schema = { type: "integer" };
const choice = (...values: string[]): Schema => ({ type: "string", enum: values });
const object = (properties: Record<string, Schema>): Schema => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const position: Schema = { anyOf: [object({ kind: choice("carried"), character_id: string }),
  object({ kind: choice("equipped"), character_id: string, slot: string, mode: choice("worn", "held") })] };
/** Deliberately small Phase 1K vocabulary. Relationship and arbitrary runtime edits are excluded. */
export const CONTROLLER_SCHEMA = object({ commands: { type: "array", maxItems: 8, items: { anyOf: [
  object({ kind: choice("place_item"), item_id: string, position }),
  object({ kind: choice("transfer_item"), item_id: string, owner_id: string, position }),
  object({ kind: choice("schedule_event"), id: string, title: string, scheduled_world_minute: integer, participants: { type: "array", items: string, maxItems: 16 } }),
  object({ kind: choice("set_knowledge"), knowledge: object({ character_id: string, fact_id: string, status: choice("knows", "believes", "suspects", "heard_rumor"),
    provenance: object({ source_character_id: string, acquisition_kind: choice("told") }) }) }),
] } } });
function matches(value: unknown, schema: Schema): boolean {
  if (schema.anyOf) return schema.anyOf.some(s => matches(value, s));
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "string") return typeof value === "string";
  if (schema.type === "integer") return typeof value === "number" && Number.isSafeInteger(value);
  if (schema.type === "array") return Array.isArray(value) && value.length <= (schema.maxItems ?? Infinity) && value.every(v => matches(v, schema.items!));
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const obj = value as Record<string, unknown>;
    return Object.keys(obj).every(k => Object.hasOwn(schema.properties!, k)) && schema.required!.every(k => Object.hasOwn(obj, k)) &&
      Object.entries(obj).every(([k, v]) => matches(v, schema.properties![k]!));
  }
  return false;
}
export function parseControllerProposal(text: string): readonly CampaignCommand[] {
  try {
    const value: unknown = JSON.parse(text);
    if (!matches(value, CONTROLLER_SCHEMA)) throw new Error();
    // Revision is an internal parsing placeholder, never a proposed/committable revision.
    return parseCampaignProposal({ expected_revision: 0, commands: (value as { commands: unknown }).commands }).commands;
  } catch { throw new ProviderError("structured_output_invalid"); }
}
/**
 * Phase 1O: the same command vocabulary, each command paired with a short verbatim evidence quote from the final narration.
 * The quote never authorizes anything by itself; see docs/architecture/EVIDENCE_AUTHORIZATION.md.
 */
export const EVIDENCE_QUOTE_MAX = 240;
export const CONTROLLER_EVIDENCE_SCHEMA = object({ commands: { type: "array", maxItems: 8, items: object({ command: CONTROLLER_SCHEMA.properties!.commands!.items!, evidence_quote: string }) } });
export interface ProposedCommandWithEvidence { readonly command: CampaignCommand; readonly evidence_quote: string }
/** Parses the evidence shape; commands pass the same strict vocabulary and campaign validation as parseControllerProposal. */
export function parseControllerEvidenceProposal(text: string): readonly ProposedCommandWithEvidence[] {
  try {
    const value: unknown = JSON.parse(text);
    if (!matches(value, CONTROLLER_EVIDENCE_SCHEMA)) throw new Error();
    const items = (value as { commands: { command: unknown; evidence_quote: string }[] }).commands;
    const commands = parseCampaignProposal({ expected_revision: 0, commands: items.map(i => i.command) }).commands;
    return commands.map((command, i) => ({ command, evidence_quote: items[i]!.evidence_quote }));
  } catch { throw new ProviderError("structured_output_invalid"); }
}
