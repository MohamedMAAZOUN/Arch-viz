import { describe, expect, it } from "vitest";

import { isPublicHttpUrl } from "./safeUrl";

describe("isPublicHttpUrl", () => {
  it("allows public http(s) URLs", () => {
    expect(isPublicHttpUrl("https://example.com/health")).toBe(true);
    expect(isPublicHttpUrl("http://api.example.com:8080/status?x=1")).toBe(true);
    expect(isPublicHttpUrl("https://grafana.example.com/d/board")).toBe(true);
    expect(isPublicHttpUrl("https://8.8.8.8/")).toBe(true);
  });

  it("rejects non-http(s) protocols", () => {
    expect(isPublicHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isPublicHttpUrl("data:text/html,<script>1</script>")).toBe(false);
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isPublicHttpUrl("ftp://example.com/x")).toBe(false);
    expect(isPublicHttpUrl("not a url")).toBe(false);
  });

  it("rejects loopback and localhost", () => {
    expect(isPublicHttpUrl("http://localhost/x")).toBe(false);
    expect(isPublicHttpUrl("http://app.localhost/x")).toBe(false);
    expect(isPublicHttpUrl("http://127.0.0.1/x")).toBe(false);
    expect(isPublicHttpUrl("http://127.5.5.5/x")).toBe(false);
    expect(isPublicHttpUrl("http://[::1]/x")).toBe(false);
  });

  it("rejects private and link-local ranges", () => {
    expect(isPublicHttpUrl("http://10.0.0.5/x")).toBe(false);
    expect(isPublicHttpUrl("http://172.16.0.1/x")).toBe(false);
    expect(isPublicHttpUrl("http://172.31.255.255/x")).toBe(false);
    expect(isPublicHttpUrl("http://192.168.1.1/x")).toBe(false);
    expect(isPublicHttpUrl("http://169.254.0.1/x")).toBe(false);
  });

  it("rejects the cloud-metadata endpoint, including non-dotted encodings", () => {
    expect(isPublicHttpUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    // 2852039166 === 169.254.169.254
    expect(isPublicHttpUrl("http://2852039166/latest/meta-data/")).toBe(false);
    // 0x7f000001 === 127.0.0.1
    expect(isPublicHttpUrl("http://0x7f000001/")).toBe(false);
    // 2130706433 === 127.0.0.1
    expect(isPublicHttpUrl("http://2130706433/")).toBe(false);
  });

  it("rejects unique-local and link-local IPv6", () => {
    expect(isPublicHttpUrl("http://[fe80::1]/x")).toBe(false);
    expect(isPublicHttpUrl("http://[fd00::1]/x")).toBe(false);
    expect(isPublicHttpUrl("http://[::ffff:127.0.0.1]/x")).toBe(false);
  });

  it("allows public IPv6", () => {
    expect(isPublicHttpUrl("http://[2606:4700:4700::1111]/x")).toBe(true);
  });
});
