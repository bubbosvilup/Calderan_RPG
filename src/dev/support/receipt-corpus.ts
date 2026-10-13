/**
 * Pass C receipt-language corpus: narrator phrasings for "the recipient received the item from Nicco", seeded from text observed in live
 * runs and tests, classified by what they prove. Used by tests/receipt-corpus.test.ts; never read at runtime.
 *   A  unequivocal transfer of possession (verifier must accept)
 *   B  merely touches / holds an item already possessed (must reject)
 *   C  ambiguous (must reject: no change of possession is established)
 *   D  refusal / non-completion (must reject)
 */
export type ReceiptClass = "A" | "B" | "C" | "D";
export interface ReceiptPhrase { readonly text: string; readonly class: ReceiptClass; readonly source: string;
  /** For class A: parts used to generate adversarial negatives (subject, inflected verb, base verb, object phrase). */
  readonly parts?: { readonly subject: string; readonly verb: string; readonly base: string; readonly rest: string } }
export const RECEIPT_CORPUS: readonly ReceiptPhrase[] = [
  { text: "Brenna takes the sword.", class: "A", source: "Pass B live run 1 (E2E1) and evidence corpus", parts: { subject: "Brenna", verb: "takes", base: "take", rest: "the sword" } },
  { text: "Brenna reaches out and takes the sword.", class: "A", source: "Pass B live run 1", parts: { subject: "Brenna", verb: "reaches out and takes", base: "reach out and take", rest: "the sword" } },
  { text: "Brenna accepts the Sword.", class: "A", source: "Pass B capitalised-name regression", parts: { subject: "Brenna", verb: "accepts", base: "accept", rest: "the sword" } },
  { text: "Brenna picks up the sword from Nicco's hand.", class: "A", source: "RECEIPT vocabulary (evidence-authorization.ts)", parts: { subject: "Brenna", verb: "picks up", base: "pick up", rest: "the sword from Nicco's hand" } },
  { text: "Brenna receives the sword.", class: "A", source: "RECEIPT vocabulary", parts: { subject: "Brenna", verb: "receives", base: "receive", rest: "the sword" } },
  { text: "Brenna collects the sword.", class: "A", source: "RECEIPT vocabulary", parts: { subject: "Brenna", verb: "collects", base: "collect", rest: "the sword" } },
  { text: "Brenna snatches the sword.", class: "A", source: "RECEIPT vocabulary", parts: { subject: "Brenna", verb: "snatches", base: "snatch", rest: "the sword" } },
  { text: "Brenna reclaims the sword.", class: "A", source: "RECEIPT vocabulary", parts: { subject: "Brenna", verb: "reclaims", base: "reclaim", rest: "the sword" } },
  { text: "Brenna takes hold of the sword.", class: "A", source: "Pass B report (previously failing formulation)", parts: { subject: "Brenna", verb: "takes hold of", base: "take hold of", rest: "the sword" } },
  { text: "Brenna lifts the sword from his hand.", class: "A", source: "Pass B report (previously failing formulation)", parts: { subject: "Brenna", verb: "lifts", base: "lift", rest: "the sword from his hand" } },
  { text: "Brenna closes her fingers around the sword offered by Nicco.", class: "A", source: "Pass B report (previously failing formulation)", parts: { subject: "Brenna", verb: "closes her fingers around", base: "close her fingers around", rest: "the sword offered by Nicco" } },
  { text: "Brenna grips the sword.", class: "B", source: "Pass B report (previously failing formulation): touching, not proof of receipt" },
  { text: "Brenna grips her own sword.", class: "B", source: "Pass C brief: already possessed" },
  { text: "Brenna touches the sword.", class: "B", source: "Pass C" },
  { text: "Brenna's fingers close around the hilt.", class: "C", source: "Pass B report: no offer, no item named" },
  { text: "Brenna closes her fingers around the sword.", class: "C", source: "Pass C: no offer in the sentence" },
  { text: "Brenna looks at the sword.", class: "C", source: "Pass C brief" },
  { text: "Brenna reaches for the sword.", class: "D", source: "Pass C brief: not completed" },
  { text: "Brenna almost takes the sword.", class: "D", source: "Pass C brief" },
  { text: "Brenna could take the sword.", class: "D", source: "Pass C brief" },
  { text: "Maren watches as Brenna takes the sword.", class: "C", source: "Pass C brief: third person present; conservative" },
  { text: "Brenna closes her fingers around the sword offered by Nicco, then pushes it back.", class: "D", source: "Pass C brief" },
];
