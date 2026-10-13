/**
 * NarrationFacts / movement: the ONE lexicon of movement, follow, arrival and departure words in narrator prose.
 *
 * Block 9 moved every pattern here from the former `character-movement.ts` and `scene-departure.ts` readers (verbatim, so recognition is
 * unchanged). Nothing outside `narration-facts/` owns a movement regex for narration: consumers read facts, not text.
 */
export const CARRY = "(?:carries|carried|carrying|carry|lifts|lifted|hauls|hauled|bears|bore)";
export const WALK = "(?:follows|followed|walks|walked|goes|went|comes|came|heads|headed|returns|returned|limps|limped|runs|ran|hurries|hurried|steps|stepped|trails|trailed|shuffles|shuffled|staggers|staggered|slips|slipped)";
export const TO = "(into|inside|through|to|back to|up to|out to|out into|onto|in through)";
/** H5.1: a stairway leg before the destination ("follows him down the stairs into the hall", "goes downstairs to the hall"). */
export const STAIRS = "(?:(?:down|up)(?:\\s+the(?:\\s+[a-z]+)?\\s+(?:stairs|steps|staircase))?\\s+|downstairs\\s+|upstairs\\s+)?";
export const HELD = "(?:in his arms|on his back|over his shoulder|against his (?:chest|shoulder)|slung over his shoulder)";
export const FOLLOW_VERB = "(?:follows|followed|trails|trailed|falls into step|fell into step|comes after|came after|descends after|descended after|climbs after|climbed after|goes after|went after|walks after|walked after"
  // Debt closure D-12: live and ornate follow verbs that assert a completed physical following.
  + "|hurries after|hurried after|hastens after|hastened after|rushes after|rushed after|joins him|joined him|joins nicco|joined nicco|falls in (?:beside|behind) (?:him|nicco)|fell in (?:beside|behind) (?:him|nicco))";
export const STEP_NOUN = "(?:footsteps|steps|footfalls|tread|treads)";
export const STEP_VERB = "(?:follow|follows|followed|come after|comes after|came after|sound behind him|sounded behind him)";
// Follow-recognition closure: manner/time tails taken verbatim from live production drafts ("at her own pace", "a pace or two behind",
// "behind him on the stair", "a few moments after him"). Still manner only: no place, object or bare "later".
export const FOLLOW_TAIL = /^(?:\s*(?:him|nicco|after(?: him| nicco)?|behind(?: him| nicco| her)?|a (?:step|few steps|pace|moment) (?:behind|later|after)|close behind|closely|at a distance|in silence|without a word|quietly|silently|slowly|wordlessly|shortly after|soon after|downstairs|upstairs|(?:down|up)(?: the (?:stairs|steps|staircase))?|out|there|at (?:her|his|its|their) own pace|a pace or two behind|a few (?:paces|steps|strides) (?:behind|back)|(?:a few moments|moments) (?:later|after)|on the (?:stairs?|steps)|first|at a (?:short|respectful|safe) distance|(?:a (?:moment|few moments|beat) )?after he (?:does|did|arrives|arrived|reaches (?:the )?[a-z]+(?: [a-z]+)?))\b)*\s*$/i;
/**
 * Follow-recognition closure, DOWN-only forms (live production drafts): "Maren comes down the stairs a moment later", "Maren came down a
 * moment after", "Maren appears at the bottom step / of the stair". They name no follow verb, so they are accepted ONLY when Nicco's own
 * same-turn route is a proven pure descent (`routeDirection` === "DOWN"); then "down" and "the bottom of the stairs" can only mean his
 * arrival side. Same tail, gates and eligibility as every implicit follow.
 */
