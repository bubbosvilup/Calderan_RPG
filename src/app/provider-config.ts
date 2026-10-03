import { DEFAULT_NARRATOR_MODEL } from "../llm/openrouter/minimax-narrator.js";
import { DEFAULT_CONTROLLER_MODEL } from "../llm/openrouter/state-controller.js";
import { DEFAULT_MANNERISM_EXTRACTOR_MODEL } from "../llm/openrouter/mannerism-extractor.js";

/** Production provider settings, single source for both the application and the dev harnesses (which re-export them). */
export const NARRATOR_OUTPUT_TOKENS = 512;
export const selectedModels = () => ({ narrator: process.env.OPENROUTER_NARRATOR_MODEL ?? DEFAULT_NARRATOR_MODEL, controller: process.env.OPENROUTER_CONTROLLER_MODEL ?? DEFAULT_CONTROLLER_MODEL });
/** Observation extraction is independently configured; never inherits the controller setting. */
export const mannerismExtractorModel = (env: Readonly<Record<string, string | undefined>> = process.env) => env.MANNERISM_EXTRACTOR_MODEL?.trim() || DEFAULT_MANNERISM_EXTRACTOR_MODEL;

/** Independent, unset by default; Pass 1 never invokes a compressor model. */
export const contextCompressorModel = () => process.env.CONTEXT_COMPRESSOR_MODEL?.trim() || undefined;
