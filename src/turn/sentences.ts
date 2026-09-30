/** Sentence splitting that keeps quoted dialogue intact. */
export function sentencesOf(text: string): string[] {
  const out: string[] = []; let start = 0, inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\"" || ch === "“" || ch === "”") inQuote = ch === "“" ? true : ch === "”" ? false : !inQuote;
    if (!inQuote && (/[.!?]/.test(ch) && /\s/.test(text[i + 1] ?? " ") || ch === "\n")) { const s = text.slice(start, i + 1).trim(); if (s) out.push(s); start = i + 1; }
  }
  const tail = text.slice(start).trim(); if (tail) out.push(tail);
  return out;
}
/** Quoted dialogue replaced by spaces (same length): narration outside dialogue. */
export const blankQuotes = (text: string) => text.replace(/"[^"\n]*"|“[^”\n]*”/g, m => " ".repeat(m.length));
