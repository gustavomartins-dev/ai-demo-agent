import path from "node:path";

export class RangeNotSatisfiableError extends Error {}

export function resolveArtifactPath(outputRoot: string, storageKey: string): string {
  if (!storageKey || path.isAbsolute(storageKey)) throw new Error("Invalid artifact storage key");
  const root = path.resolve(outputRoot);
  const resolved = path.resolve(root, storageKey);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Artifact path escapes output root");
  return resolved;
}

export function parseByteRange(value: string | null, size: number): { start: number; end: number } | null {
  if (!value) return null;
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || size <= 0) throw new RangeNotSatisfiableError();
  const [, startValue, endValue] = match;
  if (!startValue && !endValue) throw new RangeNotSatisfiableError();
  let start: number;
  let end: number;
  if (!startValue) {
    const suffixLength = Number(endValue);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) throw new RangeNotSatisfiableError();
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(startValue);
    end = endValue ? Number(endValue) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    throw new RangeNotSatisfiableError();
  }
  return { start, end: Math.min(end, size - 1) };
}
