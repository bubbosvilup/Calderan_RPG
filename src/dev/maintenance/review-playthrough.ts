import { readFile } from "node:fs/promises";
const corpus = JSON.parse(await readFile("tests/playthrough/curated.json", "utf8"));
for (const fixture of corpus.fixtures) console.log(JSON.stringify(fixture));
