import { play } from "./pass10-support.js";
const input = process.argv[2] ?? "I go down to the main hall. Maren, come with me.";
const r = await play("Nicco goes down the stairs into the main hall.", input);
console.log(r.system.length, "system chars;", r.prompt.length, "user chars");
console.log(r.prompt);