export const COME_DOWN = "(?:comes|came|goes|went)\\s+down(?:\\s+the\\s+(?:stairs?|steps|staircase))?";
export const APPEARS_BELOW = "(?:appears|appeared)\\s+at\\s+the\\s+(?:bottom|foot)\\s+(?:step|of\\s+the\\s+(?:stairs?|steps|staircase))";
/**
 * Debt closure D-12: a NAMED character's physical completed arrival at Nicco's same-turn arrival ("Gerome ducked through the doorframe and
 * stepped into the hall", "Maren comes down into the hall a few paces behind", "Gerome descends the stairs", "Heavy footfalls marked
 * Maren's descent"). Named subjects only; the destination must resolve to the arrival (never geography) or be a proven descent.
 */
export const ARRIVE_MANNER = "(?:(?:\\w+ly\\s+)|(?:(?:ducks?|ducked)\\s+(?:\\w+ly\\s+)?(?:through|under)\\s+the\\s+\\w+\\s+(?:and\\s+)?)|(?:(?:rounds?|rounded)\\s+the\\s+\\w+\\s+and\\s+))*";
export const ARRIVE_VERB = "(?:steps?|stepped|walks?|walked|comes?|came|enters?|entered|arrives?|arrived|emerges?|emerged|lumbers?|lumbered|stomps?|stomped|appears?|appeared)";
export const ARRIVE_TAIL = /(?:\s+(?:a (?:step|few steps|pace|pace or two|few paces|moment|few moments|beat) (?:behind|later|after)(?: him| nicco| he does| he did)?|(?:a few moments|moments) (?:later|after)|close behind|behind (?:him|nicco)|after (?:him|nicco)|first))+$/i;
export const ARRIVE_VETO = /\b(?:usually|always|often|sometimes|never|rarely|typically|habitually|every|each|once|yesterday|tomorrow|later today|last (?:night|week|time|year)|memory|memories|dream\w*|imagin\w+|pretend\w*|at (?:dawn|dusk|night|noon|midnight|first light))\b/i;
export const ARRIVE_STOPS = /\b(?:stops|stopped|halts|halted|turns? back|turned back|retreats?|retreated|stays?|stayed|waits?|waited|remains?|remained|lingers?|lingered)\b(?!\s+(?:at|near|by)\s+the\s+(?:bottom|foot|base)\b)/i;
/** Clause openers before the follower: time ("A moment later,") or Nicco-relative place ("Behind him,"; Pass 10: the one live follow draft opened so). */
export const LEAD_IN = "(?:(?:(?:a moment|moments|a beat|seconds) later|after a (?:moment|pause|beat)|shortly after(?:ward)?|soon|(?:close |a step |a pace )?behind (?:him|nicco)|close behind|after (?:him|nicco)),?\\s+)?";
/** What may NOT trail a dash after a follow: a self-correction or a stop ("follows him — no, she stays"). The richest shared veto (`disqualify`) is applied too. */
export const DASH_RETRACTS = /\b(?:stays?|stayed|waits?|waited|remains?|remained|lingers?|lingered|pauses?|paused|freezes?|froze|turns? back|turned back)\b/i;
export const DASH_PLACE = /\b(?:to|into|toward|towards|through|across|onto|inside|past|around|beside|near|along|over|under|by|at)\s+(?:the|a|an|her|his|their|its|nicco|[A-Z])/;
export const TRACE_SUBJECT = /^(?:(?:'s|\u2019s)\s+|(?:his|her)\s+)(?:retreating back|footsteps?|figure)\b/i;
export const TRACE_ACT = /\b(?:disappear(?:s|ed)?|vanish(?:es|ed)?|fade(?:s|d)?)\s+(?:away|through|down|around|out)\b/i;
export const MOVE = "(?:walk|stalk|storm|stomp|stagger|stumbl|stride|strode|shoulder|push|shov|slip|head|go|goes|went|step|lurch|weav|wove|limp|shambl|trudg|march|sway|swagger|ambl|saunter|hurri|hurry)\\w*";
export const PLACE = "(?:inn|room|tavern|common room|building|place|bar|premises|house|hall|taproom|door|doorway|front door)";
export const LEAVE_TAIL = `(?=\\s+(?:the\\s+)?(?:inn|room|tavern|common room|building|place|bar|premises|house|hall|taproom)\\b|\\s*(?:[.,;!—–-]|$)|\\s+(?:without|with|and|then|into|through|for good|at last|quietly|at once|for the (?:night|evening)))`;
/** Completed exits. The actor phrase precedes the match and is resolved by the caller. */
/**
 * Block 11 (KPG-2, live-observed): "unlatches the gate just enough to step halfway in ... then steps back out and latches it again". Stepping
 * into a pen, cage, stall or gate and BACK OUT is a local back-and-forth inside the scene, never leaving it.
 */
export const LOCAL_ENTRY = /\b(?:steps?|stepped|stepping|ducks?|ducked|leans?|leaned|climbs?|climbed)\s+(?:(?:halfway|partway|half|just|briefly)\s+)?(?:in(?:side)?\b(?!\s*to\b)|into the (?:pen|cage|stall|cell|enclosure|lean-to|tent|booth|wagon|cart|doorway|gate)\b)|\bopens? the (?:pen|cage|gate|cell)\b[^.!?]{0,40}\bin\b/i;
export const BACK_OUT = /\bback\s+out\b/i;
export const DEPART_ACT = new RegExp([
  `\\b${MOVE}\\s+(?:(?:his|her|their) way\\s+)?(?:[\\w']+\\s+){0,2}?(?:out(?:side)?\\b(?!\\s+(?:a|an|his|her|their|some|coins?|of|from)\\b)|out of the ${PLACE}\\b|through the (?:door|doorway)\\s+(?:and\\s+)?(?:into|out)\\b|into the (?:street|night|dark|darkness|rain|evening|cold|lane|alley)\\b|off into the\\b)`,
  // H5.1: leaving by the stairs is a completed exit from the room ("heads downstairs", "goes down the stairs").
  `\\b${MOVE}\\s+(?:(?:his|her|their) way\\s+)?(?:back\\s+)?(?:downstairs|upstairs|down the stairs|up the stairs)\\b`,
  `\\b(?:makes?|made)\\s+(?:his|her|their) way out\\b`,
  `\\b(?:takes?|took) (?:his|her|their) leave\\b`,
  `\\b(?:leaves|left|departs|departed|exits|exited)\\b${LEAVE_TAIL}`,
  `(?:\\b(?:is|was|had been)\\s+|'s\\s+)(?:long\\s+)?gone\\b(?=\\s*(?:[.,;!—–-]|$)|\\s+(?:from|now|already|for good))`,
  `\\b(?:disappears?|disappeared|vanish(?:es|ed)?)\\s+(?:into|through|out)\\b`,
  // Final movement closure (live-observed): leaving by a door without naming where it leads ("stepping through and pulling it shut behind her").
  `\\b(?:steps?|stepped|stepping|goes|went|passes|passed|slips?|slipped|walks?|walked)\\s+(?:out\\s+)?through\\s+(?:it|the (?:door|doorway))\\b(?!\\s+(?:and\\s+)?(?:then\\s+)?(?:back|stops?|stopped|pauses?|paused|returns?|returned)\\b)`,
  `\\b(?:passes|passed|steps|stepped|goes|went)\\s+through\\s+into\\s+the\\s+(?:open air|courtyard|yard|night|street|cold|garden)\\b`,
  `\\b(?:steps?|stepped|stepping|slips?|slipped|slipping)\\s+through(?=\\s*,?\\s*(?:and\\s+)?(?:letting|lets?|leaving|closing|pulling|pulled)\\b)`,
  `\\b(?:pulls?|pulled|pulling|draws?|drew|closes|closed|shuts?)\\s+(?:it|the door)\\s+(?:shut|closed)?\\s*behind (?:her|him)\\b`,
].join("|"), "i");
/**
 * Debt closure D-07 (audit only): a completed descent by the stairs with no destination ("crossed to the stairs and descended", "started down
 * the stairs", "her footsteps receding down", "as she descended"). Used only when Nicco did not change place this turn, so a follower arriving
 * after him is never read as a departure.
 */
export const STAIRS_N = "(?:stairs?|staircase|stairwell|steps|stairhead|landing)";
export const STAIR_EXIT = new RegExp([
  `\\b(?:crosse[sd]?|goe?s|went|heads?|headed|walks?|walked|moves?|moved)\\s+(?:(?:the|across the)\\s+(?:[a-z]+\\s+)?(?:room|floor|hall)\\s+)?(?:to|toward|towards)\\s+the\\s+${STAIRS_N}(?:\\s+without\\s+(?:\\w+\\s+){0,2}\\w+)?,?\\s+and\\s+(?:descend\\w*|ascend\\w*|climb\\w*|starts? down|started down|goes? down|went down|heads? down|headed down)\\b`,
  `\\b(?:descends|descended|descending|ascends|ascended|ascending|climbs|climbed|climbing)\\s+(?:the\\s+(?:[a-z]+\\s+)?${STAIRS_N}|out of (?:sight|view)|into the (?:main )?hall)\\b`,
  `\\b(?:starts|started)\\s+(?:up|down)\\s+(?:the\\s+)?${STAIRS_N}\\b`,
  `\\b(?:starts|started)\\s+(?:up|down)\\b(?!\\s+(?:from|with|at|on|in|a|an|the)\\b)`,
  `\\b(?:footsteps?|steps?|tread)\\s+(?:descend(?:s|ed|ing)?\\b|ascend(?:s|ed|ing)?\\b|(?:reced(?:e|es|ed|ing)|fad(?:e|es|ed|ing)|retreat(?:s|ed|ing)?)\\s+(?:down(?:ward)?|up(?:ward)?|overhead|as (?:she|he|they) (?:descend|ascend|climb)\\w*))`,
  `\\bas (?:she|he) (?:descend|ascend|climb)(?:s|ed)\\b`,
  `\\b(?:footsteps?|steps?|tread)\\s+(?:were|was|are|is)\\s+(?:\\w+\\s+){0,2}?on the ${STAIRS_N}\\s+(?:down|up)\\b`,
  `\\b(?:footsteps?|steps?|tread)\\s+(?:were|was|are|is)\\s+(?:\\w+\\s+){0,2}?(?:going|heading|moving)\\s+(?:down|up)\\s+the\\s+(?:[a-z]+\\s+)?${STAIRS_N}\\b`,
  `\\bdisappear\\w*\\s+(?:around|up|down|beyond)\\s+(?:the\\s+\\w+\\s+of\\s+)?the\\s+(?:[a-z]+\\s+)?${STAIRS_N}(?:\\s+(?:above|below))?\\b`,
  `\\breach(?:es|ed)\\s+the\\s+(?:landing|top|bottom)\\s+(?:above|below)\\b`,
  `(?<=\\b(?:she|he)\\s)(?:went|goes)\\s+(?:up|down)\\b(?=\\s+(?:without|and|then)\\b|\\s*[.,;!])`,
  `\\bpassage\\s+(?:up|down)\\s+the\\s+${STAIRS_N}\\b`,
  `(?<=\\b(?:she|he)\\s)(?:climbs|climbed|ascends|ascended|descends|descended)\\s*,\\s*(?:her|his)\\s+(?:footsteps?|steps?)\\b`,
].join("|"), "i");
/**
 * Audit-only backstop (live batches 9 to 11): a sound or gesture that says someone went up or down by the stairs or out through a door, in any
 * wording ("her footsteps faded into the murmur of the hall below", "went down the stairs", "climbing them out of view", "the door opened and
 * closed"). It never produces a movement: an exit it detects that no committed move or leave_scene explains is withdrawn like any other.
 */
export const BROAD_EXIT = new RegExp([
  `\\b(?:footsteps?|steps|tread)\\b[^.]{0,100}?\\b(?:fad\\w+|reced\\w+|trail\\w*|died|dies|echo\\w*|diminish\\w*)\\b`,
  `\\b(?:went|goes|climbs?|climbed|climbing|descends?|descended|descending|ascends?|ascended|ascending)\\s+(?:down|up)\\s+the\\s+(?:[a-z]+\\s+)?${STAIRS_N}\\b`,
  `\\b(?:climbs?|climbed|climbing|descends?|descended|descending)\\s+(?:them|it)\\s+(?:out of|into)\\b`,
  `\\bopened and closed\\b|\\bopens and closes\\b`,
].join("|"), "i");
/** The door closing behind a person: the pronoun resolves to the nearest named subject. */
export const DOOR_BEHIND = /\bdoor\b[^.!?]{0,110}\b(?:shut|closed|closes|closing|shuts|bang\w*|slam\w*|swung|swings|thud\w*)\b[^.!?]{0,20}\bbehind (?:him|her)\b|\blatch\s+click\w*\s+behind (?:him|her)\b|\b(?:swung|swings|fell|falls|fall|click\w*)\s+(?:shut|closed)\s+behind (?:him|her)\b/i;

/** A conjoined "followed him" form: an exit that depends on the player's own departure. */
export const FOLLOWS_NICCO = /\b(?:follow(?:s|ed)?|trail(?:s|ed)?)\s+(?:him|nicco|after)\b|\b(?:comes?|came|goes?|went)\s+after\s+(?:him|nicco)\b|\b(?:falls?|fell)\s+into\s+step\b/i;
/** A sentence that names the stairs by word (down/up stairs, down the stairs). */
export const STAIR_WORD = /\b(?:down|up)stairs\b|\b(?:down|up)\s+the\s+(?:[a-z]+\s+)?(?:stairs|steps|staircase)\b/i;
/** The player's own narrated movement (audit): "Nicco goes to X", "Nicco reaches X", "Nicco leaves X". */
export const NICCO_GO = /\bNicco\s+(?:\w+ly\s+)?(?:descends|descended|climbs|climbed|goes|went|walks|walked|heads|headed|steps|stepped|returns|returned|hurries|hurried|makes his way|made his way|comes|came|moves|moved|crosses|crossed|wanders|wandered|strides|strode)\b[^.;]*?\b(?:to|into|onto)\s+([^.;,]+)/i;
export const NICCO_ARRIVE = /\bNicco\s+(?:\w+ly\s+)?(?:reaches|reached|enters|entered|arrives (?:at|in)|arrived (?:at|in))\s+([^.;,]+)/i;
export const NICCO_LEAVE = /\bNicco\s+(?:\w+ly\s+)?(?:leaves|left|exits|exited)\s+([^.;,]+)/i;
export const PLACE_END = /\s+(?:with|while|as|and|where|before|after|still|alone|together|behind|below|above|without)\b.*$/i;
export const ARRIVAL = /\b(?:reach(?:es|ed)(?!\s+(?:for|out|toward|towards|across|over|up|down|into|back|behind|past)\b)|arriv(?:es|ed)|enters?|entered|steps? (?:into|onto|down into)|stepped (?:into|onto|down into)|catch(?:es)? up|caught up|joins? him|joined him)\b/i;

/** A temporary (unnamed) participant walking off or leaving: looser than DEPART_ACT because it reads a role noun or pronoun, never a named person. */
export const EPHEMERAL_EXIT = /\b(?:hurr(?:y|ies|ied)|walk(?:s|ed)?|mov(?:es|ed)|continu(?:es|ed)|go(?:es)?|went|head(?:s|ed)|slip(?:s|ped)?|strides?|strode|steps?|stepped|turn(?:s|ed)?)\b[^.!?]{0,50}?\b(?:away|off|past|onward|on (?:her|his|their) (?:way|path)|down the|into the crowd|out of sight|around the corner|gone)\b|\b(?:leaves|left|departs|departed|disappears|disappeared|vanishes|vanished|is gone)\b/i;
