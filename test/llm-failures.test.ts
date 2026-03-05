import { describe, expect, it } from "vitest";

import { getLLMFailureResponse } from "../src/domain/planner/llm-failures";

describe("getLLMFailureResponse", () => {
  it("maps missing API key", () => {
    const failure = getLLMFailureResponse(new Error("ANTHROPIC_API_KEY is missing"));
    expect(failure.code).toBe("LLM_MISSING_API_KEY");
  });

  it("maps parse errors", () => {
    const failure = getLLMFailureResponse(new Error("json parse failed"));
    expect(failure.code).toBe("LLM_INVALID_OUTPUT");
  });
});
