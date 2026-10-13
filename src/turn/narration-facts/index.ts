export type { Referent } from "./subjects.js";
export * from "./types.js";
export { extractNarrationFacts, dialogueOf, dialoguePeople, type NarrationFactScope } from "./extract.js";
export { createFactSource, type NarrationFactSource } from "./source.js";
export { stairDirection } from "./departure-forms.js";
export { DEPART_ACT, FOLLOWS_NICCO, STAIR_WORD } from "./movement-vocabulary.js";
export { ephemeralDepartureFacts } from "./departure-forms.js";
export { frameOf } from "./frame.js";
export { extractInputCommerceFacts } from "./extract.js";
// Identity / dialogue (Block 11)
export { type Person, dialogueUnits, presentPeople, leadingDescriptor, leadingPerson, speechTags } from "./dialogue-forms.js";
export { CAPTIVE, PERSON_NOUNS, SPEAKER_NOUNS, SUBJECT_NOUNS, SPEECH } from "./dialogue-vocabulary.js";
export { type IdentityForm, type NameIntroduction, identityForms } from "./identity-forms.js";
export { type LateNaming, type NarratedCaptive, type NarratedPerson, type NarrationUnit, type ReadOptions, type SceneReading, nameFilter, readScene, refersTo, sceneExchanges } from "./scene-identity.js";
export { type EstablishedPersonFacts, establishedFacts } from "./person-facts.js";
export { participatesInScene } from "./participation-forms.js";
