import { randomBytes } from "node:crypto";

/** Block 4 (REV-2): the request identity every /api/turn call carries — a fresh client key and the revision the "player" saw. */
export const nextTurnKey = (): string => `k${randomBytes(12).toString("hex")}`;
export const turnJson = (text: string, expected_revision: number, turn_key: string = nextTurnKey()): string => JSON.stringify({ text, turn_key, expected_revision });
export async function revisionOf(base: string): Promise<number> { return ((await (await fetch(`${base}/api/session`)).json()) as { revision: number }).revision; }
