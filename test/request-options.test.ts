import { describe, expect, it } from "vitest";

import { findInvalidRequestedTags, isDurationMinutes, normalizeRequestedTags } from "../src/domain/contracts/request-options";

describe("request-options", () => {
  it("normalizes and filters requested tags", () => {
    expect(normalizeRequestedTags([" SPEED ", "speed", "invalid", "fins"]))
      .toEqual(["speed", "fins"]);
  });

  it("finds invalid requested tags", () => {
    expect(findInvalidRequestedTags(["speed", "bad_tag", "BAD_TAG", "fins"]))
      .toEqual(["bad_tag"]);
  });

  it("validates allowed durations", () => {
    expect(isDurationMinutes(30)).toBe(true);
    expect(isDurationMinutes(33)).toBe(false);
  });
});
