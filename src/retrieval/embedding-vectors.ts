import { EmbeddingError, type EmbeddingVector } from "./embedding-provider.js";
import { dataArray } from "./validation.js";

/** Copies dense plain numeric arrays; scaled normalization avoids overflow/underflow. */
export function normalizeVector(input: unknown, dimension: number): EmbeddingVector {
  try {
    if (!Number.isSafeInteger(dimension) || dimension < 1 || dimension > 16384) throw new Error();
    const values = dataArray(input, "vector", dimension);
    if (values.length !== dimension || Object.getPrototypeOf(input) !== Array.prototype) throw new Error();
    const numbers = values.map(value => { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(); return value; });
    const scale = numbers.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    if (scale === 0) throw new Error();
    const scaled = numbers.map(value => value / scale);
    const norm = Math.sqrt(scaled.reduce((sum, value) => sum + value * value, 0));
    return Object.freeze(scaled.map(value => value / norm));
  } catch { throw new EmbeddingError("invalid_vector"); }
}
export function normalizeBatch(input: unknown, count: number, dimension: number): readonly EmbeddingVector[] {
  let values: readonly unknown[];
  try {
    values = dataArray(input, "batch", count);
    if (values.length !== count || Object.getPrototypeOf(input) !== Array.prototype) throw new Error();
  } catch { throw new EmbeddingError("invalid_batch"); }
  return Object.freeze(values.map(value => normalizeVector(value, dimension)));
}
/** Internal: only equal-dimension validated unit vectors reach this function. */
export function cosine(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length) throw new EmbeddingError("invalid_vector");
  return Math.max(-1, Math.min(1, a.reduce((sum, value, i) => sum + value * b[i]!, 0)));
}
