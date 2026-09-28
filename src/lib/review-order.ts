/* Review queue ordering. Capture scores each candidate from 0.3 to 0.95 by
   how strongly it reads as a durable, self-contained fact, so the queue can
   put the likeliest keepers first instead of showing every capture as
   equally plausible. Pure so it can be tested without React. */

type Reviewable = { confidence: number; $createdAt: string };

export type ConfidenceBand = "high" | "medium" | "low";

export const HIGH_CONFIDENCE = 0.75;
export const MEDIUM_CONFIDENCE = 0.55;

function confidenceOf(item: Reviewable): number {
  return Number.isFinite(item.confidence) ? item.confidence : 0;
}

function createdAtOf(item: Reviewable): number {
  const time = Date.parse(item.$createdAt);
  return Number.isFinite(time) ? time : 0;
}

/** Highest confidence first; newest first within the same confidence. */
export function byReviewPriority<T extends Reviewable>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => confidenceOf(b) - confidenceOf(a) || createdAtOf(b) - createdAtOf(a),
  );
}

export function confidenceBand(confidence: number): ConfidenceBand {
  if (!Number.isFinite(confidence)) return "low";
  if (confidence >= HIGH_CONFIDENCE) return "high";
  if (confidence >= MEDIUM_CONFIDENCE) return "medium";
  return "low";
}

/** "82%", clamped to 0–100 so a malformed value cannot render oddly. */
export function confidencePercent(confidence: number): string {
  const value = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  return `${Math.round(value * 100)}%`;
}
