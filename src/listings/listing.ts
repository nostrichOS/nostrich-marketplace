/** NIP-99 listings (kind 30402, drafts 30403) as every marketplace app writes them, read and written. */

import { eventAddress, getIdentifier, getTagValue, getTagValues, parseAddress } from '../core/events'
import { isPrivateUrl } from '../core/relays'
import type { EventTemplate, Hex, NostrEvent } from '../core/types'
import { mainnetBitcoinAddress } from './bitcoin-address'

export const LISTING_KIND = 30402
export const DRAFT_LISTING_KIND = 30403
export const SHIPPING_OPTION_KIND = 30406
export const COLLECTION_KIND = 30405

/** The sats-denominated currency codes found in the wild, all read as one. */
const SATS_CODES = new Set(['SAT', 'SATS', 'SATOSHI', 'SATOSHIS'])
const FREQUENCIES = new Set(['hour', 'day', 'week', 'month', 'year'])
/** Common spellings of a frequency, folded onto NIP-99's words. */
const FREQUENCY_ALIASES: Record<string, string> = {
  hourly: 'hour',
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
  annually: 'year',
  h: 'hour',
  d: 'day',
  w: 'week',
  m: 'month',
  y: 'year',
}

export type ListingFormat = 'physical' | 'digital'
export type ListingVisibility = 'on-sale' | 'hidden' | 'pre-order'
export type ProductType = 'simple' | 'variable' | 'variation'

export interface ListingPrice {
  /** A decimal as written, parsed. */
  amount: number
  /** Upper case. */
  currency: string
  /** NIP-99's optional frequency: hour, day, week, month or year. */
  frequency?: string
}

export interface ListingImage {
  url: string
  /** `<width>x<height>` when the seller gave it. */
  dims?: string
}

export interface ShippingOptionRef {
  /** `30406:<pubkey>:<d>` (or a 30405 collection, whose options apply). */
  address: string
  /** True for the `30406:<pubkey>` form: all of the seller's options. */
  all?: boolean
  /** Extra cost for this product on that option, in the LISTING's currency. */
  extraCost?: number
}

export interface LegacyShipping {
  kind: 'added' | 'free' | 'pickup' | 'free-or-pickup' | 'none'
  cost: number
  currency: string
}

export interface Listing {
  address: string
  eventId: Hex
  kind: number
  pubkey: Hex
  identifier: string
  createdAt: number
  draft: boolean
  title: string
  summary?: string
  /** Markdown, as written. */
  content: string
  /** In the seller's sort order; the first is the cover. */
  images: ListingImage[]
  price?: ListingPrice
  productType: ProductType
  format: ListingFormat
  visibility: ListingVisibility
  /** Units in stock. */
  stock?: number
  specs: [string, string][]
  weight?: { value: string; unit: string }
  dim?: { value: string; unit: string }
  location?: string
  /** Lower-cased `t` tags, de-duplicated, in order. */
  tags: string[]
  shipping: ShippingOptionRef[]
  legacyShipping?: LegacyShipping
  /** The parent product of a variation (`a` 30402). */
  parent?: string
  /** Collections this product belongs to (`a` 30405). */
  collections: string[]
  /** `active` unless the seller said otherwise; NIP-99 defines `sold`. */
  status: string
  publishedAt?: number
  condition?: string
  expiresAt?: number
  /** An `r` link to the shop that really sells it, for link-out listings. */
  externalUrl?: string
  onchain?: string
  lightning: boolean
}

/** What a product is paid with, as its seller chose (`Listing.onchain`, `Listing.lightning`). */
export type ListingPayment = 'lightning' | 'bitcoin' | 'both'

/** How a listing is paid: Lightning, a Bitcoin address, or both. */
export function listingAccepts(listing: Pick<Listing, 'onchain' | 'lightning'>): ListingPayment {
  if (listing.onchain === undefined) return 'lightning'
  return listing.lightning ? 'both' : 'bitcoin'
}

/** The media a `payment` tag may name for a payment to a Bitcoin address. */
const ONCHAIN_MEDIA = new Set(['bitcoin', 'btc'])

