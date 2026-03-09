export interface LLMFailure {
  error: string;
  code: string;
}

export function getLLMFailureResponse(error: unknown): LLMFailure {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  const name = error instanceof Error ? error.name : "";

  if (name === "ValidationIssue") {
    return {
      error: "Planner returned an invalid plan payload.",
      code: "LLM_INVALID_OUTPUT",
    };
  }

  if (lower.includes("anthropic_api_key is missing")) {
    return {
      error: "Planner configuration error: ANTHROPIC_API_KEY is missing.",
      code: "LLM_MISSING_API_KEY",
    };
  }

  if (lower.includes("connection error") || lower.includes("econnrefused")) {
    return {
      error: "Planner could not reach Anthropic. Check network and API availability.",
      code: "LLM_CONNECTION_ERROR",
    };
  }

  if (lower.includes("json parse failed") || lower.includes("schema validation failed")) {
    return {
      error: "Planner returned an invalid plan payload.",
      code: "LLM_INVALID_OUTPUT",
    };
  }

  return {
    error: "Failed to generate plan.",
    code: "LLM_GENERATION_FAILED",
  };
}
