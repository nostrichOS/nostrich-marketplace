import { describe, expect, it } from 'vitest'

import type { NostrEvent } from '../core/types'
import { mergeReviews } from './merge'
import { buildReview, parseReview, reviewScore, reviewsToShow, type SellerReview } from './reviews'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

const signed = (template: { kind: number; tags: string[][]; content: string; created_at: number }, pubkey = A): NostrEvent => ({ ...template, id: '0'.repeat(64), pubkey, sig: '0'.repeat(128) })

describe('reviews', () => {
  it('round-trips a review of a listing', () => {
    const review = parseReview(signed(buildReview({ listing: `30402:${B}:mug`, thumb: 1, delivery: 1, communication: 0.8, content: 'Good' }, { createdAt: 1 })))
    expect(review?.seller).toBe(B)
    expect(review?.listing).toBe(`30402:${B}:mug`)
    expect(review?.content).toBe('Good')
  })

  it('refuses a kind 31555 that is not a seller review', () => {
    expect(parseReview(signed({ kind: 31555, created_at: 1, content: '', tags: [['d', 'some-other-rating:42'], ['rating', '1', 'thumb']] }))).toBeNull()
  })

  it('scores half the thumb and half the mean of the other ratings', () => {
    expect(reviewScore({ thumb: 1 })).toBe(1)
    expect(reviewScore({ thumb: 1, delivery: 0.6, communication: 1 })).toBe(0.9)
    expect(reviewScore({ quality: 0.5 })).toBe(0.5)
    expect(reviewScore({})).toBeUndefined()
  })

  it('shows one review per reviewer, the newest, never the seller’s own', () => {
    const review = (reviewer: string, createdAt: number): SellerReview => ({ reviewer, seller: B, listing: `30402:${B}:x`, ratings: { thumb: 1 }, score: 1, content: '', createdAt })
    const shown = reviewsToShow([review(A, 1), review(A, 2), review(B, 3)], B)
    expect(shown.map(item => item.createdAt)).toEqual([2])
    expect(mergeReviews([review(A, 1)], [review(A, 2)]).map(item => item.createdAt)).toEqual([2])
  })
})