/** Reads a kind 30402 or 30403 listing, from any app, or null when it is not one. */
export function parseListing(event: NostrEvent): Listing | null {
  if (event.kind !== LISTING_KIND && event.kind !== DRAFT_LISTING_KIND) return null
  const identifier = getIdentifier(event)
  if (identifier === '' && !event.tags.some(tag => tag[0] === 'd')) return null

  const content = typeof event.content === 'string' ? event.content : ''
  const summary = clean(getTagValue(event, 'summary'))
  const title = clean(getTagValue(event, 'title')) ?? clean(getTagValue(event, 'name')) ?? summary ?? firstLine(content) ?? ''

  const listing: Listing = {
    address: eventAddress({ ...event, kind: LISTING_KIND }),
    eventId: event.id,
    kind: event.kind,
    pubkey: event.pubkey,
    identifier,
    createdAt: event.created_at,
    draft: event.kind === DRAFT_LISTING_KIND,
    title,
    content,
    images: parseImages(event.tags),
    productType: 'simple',
    format: 'physical',
    visibility: 'on-sale',
    specs: [],
    tags: [],
    shipping: [],
    collections: [],
    status: (clean(getTagValue(event, 'status')) ?? 'active').toLowerCase(),
    lightning: true,
  }
  if (summary !== undefined) listing.summary = summary

  for (const tag of event.tags) {
    if (tag[0] !== 'payment' || !ONCHAIN_MEDIA.has((tag[1] ?? '').trim().toLowerCase())) continue
    const address = mainnetBitcoinAddress(tag[2])
    if (address === undefined) continue
    listing.onchain = address
    break
  }
  if (listing.onchain !== undefined) listing.lightning = event.tags.some(tag => tag[0] === 'payment' && (tag[1] ?? '').trim().toLowerCase() === 'lightning')

  const price = parsePriceTag(event.tags.find(tag => tag[0] === 'price'))
  if (price !== undefined) listing.price = price

  const type = event.tags.find(tag => tag[0] === 'type')
  if (type !== undefined) {
    for (const value of type.slice(1)) {
      const word = value.trim().toLowerCase()
      if (word === 'simple' || word === 'variable' || word === 'variation') listing.productType = word
      if (word === 'physical' || word === 'digital') listing.format = word
    }
  }

  const visibility = clean(getTagValue(event, 'visibility'))?.toLowerCase()
  if (visibility === 'hidden' || visibility === 'pre-order' || visibility === 'on-sale') listing.visibility = visibility

  const stock = clean(getTagValue(event, 'stock')) ?? clean(getTagValue(event, 'quantity'))
  if (stock !== undefined && /^\d+$/.test(stock)) listing.stock = Number(stock)

  for (const tag of event.tags) {
    if (tag[0] === 'spec' && tag[1] !== undefined && tag[2] !== undefined && tag[1].trim() !== '') {
      listing.specs.push([tag[1].trim(), tag[2].trim()])
    }
  }

  const weight = event.tags.find(tag => tag[0] === 'weight')
  if (weight?.[1] !== undefined && weight[1].trim() !== '') listing.weight = { value: weight[1].trim(), unit: (weight[2] ?? '').trim() }
  const dim = event.tags.find(tag => tag[0] === 'dim')
  if (dim?.[1] !== undefined && dim[1].trim() !== '') listing.dim = { value: dim[1].trim(), unit: (dim[2] ?? '').trim() }

  const location = clean(getTagValue(event, 'location'))
  if (location !== undefined) listing.location = location

  const seen = new Set<string>()
  for (const value of getTagValues(event, 't')) {
    const tag = normalizeListingTag(value)
    if (tag === '' || seen.has(tag)) continue
    seen.add(tag)
    listing.tags.push(tag)
  }

  for (const tag of event.tags) {
    if (tag[0] !== 'shipping_option' || tag[1] === undefined) continue
    const ref = parseShippingRef(tag[1])
    if (ref === undefined) continue
    const extra = tag[2] === undefined ? NaN : Number(tag[2])
    if (Number.isFinite(extra) && extra > 0) ref.extraCost = extra
    if (!listing.shipping.some(held => held.address === ref.address)) listing.shipping.push(ref)
  }

  const pictures = new Set(event.tags.filter(tag => tag[0] === 'image' && tag[1] !== undefined).map(tag => tag[1]!.trim()))
  const shop = event.tags.find(tag => tag[0] === 'r' && tag[1] !== undefined && !pictures.has(tag[1].trim()) && !isPictureUrl(tag[1]))
  const external = publicHttpUrl(shop?.[1])
  if (external !== undefined) listing.externalUrl = external

  const legacy = parseLegacyShipping(event.tags.find(tag => tag[0] === 'shipping'))
  if (legacy !== undefined) listing.legacyShipping = legacy

  for (const tag of event.tags) {
    if (tag[0] !== 'a' || tag[1] === undefined) continue
    const parsed = parseAddress(tag[1].trim())
    if (parsed === undefined) continue
    if (parsed.kind === LISTING_KIND && listing.parent === undefined) listing.parent = tag[1].trim()
    if (parsed.kind === COLLECTION_KIND) listing.collections.push(tag[1].trim())
  }

  const published = Number(getTagValue(event, 'published_at'))
  if (Number.isInteger(published) && published > 0) listing.publishedAt = published

  const condition = clean(getTagValue(event, 'condition'))?.toLowerCase()
  if (condition !== undefined) listing.condition = condition

  const expiration = Number(getTagValue(event, 'expiration'))
  if (Number.isInteger(expiration) && expiration > 0) listing.expiresAt = expiration

  return listing
}

