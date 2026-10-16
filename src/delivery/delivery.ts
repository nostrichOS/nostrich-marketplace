/** The ways a buyer can receive a listing, as one list for the listing and checkout. */

import { durationDays } from '../listings/shipping'
import { isSatsPrice, type Listing, type ListingPrice } from '../listings/listing'

import type { OfferedOption } from './options'


export type DeliveryService = 'standard' | 'express' | 'overnight' | 'pickup' | 'digital' | 'arranged'

export interface DeliveryChoice {
  id: string
  service: DeliveryService
  /** The seller's own title for an option; absent for the choices we name ourselves. */
  title?: string
  cost?: ListingPrice
  /** A second cost in another currency, added at checkout after conversion. */
  extra?: ListingPrice
  /** Days, when the seller said. */
  days?: { min: number; max: number }
  /** ISO codes, or country names as written; empty is worldwide. */
  countries: string[]
  /** For pickup: where. */
  location?: string
  /** `30406:<pubkey>:<d>` for the order's `shipping` tag. */
  address?: string
}

/** Every way to receive a listing: its delivery options, an older inline shipping tag, digital, or arranged. */
export function deliveryChoices(listing: Pick<Listing, 'format' | 'legacyShipping' | 'price'>, offered: readonly OfferedOption[]): DeliveryChoice[] {
  if (listing.format === 'digital') return [{ id: 'digital', service: 'digital', countries: [] }]
  if (offered.length > 0) {
    return offered.map(({ option, extraCost }) => {
      const service: DeliveryService = option.service === 'pickup' ? 'pickup' : option.service === 'express' ? 'express' : option.service === 'overnight' ? 'overnight' : 'standard'
      const choice: DeliveryChoice = { id: option.address, service, title: option.title, countries: option.countries, address: option.address, cost: option.price }
      if (extraCost !== undefined && extraCost > 0 && listing.price !== undefined) {
        const extra = { amount: extraCost, currency: listing.price.currency }
        const sameCurrency = extra.currency === option.price.currency || (isSatsPrice(extra) && isSatsPrice(option.price) && extra.currency === option.price.currency)
        if (sameCurrency) choice.cost = { amount: option.price.amount + extraCost, currency: option.price.currency }
        else choice.extra = extra
      }
      if (option.duration !== undefined) choice.days = durationDays(option.duration)
      if (option.location !== undefined) choice.location = option.location
      return choice
    })
  }
  const legacy = listing.legacyShipping
  if (legacy !== undefined) {
    const cost = { amount: legacy.cost, currency: legacy.currency }
    if (legacy.kind === 'added') return [{ id: 'legacy-ship', service: 'standard', countries: [], cost }]
    if (legacy.kind === 'free') return [{ id: 'legacy-ship', service: 'standard', countries: [], cost: { amount: 0, currency: 'SATS' } }]
    if (legacy.kind === 'pickup') return [{ id: 'legacy-pickup', service: 'pickup', countries: [] }]
    if (legacy.kind === 'free-or-pickup') {
      return [
        { id: 'legacy-ship', service: 'standard', countries: [], cost: { amount: 0, currency: 'SATS' } },
        { id: 'legacy-pickup', service: 'pickup', countries: [] },
      ]
    }
  }
  return [{ id: 'arranged', service: 'arranged', countries: [] }]
}

/** Whether a choice needs the buyer's address. */
export function needsAddress(choice: DeliveryChoice | undefined): boolean {
  return choice !== undefined && choice.service !== 'pickup' && choice.service !== 'digital'
}

/** A choice's cost in sats, or undefined when a currency in it has no rate. */
export function choiceSats(choice: DeliveryChoice, toSats: (price: ListingPrice) => number | undefined): number | undefined {
  let total = 0
  for (const part of [choice.cost, choice.extra]) {
    if (part === undefined || part.amount === 0) continue
    const sats = toSats(part)
    if (sats === undefined) return undefined
    total += sats
  }
  return total
}
