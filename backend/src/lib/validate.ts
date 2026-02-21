export function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${field}`);
  }
  return value.trim();
}

export function optionalString(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return v.length ? v : undefined;
}

export function requireInt(value: unknown, field: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`Invalid ${field}`);
  return n;
}
