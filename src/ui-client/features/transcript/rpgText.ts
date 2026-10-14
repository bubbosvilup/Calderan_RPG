/**
 * Story markup (same rules as the legacy client): single unescaped stars delimit narration (actions), everything else is dialogue; `\*`
 * is a literal star and `**` stays literal. An unfinished narration span stays narration. The result is plain text segments rendered as
 * React text nodes: model text is never interpreted as HTML.
 */
export interface StorySegment { readonly kind: "narration" | "dialogue"; readonly text: string }

export function parseStoryText(source: string): readonly StorySegment[] {
  const segments: StorySegment[] = [];
  let narration = false, text = "";
  const flush = () => { if (text) segments.push({ kind: narration ? "narration" : "dialogue", text }); text = ""; };
  for (let i = 0; i < source.length; i++) {
    const char = source[i], next = source[i + 1];
    if (char === "\\" && next === "*") { text += "*"; i++; }
    else if (char === "*" && next === "*") { text += "**"; i++; }
    else if (char === "*") { flush(); narration = !narration; }
    else text += char;
  }
  flush();
  return segments;
}