/** Whether a listing is something a buyer can be shown at all. */
export function isShowable(listing: Listing, now = Math.floor(Date.now() / 1000)): boolean {
  if (listing.draft) return false
  if (listing.visibility === 'hidden') return false
  if (listing.expiresAt !== undefined && listing.expiresAt <= now) return false
  return true
}

/** Whether a listing can be bought now: published, not sold, not expired, not a draft. */
export function isForSale(listing: Listing, now?: number): boolean {
  return isShowable(listing, now) && listing.status !== 'sold'
}

/** Nothing left to sell: counted stock at zero. */
export function isOutOfStock(listing: Pick<Listing, 'stock'>): boolean {
  return listing.stock !== undefined && listing.stock <= 0
}

/** Whether a listing’s `condition` says it is anything but new. */
export function isUsed(listing: Pick<Listing, 'condition'>): boolean {
  return listing.condition !== undefined && listing.condition !== 'new'
}

/** A listing tag as one word: lower case, no `#`, spaces folded to hyphens. */
export function normalizeListingTag(value: string): string {
  return value
    .trim()
    .replace(/^#+/u, '')
    .toLowerCase()
    .replace(/\s+/gu, '-')
    .slice(0, 60)
}

/** A `shipping_option` value as a reference, or undefined when it names no delivery option. */
export function parseShippingRef(value: string): ShippingOptionRef | undefined {
  const trimmed = value.trim()
  const bare = /^(30406|30405):([0-9a-f]{64})$/u.exec(trimmed)
  if (bare !== null) return { address: `${bare[1]}:${bare[2]}`, all: true }
  const parsed = parseAddress(trimmed)
  if (parsed === undefined || (parsed.kind !== SHIPPING_OPTION_KIND && parsed.kind !== COLLECTION_KIND)) return undefined
  if (parsed.identifier === '') return { address: `${parsed.kind}:${parsed.pubkey}`, all: true }
  return { address: `${parsed.kind}:${parsed.pubkey}:${parsed.identifier}` }
}

/** Whether a listing is bought on the seller’s own site rather than ordered here. */
export function isLinkOut(listing: Pick<Listing, 'externalUrl' | 'shipping' | 'legacyShipping' | 'format'>): boolean {
  return listing.externalUrl !== undefined && listing.shipping.length === 0 && listing.legacyShipping === undefined && listing.format !== 'digital'
}

/** Reads a `price` tag: amount, currency and optional frequency. */
export function parsePriceTag(tag: readonly string[] | undefined): ListingPrice | undefined {
  if (tag === undefined || tag[1] === undefined) return undefined
  const amount = Number(tag[1].trim().replace(/,/gu, ''))
  if (!Number.isFinite(amount) || amount < 0) return undefined
  const price: ListingPrice = { amount, currency: normalizeCurrency(tag[2] ?? 'SATS') }
  const frequency = normalizeFrequency(tag[3])
  if (frequency !== undefined) price.frequency = frequency
  return price
}

export function normalizeCurrency(value: string): string {
  const upper = value.trim().toUpperCase()
  if (upper === '' || SATS_CODES.has(upper)) return 'SATS'
  if (upper === 'XBT') return 'BTC'
  return upper
}

export function normalizeFrequency(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const word = value.trim().toLowerCase()
  if (word === '' || word === 'once' || word === 'one-time') return undefined
  const folded = FREQUENCY_ALIASES[word] ?? word
  return FREQUENCIES.has(folded) ? folded : undefined
}

export type FiatRates = Readonly<Record<string, number>>

/** A price in sats, converting a money price with the given rates, or undefined without one. */
export function priceInSats(price: Pick<ListingPrice, 'amount' | 'currency'>, rates: FiatRates = {}): number | undefined {
  const currency = normalizeCurrency(price.currency)
  if (currency === 'SATS') return Math.ceil(price.amount)
  if (currency === 'BTC') return Math.ceil(price.amount * 100_000_000)
  if (currency === 'MSAT' || currency === 'MSATS') return Math.ceil(price.amount / 1000)
  const perBtc = rates[currency]
  if (perBtc === undefined || !Number.isFinite(perBtc) || perBtc <= 0) return undefined
  return Math.ceil((price.amount / perBtc) * 100_000_000)
}

/** Whether a price is written in sats or bitcoin (true) or in a fiat currency (false). */
export function isSatsPrice(price: Pick<ListingPrice, 'currency'>): boolean {
  const currency = normalizeCurrency(price.currency)
  return currency === 'SATS' || currency === 'BTC' || currency === 'MSAT' || currency === 'MSATS'
}

export interface ListingInput {
  identifier: string
  title: string
  summary?: string
  content: string
  /** In order; the first is the cover. */
  images: readonly string[]
  price: { amount: number; currency: string; frequency?: string }
  format: ListingFormat
  stock?: number
  tags: readonly string[]
  location?: string
  specs?: readonly (readonly [string, string])[]
  shipping: readonly ShippingOptionRef[]
  /** NIP-99's `status`. */
  status?: 'active' | 'sold'
  /** Preserve verbatim on every edit. */
  publishedAt?: number
  condition?: string
  /** Save as a draft (30403): never in any market. */
  draft?: boolean
  accepts?: ListingPayment
  /** The seller's own Bitcoin address, for `bitcoin` and `both`. */
  onchainAddress?: string
  productType?: ProductType
  /** The product a `variation` is an option of, `30402:<pubkey>:<d>`. */
  parent?: string
  previous?: NostrEvent
}

/** Tag names this builder writes. */
const OWNED = new Set([
  'd',
  'title',
  'summary',
  'image',
  'price',
  'type',
  'stock',
  't',
  'location',
  'spec',
  'shipping_option',
  'status',
  'published_at',
  'condition',
  'client',
  'alt',
  'checkout_public_zaps',
  'checkout_zap_message_policy',
])

/** Writes a listing, keeping every tag of another app that this form does not own. */
export function buildListing(input: ListingInput, options: { createdAt?: number } = {}): EventTemplate {
  const createdAt = options.createdAt ?? Math.floor(Date.now() / 1000)
  const tags: string[][] = [['d', input.identifier], ['title', input.title.trim()]]
  const summary = input.summary?.trim()
  if (summary) tags.push(['summary', summary])
  input.images.forEach((url, index) => {
    tags.push(['image', url, '', String(index)])
  })
  const price = ['price', formatAmount(input.price.amount), normalizeCurrency(input.price.currency) === 'SATS' ? 'SATS' : normalizeCurrency(input.price.currency)]
  const frequency = normalizeFrequency(input.price.frequency)
  if (frequency !== undefined) price.push(frequency)
  tags.push(price)
  tags.push(['type', input.productType ?? 'simple', input.format])
  if (input.parent !== undefined) tags.push(['a', input.parent])
  if (input.stock !== undefined) tags.push(['stock', String(Math.max(0, Math.floor(input.stock)))])
  const seen = new Set<string>()
  for (const raw of input.tags) {
    const tag = normalizeListingTag(raw)
    if (tag === '' || seen.has(tag)) continue
    seen.add(tag)
    tags.push(['t', tag])
  }
  const location = input.location?.trim()
  if (location) tags.push(['location', location])
  for (const [key, value] of input.specs ?? []) {
    if (key.trim() === '' || value.trim() === '') continue
    tags.push(['spec', key.trim(), value.trim()])
  }
  for (const option of input.shipping) {
    tags.push(option.extraCost === undefined ? ['shipping_option', option.address] : ['shipping_option', option.address, formatAmount(option.extraCost)])
  }
  if (input.condition !== undefined && input.condition !== '') tags.push(['condition', input.condition])
  tags.push(['status', input.status ?? 'active'])
  tags.push(['published_at', String(input.publishedAt ?? createdAt)])
  tags.push(['alt', `Listing: ${input.title.trim()}`])
  const address = input.accepts === undefined || input.accepts === 'lightning' ? undefined : mainnetBitcoinAddress(input.onchainAddress)
  const mediumOf = (tag: readonly string[]): string => (tag[1] ?? '').trim().toLowerCase()
  const namesLightning = input.previous?.tags.some(tag => tag[0] === 'payment' && mediumOf(tag) === 'lightning') === true
  const dropped = (tag: readonly string[]): boolean => {
    if (tag[0] === 'a') return input.parent !== undefined && parseAddress((tag[1] ?? '').trim())?.kind === LISTING_KIND
    if (tag[0] !== 'payment' || input.accepts === undefined) return false
    if (ONCHAIN_MEDIA.has(mediumOf(tag))) return true
    return mediumOf(tag) === 'lightning' && input.accepts === 'bitcoin' && address !== undefined
  }
  if (input.previous !== undefined) {
    for (const tag of input.previous.tags) {
      if (!OWNED.has(tag[0] ?? '') && !dropped(tag)) tags.push([...tag])
    }
  }
  if (address !== undefined) {
    if (input.accepts === 'both' && !namesLightning) tags.push(['payment', 'lightning'])
    tags.push(['payment', 'bitcoin', address])
  }
  return {
    kind: input.draft === true ? DRAFT_LISTING_KIND : LISTING_KIND,
    created_at: createdAt,
    content: input.content,
    tags,
  }
}

/** The same listing with only its stock changed, every other tag kept as it was. */
export function withStock(event: NostrEvent, stock: number, options: { createdAt?: number } = {}): EventTemplate {
  const next = Math.max(0, Math.floor(stock))
  const tags = event.tags.map(tag => [...tag])
  const at = tags.findIndex(tag => tag[0] === 'stock')
  if (at === -1) tags.push(['stock', String(next)])
  else tags[at] = ['stock', String(next)]
  return {
    kind: event.kind,
    created_at: Math.max(options.createdAt ?? Math.floor(Date.now() / 1000), event.created_at + 1),
    content: event.content,
    tags,
  }
}

/** The same listing paid at another Bitcoin address, or undefined when it is not paid on-chain. */
export function withOnchainAddress(event: NostrEvent, address: string, options: { createdAt?: number } = {}): EventTemplate | undefined {
  const next = mainnetBitcoinAddress(address)
  const isOurs = (tag: readonly string[]): boolean => tag[0] === 'payment' && ONCHAIN_MEDIA.has((tag[1] ?? '').trim().toLowerCase())
  if (next === undefined || !event.tags.some(isOurs)) return undefined
  let written = false
  const tags: string[][] = []
  for (const tag of event.tags) {
    if (!isOurs(tag)) {
      tags.push([...tag])
      continue
    }
    if (written) continue
    written = true
    tags.push(['payment', 'bitcoin', next])
  }
  return {
    kind: event.kind,
    created_at: Math.max(options.createdAt ?? Math.floor(Date.now() / 1000), event.created_at + 1),
    content: event.content,
    tags,
  }
}

function formatAmount(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(8)))
}

