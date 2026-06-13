import { describe, expect, it } from "vitest";

import { isRequestOriginAllowed } from "./origin";

const allowedOrigins = ["http://localhost:5173"];

describe("isRequestOriginAllowed", () => {
  it("always allows safe methods regardless of origin", () => {
    expect(isRequestOriginAllowed({ method: "GET", allowedOrigins })).toBe(true);
    expect(
      isRequestOriginAllowed({ method: "HEAD", origin: "https://evil.example", allowedOrigins }),
    ).toBe(true);
  });

  it("allows a state-changing request from an allowed origin", () => {
    expect(
      isRequestOriginAllowed({ method: "POST", origin: "http://localhost:5173", allowedOrigins }),
    ).toBe(true);
  });

  it("rejects a cross-origin state-changing request", () => {
    expect(
      isRequestOriginAllowed({ method: "POST", origin: "https://evil.example", allowedOrigins }),
    ).toBe(false);
  });

  it("rejects an unsafe request with no Origin or Referer", () => {
    expect(isRequestOriginAllowed({ method: "POST", allowedOrigins })).toBe(false);
  });

  it("falls back to the Referer origin when Origin is absent", () => {
    expect(
      isRequestOriginAllowed({
        method: "POST",
        referer: "http://localhost:5173/some/path?q=1",
        allowedOrigins,
      }),
    ).toBe(true);
  });

  it("treats the opaque 'null' origin as no origin", () => {
    expect(isRequestOriginAllowed({ method: "POST", origin: "null", allowedOrigins })).toBe(false);
  });
});
