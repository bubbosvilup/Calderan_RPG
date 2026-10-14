import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { turnFixture } from "../../src/dev/support/turn-fixture.js";
import { GameSession } from "../../src/app/game-session.js";
import type { CampaignListEntry } from "../../src/app/session-host.js";
import type { AppError } from "../../src/app/app-errors.js";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { createPlaytestServer } from "../../src/ui/server.js";
import type { AppErrorDto, CampaignListEntryDto, ConfirmationViewDto, PlayerCharacterDto, PlayViewDto, ProvisionalPeopleDto, SessionStatus, TradeViewDto } from "../../src/ui-client/api/types.js";

/**
 * The React client declares its own DTOs (src/ui-client/api/types.ts) instead of importing server modules. This pins them to the server:
 *  - compile time: every server read model must stay assignable to the client DTO that reads it (a rename or a type change fails the build);
 *  - run time: the HTTP session payload carries every field the client reads, with the expected JSON types.
 */
const assignable = <T>(_value: T) => undefined;

test("React client DTOs: the server read models are assignable to them (compile-time contract)", async t => {
  const { world, campaign } = turnFixture();
  const root = await mkdtemp(join(tmpdir(), "caldrevan-react-contract-")); t.after(() => rm(root, { recursive: true, force: true }));
  const session = GameSession.fromCampaign({ world, repository: new FileCampaignRepository(world, root), createCoordinator: () => ({ async *runTurn() {} }) }, campaign);
  assignable<PlayViewDto>(session.getPlayUiView());
  assignable<TradeViewDto>(session.getTradeView());
  assignable<ConfirmationViewDto>(session.getConfirmationView());
  assignable<ProvisionalPeopleDto>(session.getProvisionalPeopleView());
  assignable<PlayerCharacterDto | null>(session.getPlayerProfileView());
  assignable<SessionStatus>(session.status);
  assignable<AppErrorDto>({} as AppError);
  assignable<CampaignListEntryDto>({} as CampaignListEntry);

  const server = createPlaytestServer(session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("missing port");
  const state = await (await fetch(`http://127.0.0.1:${address.port}/api/session`)).json() as Record<string, any>;

  // The fields the client reads, with their JSON types (run-time contract of the ad-hoc HTTP state object).
  assert.ok(Array.isArray(state.messages) && state.messages.every((m: any) => typeof m.role === "string" && typeof m.text === "string" && typeof m.seq === "number"));
  assert.equal(typeof state.status, "string"); assert.equal(typeof state.configured, "boolean"); assert.equal(typeof state.revision, "number");
  assert.equal(typeof state.scene.location, "string"); assert.equal(typeof state.scene.time_of_day, "string"); assert.equal(typeof state.scene.date_text, "string");
  assert.ok(Array.isArray(state.play.participants) && Array.isArray(state.play.household) && typeof state.play.household_title === "string");
  assert.ok(state.play.gold === null || typeof state.play.gold === "number");
  assert.equal(state.play.participants[0].ref, "player"); assert.equal(state.play.participants[0].card, null);
  for (const key of ["offer", "notice", "receipt"]) assert.ok(key in state.trade, `trade.${key}`);
  assert.ok(Array.isArray(state.confirmations.cards) && Array.isArray(state.confirmations.recent) && Array.isArray(state.provisional.people));
  assert.ok(state.player_character === null || (typeof state.player_character.name === "string" && "visual" in state.player_character));
  assert.equal("campaign" in state, false, "the disposable playtest payload carries no campaign key (the client's mode switch)");
});