function parseImages(tags: readonly string[][]): ListingImage[] {
  const found: { image: ListingImage; order: number; index: number }[] = []
  tags.forEach((tag, index) => {
    if (tag[0] !== 'image' || tag[1] === undefined) return
    const url = publicHttpUrl(tag[1])
    if (url === undefined) return
    const image: ListingImage = { url }
    const dims = tag[2]?.trim()
    if (dims && /^\d+x\d+$/u.test(dims)) image.dims = dims
    const order = tag[3] === undefined || tag[3].trim() === '' ? NaN : Number(tag[3])
    found.push({ image, order: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER, index })
  })
  found.sort((a, b) => a.order - b.order || a.index - b.index)
  const seen = new Set<string>()
  const images: ListingImage[] = []
  for (const { image } of found) {
    if (seen.has(image.url)) continue
    seen.add(image.url)
    images.push(image)
  }
  return images
}

function parseLegacyShipping(tag: readonly string[] | undefined): LegacyShipping | undefined {
  if (tag === undefined || tag[1] === undefined) return undefined
  const word = tag[1].trim().toLowerCase()
  const cost = Number(tag[2] ?? '0')
  const currency = normalizeCurrency(tag[3] ?? 'SATS')
  const kind: LegacyShipping['kind'] | undefined =
    word === 'added cost'
      ? 'added'
      : word === 'free'
        ? 'free'
        : word === 'pickup'
          ? 'pickup'
          : word === 'free/pickup'
            ? 'free-or-pickup'
            : word === 'n/a'
              ? 'none'
              : undefined
  if (kind === undefined) return undefined
  return { kind, cost: Number.isFinite(cost) && cost > 0 ? cost : 0, currency }
}

