import { describe, expect, it } from 'vitest'

import type { NostrEvent } from '../core/types'
import { collectDeletions, newestLiveVersions } from './deletions'
import { buildListing, isForSale, isLinkOut, isShowable, listingAccepts, parseListing, parseShippingRef, priceInSats, withStock, type ListingInput } from './listing'
import { buildShippingOption, durationDays, parseShippingOption } from './shipping'
import { familyInputs, productFamily } from './variations'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

function event(partial: Partial<NostrEvent> & Pick<NostrEvent, 'kind' | 'tags'>): NostrEvent {
  return { id: '0'.repeat(64), pubkey: A, created_at: 1_790_000_000, content: '', sig: '0'.repeat(128), ...partial }
}

describe('reading listings as apps write them', () => {
  it('reads a hidden listing with a delivery option and a collection', () => {
    const listing = parseListing(
      event({
        kind: 30402,
        tags: [
          ['d', 'olive-oil'], ['title', 'Olive oil'], ['price', '36', 'USD'], ['type', 'simple', 'physical'], ['visibility', 'hidden'],
          ['shipping_option', `30406:${A}:pickup`], ['a', `30405:${A}:pantry`], ['t', 'Oil'], ['t', 'oil'], ['t', 'pantry'],
        ],
      }),
    )
    expect(listing?.price).toEqual({ amount: 36, currency: 'USD' })
    expect(listing?.visibility).toBe('hidden')
    expect(listing?.shipping).toEqual([{ address: `30406:${A}:pickup` }])
    expect(listing?.collections).toEqual([`30405:${A}:pantry`])
    expect(listing?.tags).toEqual(['oil', 'pantry'])
    expect(listing !== null && isShowable(listing)).toBe(false)
  })

  it('reads stock, specs, sorted pictures and an extra delivery cost', () => {
    const listing = parseListing(
      event({
        kind: 30402,
        tags: [
          ['d', 'print'], ['title', 'Print'], ['price', '20000', 'SATS'], ['stock', '5'], ['spec', 'Size', '15cm'],
          ['image', 'https://img.example/b.jpg', '800x600', '1'], ['image', 'https://img.example/a.jpg', '800x600', '0'],
          ['shipping_option', `30406:${A}:std`, '3'],
        ],
      }),
    )
    expect(listing?.stock).toBe(5)
    expect(listing?.specs).toEqual([['Size', '15cm']])
    expect(listing?.images.map(image => image.url)).toEqual(['https://img.example/a.jpg', 'https://img.example/b.jpg'])
    expect(listing?.shipping[0]).toEqual({ address: `30406:${A}:std`, extraCost: 3 })
  })

  it('treats a listing that only links to a shop as bought there', () => {
    const listing = parseListing(event({ kind: 30402, tags: [['d', 'x'], ['title', 'x'], ['r', 'https://shop.example']] }))
    expect(listing?.externalUrl).toBe('https://shop.example')
    expect(listing !== null && isLinkOut(listing)).toBe(true)
  })

  it('never offers a draft, an expired or a sold listing', () => {
    const draft = parseListing(event({ kind: 30403, tags: [['d', 'x'], ['title', 'x']] }))
    expect(draft?.draft).toBe(true)
    expect(draft !== null && draft !== undefined && isShowable(draft)).toBe(false)
    const expired = parseListing(event({ kind: 30402, tags: [['d', 'x'], ['title', 'x'], ['expiration', '100']] }))
    expect(expired !== null && expired !== undefined && isShowable(expired, 200)).toBe(false)
    const sold = parseListing(event({ kind: 30402, tags: [['d', 'x'], ['title', 'x'], ['status', 'sold']] }))
    expect(sold !== null && sold !== undefined && isForSale(sold)).toBe(false)
  })

  it('refuses a picture on a private address or a non-web scheme', () => {
    const listing = parseListing(event({ kind: 30402, tags: [['d', 'x'], ['image', 'http://192.168.1.2/a.jpg'], ['image', 'ftp://x/y'], ['image', 'https://img.example/a.jpg']] }))
    expect(listing?.images.map(image => image.url)).toEqual(['https://img.example/a.jpg'])
  })

  it('reads how a listing is paid', () => {
    const address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
    const both = parseListing(event({ kind: 30402, tags: [['d', 'x'], ['payment', 'bitcoin', address], ['payment', 'lightning']] }))
    expect(both !== null && listingAccepts(both)).toBe('both')
    const chain = parseListing(event({ kind: 30402, tags: [['d', 'x'], ['payment', 'bitcoin', address]] }))
    expect(chain !== null && listingAccepts(chain)).toBe('bitcoin')
    const plain = parseListing(event({ kind: 30402, tags: [['d', 'x']] }))
    expect(plain !== null && listingAccepts(plain)).toBe('lightning')
  })
})

