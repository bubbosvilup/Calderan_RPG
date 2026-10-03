import { COMPRESSOR_SYSTEM, type ContextCompressorProvider, type CompressionRequest, type CompressionCandidate, type CompressionResponse } from "../src/llm/context-compressor-provider.js";
import { COMPRESSION_SCHEMA_VERSION } from "../src/turn/narrator-pack.js";
export function exactCandidate(request: CompressionRequest): CompressionCandidate {
 return { version: COMPRESSION_SCHEMA_VERSION, source_hash: request.source_hash, context_identity: request.context_identity,
  units: request.source_pack.units.map(u => ({ ...structuredClone(u), text: u.text.replace(/\bthe\b\s*/g, "").replace(/\s+/g, " ").trim() || u.text })) };
}
/** Test-only deterministic provider. Scripted responses can corrupt individual fields or hold a request. */
export class FakeContextCompressor implements ContextCompressorProvider {
 readonly model_id = "offline-d04-compressor"; readonly calls: CompressionRequest[] = [];
 readonly system = COMPRESSOR_SYSTEM;
 constructor(readonly script: (request: CompressionRequest, call: number) => Promise<CompressionResponse> | CompressionResponse = r => ({ candidate: exactCandidate(r) })) {}
 async compress(request: CompressionRequest): Promise<CompressionResponse> { const { signal: _signal, ...copy } = request; this.calls.push(structuredClone(copy)); return this.script(request, this.calls.length); }
}
