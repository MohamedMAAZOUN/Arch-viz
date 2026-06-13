import { describe, expect, it } from "vitest";

import { createSessionService } from "./session";
import { createMemoryRepository } from "../db/repository";

import type { Clock } from "./clock";

const CONFIG = {
  idleTtlMs: 30 * 60_000, // 30 min
  absoluteTtlMs: 24 * 60 * 60_000, // 24h
  rotationIntervalMs: 10 * 60_000, // 10 min
};

/** A clock the test advances by hand. */
function fakeClock(start = new Date("2026-06-13T00:00:00Z")) {
  let now = start.getTime();
  const clock: Clock = () => new Date(now);
  return { clock, advance: (ms: number) => (now += ms) };
}

function setup(start?: Date) {
  const repo = createMemoryRepository();
  const time = fakeClock(start);
  const sessions = createSessionService({
    sessions: repo.sessions,
    config: CONFIG,
    clock: time.clock,
  });
  return { repo, sessions, advance: time.advance };
}

describe("session service", () => {
  it("creates a session that resolves to its user", async () => {
    const { sessions } = setup();
    const { token } = await sessions.create("user-1");
    const r = await sessions.resolve(token);
    expect(r).toEqual({ status: "active", userId: "user-1", rotatedToken: null });
  });

  it("rejects an unknown token", async () => {
    const { sessions } = setup();
    expect(await sessions.resolve("not-a-real-token")).toEqual({ status: "invalid" });
  });

  it("rejects after the idle lifetime elapses with no activity", async () => {
    const { sessions, advance } = setup();
    const { token } = await sessions.create("user-1");
    advance(CONFIG.idleTtlMs + 1);
    expect(await sessions.resolve(token)).toEqual({ status: "invalid" });
  });

  it("rejects after the absolute lifetime even with steady activity", async () => {
    const { sessions, advance } = setup();
    const { token } = await sessions.create("user-1");
    let current = token;
    // Stay active in 9-minute steps (under the 10-min rotation) past 24h.
    for (let elapsed = 0; elapsed < CONFIG.absoluteTtlMs; elapsed += 9 * 60_000) {
      advance(9 * 60_000);
      const r = await sessions.resolve(current);
      if (r.status === "invalid") break;
      if (r.rotatedToken) current = r.rotatedToken;
    }
    advance(CONFIG.absoluteTtlMs);
    expect(await sessions.resolve(current)).toEqual({ status: "invalid" });
  });

  it("rotates the token after the rotation interval and rejects the old one", async () => {
    const { sessions, advance } = setup();
    const { token } = await sessions.create("user-1");

    advance(CONFIG.rotationIntervalMs + 1);
    const rotated = await sessions.resolve(token);
    expect(rotated.status).toBe("active");
    if (rotated.status !== "active") return;
    expect(rotated.rotatedToken).toBeTruthy();
    expect(rotated.rotatedToken).not.toBe(token);

    // The rotated-out token is now rejected; the new token works.
    expect(await sessions.resolve(token)).toEqual({ status: "invalid" });
    const viaNew = await sessions.resolve(rotated.rotatedToken ?? "");
    expect(viaNew.status).toBe("active");
  });

  it("does not rotate before the interval", async () => {
    const { sessions, advance } = setup();
    const { token } = await sessions.create("user-1");
    advance(CONFIG.rotationIntervalMs - 1);
    const r = await sessions.resolve(token);
    expect(r).toEqual({ status: "active", userId: "user-1", rotatedToken: null });
  });

  it("revoke ends the session", async () => {
    const { sessions } = setup();
    const { token } = await sessions.create("user-1");
    await sessions.revoke(token);
    expect(await sessions.resolve(token)).toEqual({ status: "invalid" });
  });

  it("revokeAllForUser ends every session for that user", async () => {
    const { sessions } = setup();
    const a = await sessions.create("user-1");
    const b = await sessions.create("user-1");
    await sessions.revokeAllForUser("user-1");
    expect(await sessions.resolve(a.token)).toEqual({ status: "invalid" });
    expect(await sessions.resolve(b.token)).toEqual({ status: "invalid" });
  });
});
