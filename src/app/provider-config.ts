import { DEFAULT_NARRATOR_MODEL } from "../llm/openrouter/minimax-narrator.js";
import { DEFAULT_CONTROLLER_MODEL } from "../llm/openrouter/state-controller.js";

/** Production provider settings, single source for both the application and the dev harnesses (which re-export them). */
export const NARRATOR_OUTPUT_TOKENS = 512;
export const selectedModels = () => ({ narrator: process.env.OPENROUTER_NARRATOR_MODEL ?? DEFAULT_NARRATOR_MODEL, controller: process.env.OPENROUTER_CONTROLLER_MODEL ?? DEFAULT_CONTROLLER_MODEL });