describe('prices', () => {
  it('converts a money price with a rate and never guesses one', () => {
    expect(priceInSats({ amount: 21000, currency: 'SATS' })).toBe(21000)
    expect(priceInSats({ amount: 10, currency: 'USD' }, { USD: 100_000 })).toBe(10_000)
    expect(priceInSats({ amount: 10, currency: 'USD' })).toBeUndefined()
  })
})

const MUG: ListingInput = {
  identifier: 'mug',
  title: 'Mug',
  content: 'A mug',
  images: ['https://img.example/mug.jpg'],
  price: { amount: 5000, currency: 'SATS' },
  format: 'physical',
  tags: ['kitchen'],
  shipping: [],
}

const signed = (template: { kind: number; tags: string[][]; content: string; created_at: number }, id: string): NostrEvent => ({ ...template, id: id.repeat(64), pubkey: A, sig: '0'.repeat(128) })

describe('writing listings', () => {
  it('round-trips, and keeps the tags another app wrote on an edit', () => {
    const built = buildListing(MUG, { createdAt: 1 })
    const first = signed({ ...built, tags: [...built.tags, ['other-app', 'kept']] }, '1')
    const listing = parseListing(first)
    expect(listing?.title).toBe('Mug')
    expect(listing?.price).toEqual({ amount: 5000, currency: 'SATS' })
    const edited = buildListing({ ...MUG, title: 'Big mug', previous: first }, { createdAt: 2 })
    expect(edited.tags).toContainEqual(['title', 'Big mug'])
    expect(edited.tags).toContainEqual(['other-app', 'kept'])
  })

  it('changes stock and nothing else', () => {
    const original = event({ kind: 30402, tags: [['d', 'mug'], ['title', 'Mug'], ['stock', '3'], ['other-app', 'kept']] })
    const next = withStock(original, 2, { createdAt: 2 })
    expect(next.tags).toContainEqual(['stock', '2'])
    expect(next.tags).toContainEqual(['other-app', 'kept'])
  })

  it('reads a delivery reference in both forms', () => {
    expect(parseShippingRef(`30406:${A}:std`)).toEqual({ address: `30406:${A}:std` })
    expect(parseShippingRef(`30406:${A}`)).toEqual({ address: `30406:${A}`, all: true })
  })
})

describe('delivery options', () => {
  it('round-trips and turns a duration into days', () => {
    const template = buildShippingOption({ identifier: 'std', title: 'Standard', price: { amount: 5, currency: 'USD' }, countries: ['US', 'CA'], service: 'standard', duration: { min: 7, max: 14 } }, { createdAt: 1 })
    const option = parseShippingOption(signed(template, '2'))
    expect(option?.countries).toEqual(['US', 'CA'])
    expect(option?.duration === undefined ? undefined : durationDays(option.duration)).toEqual({ min: 7, max: 14 })
  })
})

describe('products with options', () => {
  it('publishes a product and its options, and reads them back as one family', () => {
    const { parent, options } = familyInputs({ ...MUG, identifier: 'tee', title: 'Tee' }, A, ['Size'], [
      { identifier: 'tee-o1', values: ['M'], amount: 30 },
      { identifier: 'tee-o2', values: ['L'], amount: 32 },
    ])
    const listings = [parent, ...options].map((input, index) => parseListing(signed(buildListing(input, { createdAt: 10 + index }), String(index + 3))))
    const family = productFamily(`30402:${A}:tee`, listings.filter(listing => listing !== null))
    expect(family?.options.map(option => option.listing.identifier)).toEqual(['tee-o1', 'tee-o2'])
    expect(family?.axes).toEqual([{ name: 'Size', values: ['M', 'L'] }])
  })
})

describe('deletions', () => {
  it('keeps the newest version of an address and drops one its author deleted', () => {
    const v1 = event({ kind: 30402, created_at: 1, id: '1'.repeat(64), tags: [['d', 'mug']] })
    const v2 = event({ kind: 30402, created_at: 2, id: '2'.repeat(64), tags: [['d', 'mug']] })
    const other = event({ kind: 30402, created_at: 2, id: '3'.repeat(64), tags: [['d', 'lamp']] })
    const deletion = event({ kind: 5, created_at: 3, id: '4'.repeat(64), tags: [['a', `30402:${A}:lamp`], ['k', '30402']] })
    const stranger = event({ kind: 5, created_at: 3, id: '5'.repeat(64), pubkey: B, tags: [['a', `30402:${A}:mug`]] })
    const live = newestLiveVersions([v1, v2, other], collectDeletions([deletion, stranger]))
    expect(live.map(item => item.id)).toEqual([v2.id])
  })
})
