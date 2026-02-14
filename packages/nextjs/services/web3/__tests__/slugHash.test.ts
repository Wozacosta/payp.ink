import { encodePacked, keccak256 } from "viem";
import { describe, expect, it } from "vitest";
import { getSlugHash } from "~~/services/web3/slugHash";

describe("getSlugHash", () => {
  it("returns keccak256 of encodePacked string", () => {
    const slug = "hello-world";
    const expected = keccak256(encodePacked(["string"], [slug]));
    expect(getSlugHash(slug)).toBe(expected);
  });

  it("returns different hashes for different slugs", () => {
    expect(getSlugHash("article-one")).not.toBe(getSlugHash("article-two"));
  });

  it("returns a 0x-prefixed 66-character hex string", () => {
    const hash = getSlugHash("test-slug");
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(getSlugHash("same-slug")).toBe(getSlugHash("same-slug"));
  });
});
