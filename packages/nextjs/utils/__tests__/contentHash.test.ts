import { keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";
import { computeContentHash, verifyContentIntegrity } from "~~/utils/contentHash";

describe("computeContentHash", () => {
  it("returns keccak256 of the body as hex", () => {
    const body = "Hello, world!";
    const expected = keccak256(toHex(body));
    expect(computeContentHash(body)).toBe(expected);
  });

  it("returns a 0x-prefixed 66-character hex string", () => {
    const hash = computeContentHash("test body");
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("produces different hashes for different bodies", () => {
    expect(computeContentHash("body a")).not.toBe(computeContentHash("body b"));
  });
});

describe("verifyContentIntegrity", () => {
  it("returns true when body matches the on-chain hash", () => {
    const body = "# My Article\n\nSome content here.";
    const hash = computeContentHash(body);
    expect(verifyContentIntegrity(body, hash)).toBe(true);
  });

  it("returns false when body does not match the on-chain hash", () => {
    const body = "original content";
    const wrongHash = computeContentHash("tampered content");
    expect(verifyContentIntegrity(body, wrongHash)).toBe(false);
  });

  it("returns false for an empty body against a non-empty hash", () => {
    const hash = computeContentHash("non-empty");
    expect(verifyContentIntegrity("", hash)).toBe(false);
  });
});
