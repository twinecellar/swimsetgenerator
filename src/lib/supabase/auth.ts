export function isAuthRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; code?: string };
  return candidate.status === 429 || candidate.code === "over_request_rate_limit";
}
