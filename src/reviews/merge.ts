import type { SellerReview } from './reviews'

/** Held reviews plus new ones, newest per (reviewer, listing). */
export function mergeReviews(held: readonly SellerReview[], fresh: readonly SellerReview[]): SellerReview[] {
  const byKey = new Map<string, SellerReview>()
  for (const review of [...held, ...fresh]) {
    const key = `${review.reviewer}|${review.listing}`
    const current = byKey.get(key)
    if (current === undefined || review.createdAt > current.createdAt) byKey.set(key, review)
  }
  return [...byKey.values()]
}
