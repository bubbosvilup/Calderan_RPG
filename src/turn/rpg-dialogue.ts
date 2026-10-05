/** Conversational narrator output only; undefined delegates legacy attributed quotations to the old projector. */
export function rpgDialogue(text: string): readonly string[] | undefined {
  if (/```|\*\*|<\/?[a-z][^>]*>|^\s*(?:#{1,6}\s|[\[{}|]|(?:system|assistant|metadata|debug|speaker)\s*:)/im.test(text)) return [];
  if (!text.trimStart().startsWith("*") && /["“”]/.test(text) && !/^\s*["“][^"“”]+["”]\s*$/.test(text)) return undefined;
  const stars = [...text.matchAll(/(?<!\\)\*/g)];
  if (stars.length % 2) return []; // An unfinished narration block authorizes no guessed speech boundary.
  const outside: string[] = [];
  let start = 0;
  for (let i = 0; i < stars.length; i += 2) {
    outside.push(text.slice(start, stars[i]!.index));
    start = stars[i + 1]!.index + 1;
  }
  outside.push(text.slice(start));
  return outside.flatMap(block => block.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0 && s.length <= 400))
    .map(s => s.replace(/^["“]([\s\S]*)["”]$/, "$1")).slice(0, 12);
}
