/**
 * Phase 1O evidence corpus (agent-authored; truth labels pending human review). Shared by offline tests (maximally adversarial
 * controller: every contiguous word window is tried as a quote) and the paid real-DeepSeek evaluation. Negatives must never commit.
 */
export const TELL = "/tell campaign_fact_bridge_closed to brenna";
export const OFFER = "*gives her the two pink shirt, one fluffy and thick one made of probably cotton, the shorts are also pink and should be alright for her narrow waist*";
export interface EvidenceCase { readonly id: string; readonly input: string; readonly narration: string; readonly truth: "positive" | "negative"; readonly category: string; readonly ground_garments?: boolean; readonly brenna_knows?: boolean; readonly quotes?: readonly string[] }
const k = (id: string, category: string, narration: string, truth: "positive" | "negative" = "negative", quotes?: string[]): EvidenceCase => ({ id, input: TELL, narration, truth, category, ...(quotes ? { quotes } : {}) });
const t = (id: string, category: string, narration: string, truth: "positive" | "negative" = "negative", quotes?: string[]): EvidenceCase => ({ id, input: OFFER, narration, truth, category, ground_garments: true, ...(quotes ? { quotes } : {}) });

export const EVIDENCE_CORPUS: readonly EvidenceCase[] = [
  // Knowledge negatives.
  k("kn01", "reaction without communication", "Brenna looks worried."),
  k("kn02", "reaction without communication", "Brenna takes in the information. Her eyes widen."),
  k("kn03", "reaction without communication", "The news clearly troubles her. Brenna says nothing about the eastern bridge being closed."),
  k("kn04", "failed telling", "Nicco starts to tell Brenna that the eastern bridge is closed, but stops."),
  k("kn05", "failed telling", "Nicco considers explaining that the eastern bridge is closed."),
  k("kn06", "failed telling", "Brenna walks away before Nicco can say that the eastern bridge is closed."),
  k("kn07", "question containing the fact", "\"What if the eastern bridge were closed?\" Nicco asks."),
  k("kn08", "question containing the fact", "Maren leans in. \"Did Nicco tell Brenna the eastern bridge is closed?\" Nobody answers."),
  k("kn09", "reports somebody else told them", "Brenna says, \"Someone told me the eastern bridge is closed, but I do not believe it.\""),
  k("kn10", "reverse direction", "\"The eastern bridge is closed,\" Brenna tells Nicco."),
  k("kn11", "wrong recipient", "Nicco tells Maren that the eastern bridge is closed. Brenna is asleep."),
  k("kn12", "already knew", "Brenna already knew the eastern bridge was closed; she nods."),
  k("kn13", "perception without communication", "Nicco hears that the eastern bridge is closed and keeps it to himself."),
  k("kn14", "thought, not speech", "Gerome stands by the door while Nicco thinks about the eastern bridge being closed."),
  k("kn15", "negated communication", "Nicco does not tell Brenna that the eastern bridge is closed."),
  k("kn16", "thought, not speech", "Nicco mouths something Brenna cannot hear. The eastern bridge is closed, he thinks."),
  k("kn17", "writing, not telling", "Nicco writes \"the eastern bridge is closed\" on a scrap of paper and pockets it."),
  k("kn18", "someone else tells", "Maren tells Brenna that the eastern bridge is closed."),
  k("kn19", "hears unrelated dialogue", "Brenna hears Maren say that the eastern bridge is closed."),
  k("kn20", "someone else tells, Nicco watches", "Nicco listens as Maren tells Brenna that the eastern bridge is closed."),
  k("kn21", "future intention", "Nicco will tell Brenna that the eastern bridge is closed tomorrow."),
  // Transfer negatives.
  t("tr01", "hypothetical acceptance", "\"If you had given me these a week ago, I would have taken them,\" Brenna says. She leaves them in his hands."),
  t("tr02", "quoted NPC description of an event", "\"I took three pink shirts from a merchant once,\" Brenna says, smiling. She leaves the offered clothes where they are."),
  t("tr03", "negated acceptance", "Brenna does not take the shirts or the shorts. She shakes her head."),
  t("tr04", "accept then return", "Brenna takes the three garments, then hands them back. \"Keep them.\""),
  t("tr05", "refuse then discuss", "Brenna refuses the clothes. They talk for a while about colors; she admits that taking them would be kind, but she does not."),
  t("tr06", "almost takes", "Brenna almost takes the clothes, then pulls her hand away."),
  t("tr07", "considers taking", "Brenna considers taking the three items."),
  t("tr08", "looks only", "Brenna looks at the clothes."),
  t("tr09", "wrong recipient", "Maren takes the three garments from Nicco's hands."),
  t("tr10", "wrong recipient, observer", "Brenna watches Maren take the clothes."),
  t("tr11", "imagined", "Brenna imagines taking the three items, then decides against it."),
  t("tr12", "pronoun resolves to another NPC", "Maren steps closer to Nicco. She takes the three garments from his hands."),
  t("tr13", "reaches but does not take", "Brenna reaches toward the clothes but does not take them."),
  t("tr14", "future intention", "Brenna will take the clothes tomorrow."),
  t("tr15", "accept then retraction", "Brenna takes the stack. Maybe she will not keep them."),
  t("tr16", "passive without actor", "The three garments were accepted."),
  t("tr17", "dialogue instruction", "\"Take them,\" Brenna tells Maren, pushing the clothes toward her."),
  // Positives (the quotes mirror the kind of excerpt a controller returns).
  k("kp01", "direct prose", "Nicco tells Brenna that the eastern bridge is closed. She frowns.", "positive", ["Nicco tells Brenna that the eastern bridge is closed."]),
  k("kp02", "relative clause", "Nicco turns to Brenna, who sits alert despite her recovering condition, and tells her that the eastern bridge is closed.", "positive", ["tells her that the eastern bridge is closed"]),
  k("kp03", "quoted Nicco realizing /tell", "Nicco turns to Brenna. \"The eastern bridge is closed,\" he says.", "positive", ["\"The eastern bridge is closed,\" he says."]),
  k("kp04", "quoted Nicco realizing /tell", "\"The eastern bridge is closed,\" Nicco tells Brenna.", "positive", ["\"The eastern bridge is closed,\" Nicco tells Brenna."]),
  k("kp05", "colon construction", "Nicco speaks the fact plainly: the eastern bridge is closed. Brenna nods.", "positive", ["Nicco speaks the fact plainly: the eastern bridge is closed."]),
  k("kp06", "hears Nicco say", "Brenna hears Nicco say that the eastern bridge is closed.", "positive", ["Brenna hears Nicco say that the eastern bridge is closed."]),
  k("kp07", "Nicco says to Brenna, quoted", "Nicco says to Brenna, \"The eastern bridge is closed.\"", "positive", ["Nicco says to Brenna, \"The eastern bridge is closed.\""]),
  t("tp01", "sequential item acceptance", "Brenna glances at them. She took the pink cotton shirt, then the fluffy one, and finally the shorts, laying them across her lap.", "positive", ["She took the pink cotton shirt, then the fluffy one, and finally the shorts", "She took the pink cotton shirt, then the fluffy one, and finally the shorts", "She took the pink cotton shirt, then the fluffy one, and finally the shorts"]),
  t("tp02", "sequential item acceptance", "Brenna glances at them. She takes the fluffy shirt first, turning it over in her large hands, then the cotton shirt, and finally the shorts.", "positive", ["She takes the fluffy shirt first, turning it over in her large hands, then the cotton shirt, and finally the shorts."]),
  t("tp03", "list acceptance", "Brenna looks at the offered clothes. She accepts the pink cotton shirt, the pink fluffy shirt, and the pink shorts, taking them into her hands.", "positive", ["She accepts the pink cotton shirt, the pink fluffy shirt, and the pink shorts"]),
  t("tp04", "reaches out and takes", "Brenna looks at the offered clothes. She reaches out and takes them, gathering the shirts and shorts in her large hands.", "positive", ["She reaches out and takes them"]),
  t("tp05", "speech then participle", "Brenna looks at the offering. \"I can carry them for you,\" she says, accepting the bundle without comment on the hue.", "positive", ["accepting the bundle without comment on the hue"]),
];
/** Phase 1O additions after the real-DeepSeek run: elliptical lists and act-next-to-dialogue (positives), and their near-misses. */
export const EVIDENCE_CORPUS_EXTRA: readonly EvidenceCase[] = [
  { id: "tp06", input: OFFER, ground_garments: true, truth: "positive", category: "elliptical sequential list (fragment quotes)", narration: "Brenna glances at them. She took the pink cotton shirt, then the fluffy one, and finally the shorts, laying them across her lap.", quotes: ["She took the pink cotton shirt", "then the fluffy one", "and finally the shorts, laying them across her lap"] },
  { id: "tp07", input: "I give boots to Brenna.", truth: "positive", category: "narrated act next to dialogue", narration: "Brenna looks at the offered boots, then up at Nicco. \"I'll carry them,\" she says, reaching out to take them. She settles the boots beside her seat.", quotes: ["\"I'll carry them,\" she says, reaching out to take them."] },
  { id: "kn22", input: TELL, truth: "negative", category: "told but not heard (pronoun refusal)", narration: "Nicco tells Brenna that the eastern bridge is closed. She does not hear him." },
  { id: "kp08", input: TELL, truth: "positive", category: "telling followed by prior-ignorance narration", narration: "Nicco turns to Brenna and tells her that the eastern bridge is closed. Brenna meets his eyes. She had not heard this before.", quotes: ["Nicco turns to Brenna and tells her that the eastern bridge is closed."] },
  { id: "kp09", input: TELL, truth: "positive", category: "quoted /tell, action-beat attribution", narration: "Nicco leans toward Brenna. \"The eastern bridge is closed.\" Brenna frowns.", quotes: ["\"The eastern bridge is closed.\""] },
  { id: "kp10", input: TELL, truth: "positive", category: "quoted /tell, action-beat included in excerpt", narration: "Nicco leans toward Brenna. \"The eastern bridge is closed.\" Brenna frowns.", quotes: ["Nicco leans toward Brenna. \"The eastern bridge is closed.\""] },
  { id: "kn23", input: TELL, truth: "negative", category: "action beat addresses another NPC", narration: "Nicco looks at Maren. \"The eastern bridge is closed.\" Brenna is asleep." },
  { id: "kn24", input: TELL, truth: "negative", category: "intervening speaker beat", narration: "Nicco turns to Brenna. Maren sighs. \"The eastern bridge is closed.\"" },
  { id: "kn25", input: TELL, truth: "negative", category: "action-beat question", narration: "Nicco leans toward Brenna. \"Is the eastern bridge closed?\"" },
  { id: "tr18", input: OFFER, ground_garments: true, truth: "negative", category: "list continuation of a non-receipt verb", narration: "Brenna looks at the cotton shirt, then the fluffy one, and finally the shorts." },
  { id: "tr19", input: OFFER, ground_garments: true, truth: "negative", category: "receipt spoken only in dialogue", narration: "\"I took the cotton shirt, then the fluffy one, and finally the shorts,\" Brenna says, though her hands stay in her lap." },
];
