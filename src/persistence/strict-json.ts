import { CampaignSaveError } from "./errors.js";
export const MAX_SAVE_BYTES = 16 * 1024 * 1024;

/** Small strict JSON reader: rejects duplicate decoded keys and excessive nesting. */
export function parseSaveJson(text: string): unknown {
  if (Buffer.byteLength(text, "utf8") > MAX_SAVE_BYTES) throw new CampaignSaveError("invalid_save");
  let offset = 0;
  const invalid = (): never => { throw new CampaignSaveError("invalid_json"); };
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[offset] ?? "x")) offset++; };
  const string = (): string => {
    if (text[offset] !== '"') return invalid();
    const start = offset++;
    while (offset < text.length) {
      const c = text[offset++];
      if (c === "\\") offset++;
      else if (c === '"') {
        try { return JSON.parse(text.slice(start, offset)) as string; } catch { return invalid(); }
      }
    }
    return invalid();
  };
  const value = (depth: number): unknown => {
    if (depth > 64) return invalid(); whitespace();
    const c = text[offset];
    if (c === '"') return string();
    if (c === "{") {
      offset++; whitespace(); const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      if (text[offset] === "}") { offset++; return result; }
      while (true) {
        whitespace(); const key = string(); whitespace();
        if (text[offset++] !== ":" || Object.hasOwn(result, key)) return invalid();
        result[key] = value(depth + 1); whitespace();
        const end = text[offset++]; if (end === "}") return result; if (end !== ",") return invalid();
      }
    }
    if (c === "[") {
      offset++; whitespace(); const result: unknown[] = [];
      if (text[offset] === "]") { offset++; return result; }
      while (true) {
        result.push(value(depth + 1)); whitespace();
        const end = text[offset++]; if (end === "]") return result; if (end !== ",") return invalid();
      }
    }
    for (const [literal, parsed] of [["true", true], ["false", false], ["null", null]] as const) {
      if (text.startsWith(literal, offset)) { offset += literal.length; return parsed; }
    }
    const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
    number.lastIndex = offset; const match = number.exec(text);
    if (!match) return invalid(); offset = number.lastIndex;
    const n = Number(match[0]); if (!Number.isFinite(n)) return invalid(); return n;
  };
  const result = value(0); whitespace(); if (offset !== text.length) return invalid(); return result;
}
