import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isAlias, isNode, parseDocument, visit } from "yaml";
import { WorldValidationError, type WorldSource } from "./validation.js";
import { WorldStore } from "./world-store.js";

async function findYamlFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    const source = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new WorldValidationError(source, undefined, "$", "symbolic links are not supported in authored data");
    if (entry.isDirectory()) files.push(...await findYamlFiles(source));
    else if (/\.ya?ml$/i.test(entry.name)) files.push(source);
  }
  return files.sort();
}

/** Parses all files before validating shapes and resolving dataset-wide references. */
export async function loadWorld(directory: string): Promise<WorldStore> {
  let files: string[];
  try { files = await findYamlFiles(directory); }
  catch (error) {
    if (error instanceof WorldValidationError) throw error;
    throw new WorldValidationError(directory, undefined, "$", `cannot read dataset: ${String(error)}`);
  }
  const sources: WorldSource[] = [];
  for (const source of files) {
    let text: string;
    try { text = await readFile(source, "utf8"); }
    catch (error) { throw new WorldValidationError(source, undefined, "$", `cannot read file: ${String(error)}`); }
    const parsed = parseDocument(text, { uniqueKeys: true, strict: true, merge: false });
    const id = parsed.getIn(["entity", "id"]);
    const entityId = typeof id === "string" ? id : undefined;
    const issue = parsed.errors[0] ?? parsed.warnings[0];
    if (issue) throw new WorldValidationError(source, entityId, "$", `invalid YAML: ${issue.message}`);
    visit(parsed, (_key, node) => {
      if (isAlias(node) || (isNode(node) && (node.anchor || node.tag))) {
        throw new WorldValidationError(source, entityId, "$", "YAML aliases, anchors, and explicit tags are not supported");
      }
    });
    sources.push({ source, document: parsed.toJS({ maxAliasCount: 0 }) as unknown });
  }
  return new WorldStore(sources, directory);
}
