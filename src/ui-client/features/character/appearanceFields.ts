import type { AppearanceFieldDto, NpcAppearanceFieldDto, PlayerCharacterDto } from "../../api/types";
import type { ProfilePatch } from "../../api/player";

/** One editable line of the profile form: an identity line or an appearance field, with the value the server has SAVED for it. */
export interface FormField {
  readonly key: string;
  readonly label: string;
  readonly group: "identity" | AppearanceFieldDto["group"];
  readonly kind: AppearanceFieldDto["kind"];
  readonly unit?: "cm" | "kg" | undefined;
  /** The saved text (list items joined by newlines), or null when nothing is saved. */
  readonly stored: string | null;
  /** What applies when nothing is saved (an NPC+ field's baseline). Shown as reference text, never presented as a saved value. */
  readonly inherited?: string | null | undefined;
}

export const GROUPS: readonly { readonly id: FormField["group"]; readonly title: string }[] = [
  { id: "identity", title: "Identity" },
  { id: "body", title: "Body" },
  { id: "hair", title: "Hair" },
  { id: "face", title: "Face" },
  { id: "description", title: "Description" },
];

/** The editor fields of an NPC+ (no identity lines: those are read-only text). */
export function npcFormFields(fields: readonly NpcAppearanceFieldDto[]): readonly FormField[] {
  return fields.map((field): FormField => ({ key: field.key, label: field.label, group: field.group, kind: field.kind, unit: field.unit, stored: field.override, inherited: field.inherited }));
}

export function formFields(identity: PlayerCharacterDto["identity"], fields: readonly AppearanceFieldDto[]): readonly FormField[] {
  return [
    ...identity.map((line): FormField => ({ key: line.key, label: line.label, group: "identity", kind: "text", stored: line.value })),
    ...fields.map((field): FormField => ({ key: field.key, label: field.label, group: field.group, kind: field.kind, unit: field.unit, stored: field.override })),
  ];
}

type Normalized = string | number | readonly string[];
const isEmpty = (value: Normalized) => (Array.isArray(value) ? value.length === 0 : value === "");

/** The value the server would store for the text in a field; NaN for a number field that does not hold a whole number. */
function normalize(field: FormField, text: string): Normalized {
  if (field.kind === "lines") return text.split("\n").map(line => line.trim()).filter(Boolean);
  if (field.kind === "number") { const t = text.trim(); return t === "" ? "" : /^\d+$/.test(t) ? Number(t) : Number.NaN; }
  return text.trim().replace(/\s+/g, " ");
}

/**
 * What changed, as the server's patch: a field is included only when its text differs from the saved value (omitted = unchanged); emptying a
 * saved value clears it (`null`); emptying an unsaved one changes nothing. A number field that is not a whole number is reported in `invalid`.
 * No range or length rule lives here: the engine bounds the values and names the field it refuses.
 */
export function profilePatch(fields: readonly FormField[], edits: Readonly<Record<string, string>>): { readonly patch: ProfilePatch; readonly invalid: readonly string[] } {
  const patch: Record<string, string | number | readonly string[] | null> = {}, invalid: string[] = [];
  for (const field of fields) {
    if (!(field.key in edits)) continue;
    const next = normalize(field, edits[field.key]!), stored = field.stored === null ? null : normalize(field, field.stored);
    if (typeof next === "number" && Number.isNaN(next)) { invalid.push(field.key); continue; }
    if (isEmpty(next)) { if (stored !== null && !isEmpty(stored)) patch[field.key] = null; continue; }
    if (JSON.stringify(next) !== JSON.stringify(stored)) patch[field.key] = next;
  }
  return { patch, invalid };
}
