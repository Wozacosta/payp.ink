import { encodePacked, keccak256 } from "viem";

export function getSlugHash(slug: string) {
  return keccak256(encodePacked(["string"], [slug]));
}
