/** RFC 4180-style local parser with quoted newlines, escaped quotes and row provenance. */
export function parseCsv(source: string): string[][] {
  if (source.length > 20_000_000) throw new Error("CSV exceeds local corpus limit");
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false, closed = false;
  source = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) { if (ch === '"') { if (source[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += ch; continue; }
    if (ch === '"') { if (field || closed) throw new Error("Invalid CSV quote"); quoted = true; }
    else if (ch === ",") { row.push(field); field = ""; closed = false; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && source[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; closed = false; }
    else { if (closed) throw new Error("Invalid CSV trailing field data"); field += ch; }
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (field || row.length || closed) { row.push(field); rows.push(row); }
  return rows;
}
export interface SourcePair { readonly source_player_record: number; readonly source_assistant_record: number; readonly player_message: string; readonly assistant_response: string }
export function extractPairs(csv: string): SourcePair[] {
  const rows = parseCsv(csv), header = rows.shift()!;
  const from = header.indexOf("From"), message = header.indexOf("Message");
  if (from < 0 || message < 0) throw new Error("Expected From and Message columns");
  const pairs: SourcePair[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const player = rows[i]!, assistant = rows[i + 1]!;
    if (player[from] === "Nicco" && assistant[from] === "Caldrevan - Dark Fantasy Isekai") pairs.push({ source_player_record: i + 2, source_assistant_record: i + 3, player_message: player[message]!, assistant_response: assistant[message]! });
  }
  return pairs;
}
