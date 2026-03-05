export function extractBearerToken(value: string | undefined): string | null {
  if (!value) return null;
  const [scheme, token] = value.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}
