import { MiniMaxNarratorProvider } from "../llm/openrouter/minimax-narrator.js";
import type { NarratorProvider } from "../llm/narrator-provider.js";
import type { GenerationRequest } from "../llm/types.js";

export const ALTERNATE_NARRATOR_MODELS = Object.freeze([
  { label: "MiMo-V2.6-Flash", id: "xiaomi/mimo-v2.6-flash" },
  { label: "Space Bunny Alpha", id: "stealth/space-bunny-alpha" },
  { label: "GPT-5.6 Sol", id: "openai/gpt-5.6-sol" },
  { label: "DeepSeek V4 Flash 0731", id: "deepseek/deepseek-v4-flash-0731" },
  { label: "Hy4 preview", id: "tencent/hy4-preview" },
  { label: "GLM 5.3 Flash", id: "z-ai/glm-5.3-flash" },
].map(model => Object.freeze(model)));

export interface Alternative { readonly model: string; readonly label: string; readonly text: string; readonly actual_model: string; readonly provider?: string }

/** Observe the provider input after all coordinator preparation, retaining the adapter's configured budget.
 * No transport or generation settings change; this wrapper is enabled only for the disposable UI. */
export function observePreparedNarrator(provider: NarratorProvider, capture: (request: GenerationRequest) => void, defaultOutputTokens: number): NarratorProvider {
  const observe = (request: GenerationRequest) => {
    try { capture({ system_prompt: request.system_prompt, messages: request.messages, max_output_tokens: request.max_output_tokens ?? defaultOutputTokens }); } catch {}
  };
  return {
    generate(request) { observe(request); return provider.generate(request); },
    stream(request) { observe(request); return provider.stream(request); },
  };
}

/** Disposable comparison storage. Has no campaign, controller, history or retrieval dependency. */
export class NarratorAlternatives {
  #pending: GenerationRequest | undefined;
  #requests = new Map<string, GenerationRequest>();
  #results = new Map<string, Map<string, Alternative>>();
  #busy = new Set<string>();
  constructor(private readonly provider: (model: string) => Pick<NarratorProvider, "generate"> = model => new MiniMaxNarratorProvider(undefined, { model, provider: null, disable_reasoning: true }), private readonly capacity = 200) {}

  readonly capture = (request: GenerationRequest): void => {
    this.#pending = Object.freeze({ system_prompt: request.system_prompt,
      messages: Object.freeze(request.messages.map(message => Object.freeze({ ...message }))),
      ...(request.max_output_tokens === undefined ? {} : { max_output_tokens: request.max_output_tokens }) });
  };
  begin(): void { this.#pending = undefined; }
  finalize(id: string): boolean {
    if (!this.#pending) return false;
    this.#requests.set(id, this.#pending); this.#pending = undefined;
    while (this.#requests.size > this.capacity) {
      const oldest = this.#requests.keys().next().value!;
      this.#requests.delete(oldest); this.#results.delete(oldest);
    }
    return true;
  }
  has(id: string): boolean { return this.#requests.has(id); }
  results(id: string): readonly Alternative[] { return [...(this.#results.get(id)?.values() ?? [])]; }
  async regenerate(id: string, model: string): Promise<{ ok: true; alternatives: readonly Alternative[] } | { ok: false; error: string }> {
    const choice = ALTERNATE_NARRATOR_MODELS.find(candidate => candidate.id === model);
    const request = this.#requests.get(id), key = `${id}\0${model}`;
    if (!choice || !request) return { ok: false, error: "Comparison unavailable for this message or model." };
    if (this.#busy.has(key)) return { ok: false, error: "This alternative is generating." };
    this.#busy.add(key);
    try {
      // Exactly one generation; no engine pipeline, retries, prompt rebuilding or persistence.
      const result = await this.provider(model).generate(request);
      if (!result.text.trim()) throw new Error("empty");
      if (!this.#requests.has(id)) return { ok: false, error: "Comparison request expired." };
      const alternatives = this.#results.get(id) ?? new Map<string, Alternative>();
      alternatives.set(model, { model, label: choice.label, text: result.text, actual_model: result.model, ...(result.provider ? { provider: result.provider } : {}) });
      this.#results.set(id, alternatives);
      return { ok: true, alternatives: this.results(id) };
    } catch { return { ok: false, error: "Alternative failed. Select the model again to retry." }; }
    finally { this.#busy.delete(key); }
  }
}
