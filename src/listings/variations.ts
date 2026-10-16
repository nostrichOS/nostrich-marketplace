/** Products with options: a `variable` listing and one `variation` listing per option, linked by an `a` tag. */

import { parseAddress } from '../core/events'
import { LISTING_KIND, type Listing, type ListingInput } from './listing'
import type { NostrEvent } from '../core/types'

export interface ProductAxis {
  /** The seller's own word, as the first option spells it. */
  name: string
  /** In the order a buyer is offered them (`orderValues`). */
  values: string[]
}

export interface ProductOption {
  listing: Listing
  /** One value per axis, in the axes' order. */
  values: string[]
  label: string
}

export interface ProductFamily {
  /** The product's address, `30402:<pubkey>:<d>`. */
  address: string
  parent: Listing
  /** In the seller's order: first listed first (`byListed`). */
  options: ProductOption[]
  /** Empty when the options' own `spec` tags do not tell them apart: the picker then offers one choice per option. */
  axes: ProductAxis[]
}

const fold = (value: string): string => value.trim().toLowerCase()
const NATURAL = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** The product an option belongs to: only for a `variation` that names ANOTHER listing of its own seller. */
export function variationParent(listing: Pick<Listing, 'productType' | 'parent' | 'address' | 'pubkey'>): string | undefined {
  if (listing.productType !== 'variation' || listing.parent === undefined || listing.parent === listing.address) return undefined
  const parsed = parseAddress(listing.parent)
  if (parsed === undefined || parsed.kind !== LISTING_KIND || parsed.pubkey !== listing.pubkey) return undefined
  return listing.parent
}

/** The product a listing is, or is an option of; undefined for a listing that could be neither. */
export function familyAddressOf(listing: Pick<Listing, 'productType' | 'parent' | 'address' | 'pubkey'>): string | undefined {
  if (listing.productType === 'variable') return listing.address
  return variationParent(listing)
}

/** First listed first, then by identifier read as a person reads it (`-o2` before `-o10`): the order the seller added them. */
function byListed(a: Listing, b: Listing): number {
  return (a.publishedAt ?? a.createdAt) - (b.publishedAt ?? b.createdAt) || NATURAL.compare(a.identifier, b.identifier)
}

/** Clothing sizes in the order a rack hangs them, whatever order they were listed in. */
const SIZE_WORDS: Readonly<Record<string, number>> = { small: -1, sm: -1, medium: 0, med: 0, md: 0, large: 1, lg: 1, 'extra large': 2, 'x-large': 2, 'extra small': -2, 'x-small': -2 }
function sizeRank(value: string): number | undefined {
  const word = fold(value)
  const named = SIZE_WORDS[word]
  if (named !== undefined) return named
  const match = /^(\d)?(x{0,4})(s|m|l)$/u.exec(word)
  if (match === null) return undefined
  const more = match[1] !== undefined ? Number(match[1]) : match[2]!.length
  if (match[3] === 'm') return more === 0 ? 0 : undefined
  return (match[3] === 's' ? -1 : 1) * (1 + more)
}

/** Values in the order a buyer is offered them: clothing sizes as a rack hangs them, anything else as listed. */
export function orderValues(values: readonly string[]): string[] {
  const ranks = values.map(sizeRank)
  if (values.length < 2 || ranks.some(rank => rank === undefined)) return [...values]
  return values.map((value, index) => ({ value, rank: ranks[index]! })).sort((a, b) => a.rank - b.rank).map(entry => entry.value)
}

/** An option's title without the product's in front of it, and the punctuation that joined them. */
function ownWords(title: string, product: string): string {
  if (product.trim() === '' || !fold(title).startsWith(fold(product))) return title
  const rest = title.trim().slice(product.trim().length)
  const bracketed = /^\s*\((.*)\)\s*$/u.exec(rest)
  const words = (bracketed?.[1] ?? rest.replace(/^[\s\-–—:·,|/]+/u, '')).trim()
  return words === '' ? title : words
}

