/** Seller reviews (kind 31555): read, scored and written. */

import { getTagValue } from '../core/events'
import type { EventTemplate, Hex, NostrEvent } from '../core/types'

export const REVIEW_KIND = 31555

const REVIEW_D = /^a:30402:([0-9a-f]{64})(?::(.+))?$/u

export interface SellerReview {
  reviewer: Hex
  seller: Hex
  /** `30402:<seller>:<d>`; the bare seller address for a review of the whole shop. */
  listing: string
  ratings: Record<string, number>
  /** 0..1, or undefined when the review carries no usable rating. */
  score?: number
  content: string
  createdAt: number
}

/** Reads a kind 31555 review of a listing or a shop, or null when it is not one. */
export function parseReview(event: NostrEvent): SellerReview | null {
  if (event.kind !== REVIEW_KIND) return null
  const d = getTagValue(event, 'd')?.trim() ?? ''
  const match = REVIEW_D.exec(d)
  if (match === null) return null
  const seller = match[1] as Hex
  const ratings: Record<string, number> = {}
  for (const tag of event.tags) {
    if (tag[0] !== 'rating' || tag[1] === undefined || tag[2] === undefined) continue
    const value = Number(tag[1])
    const name = tag[2].trim().toLowerCase()
    if (!Number.isFinite(value) || name === '') continue
    ratings[name] = Math.min(1, Math.max(0, value))
  }
  const review: SellerReview = {
    reviewer: event.pubkey,
    seller,
    listing: match[2] === undefined ? `30402:${seller}` : `30402:${seller}:${match[2]}`,
    ratings,
    content: event.content,
    createdAt: event.created_at,
  }
  const score = reviewScore(ratings)
  if (score !== undefined) review.score = score
  return review
}

/** One score from 0 to 1: half the thumb, half the mean of the other ratings. */
export function reviewScore(ratings: Readonly<Record<string, number>>): number | undefined {
  const entries = Object.entries(ratings).filter(([, value]) => Number.isFinite(value))
  if (entries.length === 0) return undefined
  const thumb = ratings.thumb
  const others = entries.filter(([name]) => name !== 'thumb').map(([, value]) => value)
  if (thumb !== undefined) {
    const rest = others.length > 0 ? others.reduce((sum, value) => sum + value, 0) / others.length : thumb
    return thumb * 0.5 + rest * 0.5
  }
  return others.reduce((sum, value) => sum + value, 0) / others.length
}

export interface ReviewInput {
  /** `30402:<seller>:<d>`. */
  listing: string
  /** Did it go well: 1 yes, 0 no. */
  thumb: number
  /** 0..1 each; omitted categories are not written. */
  delivery?: number
  quality?: number
  communication?: number
  content?: string
}

/** Writes a kind 31555 review. */
export function buildReview(input: ReviewInput, options: { createdAt?: number } = {}): EventTemplate {
  const tags: string[][] = [['d', `a:${input.listing}`], ['rating', String(clamp(input.thumb)), 'thumb']]
  if (input.delivery !== undefined) tags.push(['rating', String(clamp(input.delivery)), 'delivery'])
  if (input.quality !== undefined) tags.push(['rating', String(clamp(input.quality)), 'quality'])
  if (input.communication !== undefined) tags.push(['rating', String(clamp(input.communication)), 'communication'])
  tags.push(['alt', 'Marketplace seller review'])
  return {
    kind: REVIEW_KIND,
    created_at: options.createdAt ?? Math.floor(Date.now() / 1000),
    content: input.content?.trim() ?? '',
    tags,
  }
}

/** The reviews to show for a seller: one per reviewer, their newest, never the seller’s own. */
export function reviewsToShow(reviews: readonly SellerReview[], seller: Hex, excluded: (reviewer: Hex) => boolean = () => false): SellerReview[] {
  const newest = new Map<Hex, SellerReview>()
  for (const review of reviews) {
    if (review.seller !== seller || review.reviewer === seller || excluded(review.reviewer)) continue
    const held = newest.get(review.reviewer)
    if (held === undefined || review.createdAt > held.createdAt) newest.set(review.reviewer, review)
  }
  return [...newest.values()].sort((a, b) => b.createdAt - a.createdAt)
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100))
}