function publicHttpUrl(value: string | undefined): string | undefined {
  const url = value?.trim()
  if (!url) return undefined
  if (!/^https?:\/\//iu.test(url)) return undefined
  if (isPrivateUrl(url)) return undefined
  return url
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

function firstLine(content: string): string | undefined {
  for (const line of content.split('\n')) {
    const text = line
      .replace(/^#+\s*/u, '')
      .replace(/[*_`>]/gu, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, '$1')
      .trim()
    if (text !== '' && !/^https?:\/\//iu.test(text)) return text.length > 90 ? `${text.slice(0, 89).trimEnd()}…` : text
  }
  return undefined
}

const PICTURE_FILE = /\.(?:jpe?g|png|gif|webp|avif|heic|heif|bmp|svg)$/iu
const BLOSSOM_BLOB = /\/[0-9a-f]{64}(?:\.[a-z0-9]{2,5})?$/iu

/** A URL that names a picture: an image file by its extension, or a Blossom blob (a sha256 path). */
export function isPictureUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return PICTURE_FILE.test(url.pathname) || BLOSSOM_BLOB.test(url.pathname)
  } catch {
    return false
  }
}

const BARE_URL = /https?:\/\/[^\s<>()"']+/giu

/** The picture URLs written into a description as bare text, in order, once each. */
export function pictureLinksIn(text: string): string[] {
  const found: string[] = []
  for (const match of text.matchAll(BARE_URL)) {
    const url = match[0].replace(/[.,;:!?]+$/u, '')
    if (isPictureUrl(url) && !found.includes(url)) found.push(url)
  }
  return found
}

/** A description without the bare picture URLs typed into it; the gallery shows them. */
export function withoutPictureLinks(text: string): string {
  return text
    .replace(BARE_URL, (match, offset: number, whole: string) => {
      const before = whole.slice(Math.max(0, offset - 2), offset)
      const url = match.replace(/[.,;:!?]+$/u, '')
      if (before.endsWith('(') || before.endsWith('<') || !isPictureUrl(url)) return match
      return match.slice(url.length)
    })
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}
