/** Delivery options (kind 30406): read and written. */

import { eventAddress, getIdentifier, getTagValue } from '../core/events'
import type { EventTemplate, Hex, NostrEvent } from '../core/types'
import { normalizeCurrency, SHIPPING_OPTION_KIND, type ListingPrice } from './listing'

export type ShippingService = 'standard' | 'express' | 'overnight' | 'pickup'

export interface ShippingDuration {
  min: number
  max: number
  /** ISO 8601 unit: hours, days or weeks. */
  unit: 'H' | 'D' | 'W'
}

export interface ShippingOption {
  address: string
  eventId: Hex
  pubkey: Hex
  identifier: string
  createdAt: number
  title: string
  /** The base cost. */
  price: ListingPrice
  /** ISO 3166-1 alpha-2, upper case. */
  countries: string[]
  regions: string[]
  service: ShippingService | string
  carrier?: string
  duration?: ShippingDuration
  /** For pickup: where, as the seller wrote it. */
  location?: string
  description: string
}

/** Reads a kind 30406 delivery option, or null when it is not one. */
export function parseShippingOption(event: NostrEvent): ShippingOption | null {
  if (event.kind !== SHIPPING_OPTION_KIND) return null
  const identifier = getIdentifier(event)
  const title = getTagValue(event, 'title')?.trim() || event.content.trim().split('\n')[0]?.trim() || identifier
  const priceTag = event.tags.find(tag => tag[0] === 'price')
  const amount = Number(priceTag?.[1] ?? '0')
  const option: ShippingOption = {
    address: eventAddress(event),
    eventId: event.id,
    pubkey: event.pubkey,
    identifier,
    createdAt: event.created_at,
    title,
    price: { amount: Number.isFinite(amount) && amount > 0 ? amount : 0, currency: normalizeCurrency(priceTag?.[2] ?? 'SATS') },
    countries: codes(event.tags, 'country'),
    regions: codes(event.tags, 'region'),
    service: (getTagValue(event, 'service')?.trim().toLowerCase() || 'standard') as ShippingService,
    description: event.content,
  }
  const carrier = getTagValue(event, 'carrier')?.trim()
  if (carrier) option.carrier = carrier
  const location = getTagValue(event, 'location')?.trim() || pickupAddress(event.tags)
  if (location) option.location = location
  const duration = event.tags.find(tag => tag[0] === 'duration')
  if (duration !== undefined) {
    const min = Number(duration[1])
    const max = Number(duration[2] ?? duration[1])
    const unit = (duration[3] ?? 'D').trim().toUpperCase()
    if (Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= min && (unit === 'H' || unit === 'D' || unit === 'W')) {
      option.duration = { min, max, unit }
    }
  }
  return option
}

/** Whether an option is picked up rather than delivered. */
export function isPickup(option: Pick<ShippingOption, 'service'>): boolean {
  return option.service === 'pickup'
}

export function durationDays(duration: ShippingDuration): { min: number; max: number } {
  const factor = duration.unit === 'H' ? 1 / 24 : duration.unit === 'W' ? 7 : 1
  return { min: Math.max(0, Math.floor(duration.min * factor)), max: Math.max(1, Math.ceil(duration.max * factor)) }
}

export interface ShippingOptionInput {
  identifier: string
  title: string
  price: { amount: number; currency: string }
  countries: readonly string[]
  service: ShippingService
  /** Days. */
  duration?: { min: number; max: number }
  location?: string
  description?: string
  previous?: NostrEvent
}

const OWNED = new Set(['d', 'title', 'price', 'country', 'service', 'duration', 'location', 'alt'])

/** Writes a kind 30406 delivery option. */
export function buildShippingOption(input: ShippingOptionInput, options: { createdAt?: number } = {}): EventTemplate {
  const tags: string[][] = [
    ['d', input.identifier],
    ['title', input.title.trim()],
    ['price', String(Math.max(0, input.price.amount)), normalizeCurrency(input.price.currency)],
    ['service', input.service],
  ]
  for (const country of input.countries) {
    const code = country.trim().toUpperCase()
    if (/^[A-Z]{2}$/u.test(code)) tags.push(['country', code])
  }
  if (input.duration !== undefined && input.service !== 'pickup') {
    tags.push(['duration', String(Math.max(0, Math.floor(input.duration.min))), String(Math.max(1, Math.ceil(input.duration.max))), 'D'])
  }
  const location = input.location?.trim()
  if (location) tags.push(['location', location])
  tags.push(['alt', `Shipping option: ${input.title.trim()}`])
  if (input.previous !== undefined) {
    for (const tag of input.previous.tags) if (!OWNED.has(tag[0] ?? '')) tags.push([...tag])
  }
  return {
    kind: SHIPPING_OPTION_KIND,
    created_at: options.createdAt ?? Math.floor(Date.now() / 1000),
    content: input.description?.trim() ?? input.title.trim(),
    tags,
  }
}

function pickupAddress(tags: readonly string[][]): string | undefined {
  const whole = tags.find(tag => tag[0] === 'pickup-address')?.[1]
  const tidy = (value: string): string =>
    value
      .replace(/\u200b/gu, '')
      .split(',')
      .map(part => part.trim())
      .filter(part => part !== '')
      .join(', ')
  if (whole !== undefined && tidy(whole) !== '') return tidy(whole)
  const parts = ['pickup-street', 'pickup-city', 'pickup-state', 'pickup-postal-code', 'pickup-country']
    .map(name => tags.find(tag => tag[0] === name)?.[1] ?? '')
    .join(',')
  return tidy(parts) || undefined
}

/** Whether an option reaches a country. */
export function shipsTo(option: Pick<ShippingOption, 'countries'>, country: string | undefined): boolean {
  if (option.countries.length === 0 || country === undefined) return true
  return option.countries.includes(country.trim().toUpperCase())
}

function codes(tags: readonly string[][], name: string): string[] {
  const out: string[] = []
  for (const tag of tags) {
    if (tag[0] !== name) continue
    for (const value of tag.slice(1)) {
      const code = value.trim().toUpperCase()
      if (code !== '' && !out.includes(code)) out.push(code)
    }
  }
  return out
}
