import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "./request-origin";

describe("same-origin guard with local Next canonicalization", () => {
  const local = "http://localhost:3400/api/plan";
  it.each([
    [local, "localhost:3400", "http://localhost:3400"],
    [local, "127.0.0.1:3400", "http://127.0.0.1:3400"],
    ["http://127.0.0.1:3400/api/plan", "localhost:3400", "http://localhost:3400"],
    ["https://recircuit.example/api/plan", "recircuit.example", "https://recircuit.example"],
    ["https://recircuit.example/api/plan", "recircuit.example:443", "https://recircuit.example"],
    ["http://localhost/api/plan", "127.0.0.1:80", "http://127.0.0.1"],
  ])("accepts the actual same-origin request %s Host %s", (url, host, origin) => {
    expect(() => assertSameOrigin(new Request(url, { headers: { host, origin } }))).not.toThrow();
  });
  it.each([
    [local, "127.0.0.1:3400", "http://localhost:3400"],
    [local, "localhost:3400", "http://127.0.0.1:3400"],
    [local, "127.0.0.1:3401", "http://127.0.0.1:3401"],
    [local, "127.0.0.1:3400", "https://127.0.0.1:3400"],
    [local, "unapproved.invalid:3400", "http://localhost:3400"],
    [local, "localhost:3400@unapproved.invalid", "http://localhost:3400"],
    [local, "localhost:99999", "http://localhost:3400"],
    ["https://recircuit.example/api/plan", "127.0.0.1", "https://127.0.0.1"],
  ])("refuses mismatched origin/host %s Host %s", (url, host, origin) => {
    expect(() => assertSameOrigin(new Request(url, { headers: { host, origin } }))).toThrow("ORIGIN_DENIED");
  });
  it("does not use forwarded host or protocol to grant access", () => {
    expect(() => assertSameOrigin(new Request(local, { headers: { host: "localhost:3400", origin: "https://unapproved.invalid", "x-forwarded-host": "unapproved.invalid", "x-forwarded-proto": "https" } }))).toThrow("ORIGIN_DENIED");
  });
  it("retains canonical checks when Host is absent and existing non-browser behavior", () => {
    expect(() => assertSameOrigin(new Request(local, { headers: { origin: "http://localhost:3400" } }))).not.toThrow();
    expect(() => assertSameOrigin(new Request(local, { headers: { origin: "http://unapproved.invalid" } }))).toThrow("ORIGIN_DENIED");
    expect(() => assertSameOrigin(new Request(local))).not.toThrow();
  });
});