/** The family whose product is at `address`, from any listings handed in (the newest version of each address is used). */
export function productFamily(address: string, listings: readonly Listing[]): ProductFamily | undefined {
  const newest = new Map<string, Listing>()
  for (const listing of listings) {
    const held = newest.get(listing.address)
    if (held === undefined || listing.createdAt > held.createdAt) newest.set(listing.address, listing)
  }
  const parent = newest.get(address)
  if (parent === undefined || parent.productType !== 'variable') return undefined
  const members = [...newest.values()].filter(listing => variationParent(listing) === address).sort(byListed)
  if (members.length === 0) return undefined

  const named = new Map<string, { name: string; of: Map<string, string> }>()
  for (const member of members) {
    for (const [key, value] of member.specs) {
      const id = fold(key)
      if (id === '' || value.trim() === '') continue
      const entry = named.get(id) ?? { name: key.trim(), of: new Map<string, string>() }
      if (!entry.of.has(member.address)) entry.of.set(member.address, value.trim())
      named.set(id, entry)
    }
  }
  const stated = new Set(parent.specs.map(([key, value]) => `${fold(key)}\n${fold(value)}`))
  let axes: { id: string; name: string; of: Map<string, string> }[] = []
  for (const [id, entry] of named) {
    if (entry.of.size !== members.length) continue
    const distinct = new Set([...entry.of.values()].map(fold))
    if (distinct.size > 1 || !stated.has(`${id}\n${[...distinct][0]}`)) axes.push({ id, ...entry })
  }
  const tuples = new Set(members.map(member => axes.map(axis => fold(axis.of.get(member.address) ?? '')).join('\n')))
  if (axes.length === 0 || tuples.size !== members.length) axes = []

  return {
    address,
    parent,
    axes: axes.map(axis => {
      const seen = new Map<string, string>()
      for (const member of members) {
        const value = axis.of.get(member.address) ?? ''
        if (!seen.has(fold(value))) seen.set(fold(value), value)
      }
      return { name: axis.name, values: orderValues([...seen.values()]) }
    }),
    options: members.map(listing => {
      const values = axes.map(axis => axis.of.get(listing.address) ?? '')
      return { listing, values, label: values.length > 0 ? values.join(' / ') : ownWords(listing.title, parent.title) }
    }),
  }
}

/** The option with exactly these answers, one per axis in the axes' order, however they are capitalised. */
export function optionFor(family: ProductFamily, values: readonly string[]): ProductOption | undefined {
  if (values.length !== family.axes.length) return undefined
  return family.options.find(option => option.values.every((value, index) => fold(value) === fold(values[index] ?? '')))
}

export function variationTitle(title: string, values: readonly string[]): string {
  const said = values.map(value => value.trim()).filter(value => value !== '')
  return said.length === 0 ? title.trim() : `${title.trim()} (${said.join(', ')})`
}

/** One option as the seller's form holds it. */
export interface VariationRow {
  /** The option's own `d`. */
  identifier: string
  /** One per option name, in their order. */
  values: readonly string[]
  amount: number
  /** Absent: the seller does not count this one. */
  stock?: number
  /** The option's listing as relays hold it, when it has been published before. */
  previous?: NostrEvent
}

/** What a product with options publishes: the product, then one complete listing per option. */
export function familyInputs(
  product: Omit<ListingInput, 'productType' | 'parent' | 'stock'>,
  pubkey: string,
  names: readonly string[],
  rows: readonly VariationRow[],
): { parent: ListingInput; options: ListingInput[] } {
  const address = `${LISTING_KIND}:${pubkey}:${product.identifier}`
  const axes = names.map(name => name.trim())
  const taken = new Set(axes.map(fold))
  const shared = (product.specs ?? []).filter(([key]) => !taken.has(fold(key)))
  const lowest = rows.reduce((least, row) => Math.min(least, row.amount), Number.POSITIVE_INFINITY)
  const parent: ListingInput = {
    ...product,
    price: { ...product.price, amount: Number.isFinite(lowest) ? lowest : product.price.amount },
    specs: shared,
    productType: 'variable',
  }
  const options = rows.map((row): ListingInput => {
    const { previous: _productsOwn, publishedAt: _productsDay, ...rest } = product
    const listed = Number(row.previous?.tags.find(tag => tag[0] === 'published_at')?.[1])
    return {
      ...rest,
      ...(Number.isInteger(listed) && listed > 0 ? { publishedAt: listed } : {}),
      identifier: row.identifier,
      title: variationTitle(product.title, row.values),
      price: { ...product.price, amount: row.amount },
      ...(row.stock === undefined ? {} : { stock: row.stock }),
      specs: [...axes.map((name, index) => [name, (row.values[index] ?? '').trim()] as const), ...shared],
      productType: 'variation',
      parent: address,
      ...(row.previous === undefined ? {} : { previous: row.previous }),
    }
  })
  return { parent, options }
}
