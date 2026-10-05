import test from "node:test";
import assert from "node:assert/strict";
import { createProductionDeps, readReflectionMode } from "../src/app/production.js";
import { OpenRouterReflectionProvider } from "../src/llm/openrouter/reflection-provider.js";

test("D-09 defaults off and accepts only explicit shadow observation", () => {
  assert.equal(readReflectionMode({}), "off");
  assert.equal(readReflectionMode({ CALDREVAN_REFLECTION_MODE: " " }), "off");
  assert.equal(readReflectionMode({ CALDREVAN_REFLECTION_MODE: "off" }), "off");
  assert.equal(readReflectionMode({ CALDREVAN_REFLECTION_MODE: " shadow " }), "shadow");
  assert.throws(() => readReflectionMode({ CALDREVAN_REFLECTION_MODE: "on" }), /off or shadow/);
});

test("production creates reflection maintenance only in shadow mode without network requests", async () => {
  const original = process.env.CALDREVAN_REFLECTION_MODE;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("unexpected network request"); };
  try {
    delete process.env.CALDREVAN_REFLECTION_MODE;
    assert.equal((await createProductionDeps()).reflection_provider, undefined);
    process.env.CALDREVAN_REFLECTION_MODE = "shadow";
    assert.ok((await createProductionDeps()).reflection_provider instanceof OpenRouterReflectionProvider);
    assert.equal((await createProductionDeps({ reflection_mode: "off" })).reflection_provider, undefined);
    process.env.CALDREVAN_REFLECTION_MODE = "off";
    assert.ok((await createProductionDeps({ reflection_mode: "shadow" })).reflection_provider instanceof OpenRouterReflectionProvider);
  } finally {
    globalThis.fetch = originalFetch;
    if (original === undefined) delete process.env.CALDREVAN_REFLECTION_MODE;
    else process.env.CALDREVAN_REFLECTION_MODE = original;
  }
});
