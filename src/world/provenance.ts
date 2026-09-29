import { createHash } from "node:crypto";
import { basename, isAbsolute, posix, relative, resolve, win32 } from "node:path";
import type { WorldDocument } from "../types/knowledge.js";
import type { DeepReadonly } from "../types/readonly.js";

/** Trusted engine provenance, never a model-facing filesystem capability. */
export interface CanonicalProvenance {
  readonly source_kind: "authored_canon";
  readonly source_path: string;
  readonly entity_id: string;
  readonly schema_version: 1;
  readonly dataset_id: string;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Validated records, sorted entities/chunks and object keys; array order otherwise matters. */
export function datasetIdentity(documents: readonly DeepReadonly<WorldDocument>[]): string {
  const canonical = [...documents].sort((a, b) => compareIds(a.entity.id, b.entity.id)).map(doc => ({
    ...doc, chunks: [...doc.chunks].sort((a, b) => compareIds(a.id, b.id)),
  }));
  return `sha256:${createHash("sha256").update(canonicalJson(canonical), "utf8").digest("hex")}`;
}

export function compareIds(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

export function sourcePath(source: string, root?: string): string {
  if (root !== undefined) return relative(resolve(root), resolve(source)).replaceAll("\\", "/");
  // Programmatic stores need no checkout root. Absolute fixture paths retain only
  // their filename unless the caller supplies a dataset root explicitly.
  if (win32.isAbsolute(source)) return win32.basename(source);
  if (isAbsolute(source)) return basename(source);
  return posix.normalize(source.replaceAll("\\", "/"));
}
