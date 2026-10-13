import { NUMBER_WORDS, TENS } from "../language/numbers.js";

/**
 * The ONE vocabulary of dialogue and identity reading (Block 11). Before this block the same words lived in four places (the scene reader, the
 * prompt's recent-conversation projection, the commerce facts and the identity guards), each with its own speech-verb and person-noun list.
 * Every reader of who speaks, who is named and who is meant now takes its words from here.
 */

/** A quoted span of legacy prose ("…" or “…”), at most 800 characters, on one line. */
export const QUOTE = /"([^"\n]{1,800})"|“([^”\n]{1,800})”/g;

/** Verbs that tag a line of dialogue with its speaker ("Maren says", "says Korvin", "he grunts"). */
export const SPEECH = "says|said|asks|asked|replies|replied|adds|added|murmurs|murmured|whispers|whispered|mutters|muttered|answers|answered|continues|continued|repeats|repeated|calls|called|shouts|shouted|snaps|snapped|tells|told|insists|insisted|explains|explained|grunts|grunted|drawls|drawled|offers|offered|growls|growled|laughs|laughed|states|stated";

/** People nouns narration attaches to a person it describes (the woman, a boy, the captive). */
export const PERSON_NOUNS = "woman|man|girl|boy|youth|child|lad|lass|elf|dwarf|halfling|orc|beastfolk|captive|prisoner|slave";
/** Nouns that can denote an unnamed speaker (anonymous counterparties included). */
export const SPEAKER_NOUNS = `${PERSON_NOUNS}|whittler|seller|merchant|trader|slaver|guard|keeper|handler|dealer|vendor|stallholder|hawker|stranger|porter|clerk|passer-by|passerby`;
/**
 * Every noun that can stand as the SUBJECT of a narrated sentence or the speaker of a quote: the speaker nouns plus the street roles the prompt's
 * recent-conversation projection used to recognise (soldier, priest, innkeeper…). One list for both, so a person is the same person to every reader.
 */
export const SUBJECT_NOUNS = `${SPEAKER_NOUNS}|soldier|priestess|priest|innkeeper|citizen|shopkeeper|beggar|sailor|watchman|traveler|traveller|elder|laborer|labourer|worker|servant|official|peddler`;

export const FEMALE_NOUNS: ReadonlySet<string> = new Set(["woman", "girl", "lass", "priestess"]);
export const MALE_NOUNS: ReadonlySet<string> = new Set(["man", "boy", "lad"]);
export type Sex = "female" | "male";
export const nounSex = (noun: string): Sex | undefined => FEMALE_NOUNS.has(noun.toLowerCase()) ? "female" : MALE_NOUNS.has(noun.toLowerCase()) ? "male" : undefined;

/**
 * Captivity markers (being HELD, not the mere presence of a cage). "leans on the cage" or "gestures at the cages" is not captivity;
 * "behind the bars", "in the last cage", "chained", "enslaved", "from a debt auction" is.
 */
export const CAPTIVE = /\b(?:(?:in|inside|behind|within|against|through|from) (?:the |a |an |her |his |its |their |this |that )?(?:[a-z-]+ ){0,2}?(?:cages?|bars|pens?|iron|irons|cell)|caged|in chains|in irons|chained|shackled|manacled|collared|fettered|enslaved|for sale|debt[- ](?:auction|forfeiture|bond)|auctioned|(?:up )?for auction|(?:on|from) the (?:auction )?block|auction block|write-offs?)\b/i;

/** Capitalized words that are never names (sentence starters, numbers, pronouns, states, common narration words). */
export const STOP: ReadonlySet<string> = new Set(["the", "a", "an", "he", "she", "they", "it", "his", "her", "their", "its", "i", "you", "we", "my", "your", "our", "this", "that", "these", "those", "there", "here",
  "what", "who", "why", "how", "when", "where", "which", "yes", "no", "not", "now", "done", "deal", "just", "only", "then", "and", "but", "or", "so", "if", "maybe", "perhaps", "look", "listen",
  "something", "nothing", "someone", "nobody", "everyone", "everything", "somewhere", "papers", "sick", "gold", "fine", "good", "well", "right", "sure", "please", "enough",
  "behind", "near", "between", "beyond", "inside", "outside", "above", "below", "after", "before", "again", "still", "even", "never", "always", "every", "each", "both", "all", "some", "any",
  "more", "less", "most", "much", "many", "few", "clean", "free", "take", "pay", "name", "price", "lord", "lady", "sir", "master", "mistress", "sorry", "afraid", "glad", "tired", "busy",
  "okay", "yours", "mine", "home", "back", "late", "new", "old", "ready", "thanks", "thank", "hungry", "cold", "hurt", "nobody", "nothing", "alone", "lost", "leaving", "coming", "going",
  ...NUMBER_WORDS, ...Object.keys(TENS)]);

/** A capitalized personal-name token (three letters or more). */
export const NAME = "([A-Z][a-z]{2,})";

/** Bodily-action cues of a narrated beat the narrator wrote without asterisks. */
export const PLAIN_BEAT = /\b(?:(?:his|her|their)\s+(?:hands?|eyes?|face|jaw|crouch|head|shoulders?|arms?|knees?|lips|breath|weight|thumbs?|fingers?|nose|belt)|(?:watches|studies|reads|shifts|glances|looks|nods|shrugs|scratches|rubs|turns|steps|crouches|stands|leans|exhales|sighs|grunts|pauses|waits|hasn't moved|has not moved))\b/i;

/** A bounded non-person discourse beat ("A brief pause follows.") that does not change who is speaking inside one paragraph. */
export const NEUTRAL_BEAT = /^(?:a|the|another)\s+(?:(?:brief|short|long|small|quiet|momentary)\s+){0,2}(?:pause|silence|beat)\s+(?:follows?|followed|passes?|passed|settles?|settled|falls?|fell|lingers?|lingered)(?:\s+(?:briefly|quietly))?[.!?]?\s*$/i;

/** A delivery verb of an explicit speech beat ("Brenna pauses, then recites from memory."): the next quoted paragraph continues that speaker. */
export const DELIVERY = `${SPEECH}|recites?|recited|speaks?|spoke|speaking|responds?|responded`;

/**
 * A narration beat that tags the PRECEDING spoken line after the fact: "He says it flat", "Korvin says this without looking up", "She delivers
 * the words quietly". Live narrators often put the price in a plain line and describe its delivery in the next starred beat (KPG-2).
 */
export const POST_HOC_TAG = /^\s*(?:\w+ly\s+)?(?:says?|said|delivers?|delivered|states?|stated|quotes?|quoted|repeats?|repeated|offers?|offered|names?|named|puts?|put|lets?|let)\s+(?:it|this|that|the (?:words?|price|figure|number|line|sum|offer))\b/i;

/** Pronouns that refer to a third person; a speaker does not talk about themself this way. */
export const SHE = /\b(?:she|her|hers|herself)\b/i;
export const HE = /\b(?:he|him|his|himself)\b/i;
/** First or second person: the line is somebody talking, not narration. */
export const FIRST_OR_SECOND = /\b(?:i|i'm|i've|i'll|i'd|you|you're|you'll|your|my|me|we|us|let's)\b/i;
