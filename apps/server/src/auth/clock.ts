// A clock seam so session expiry/rotation logic is deterministic in tests.
// Production uses `systemClock`; tests inject a controllable one.

export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
