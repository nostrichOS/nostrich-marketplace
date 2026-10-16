import {
  Contacts,
  EventDeletion,
  GenericRepost,
  LongFormArticle,
  Metadata,
  Reaction,
  RelayList as RelayListKind,
  Report,
  Repost,
  ShortTextNote,
} from 'nostr-tools/kinds'
import type { Hex, NostrEvent } from './types'

/** Kind numbers this module builds and parses, so callers never hardcode an integer. */
export const KINDS = {
  metadata: Metadata,
  shortNote: ShortTextNote,
  contacts: Contacts,
  deletion: EventDeletion,
  repost: Repost,
  reaction: Reaction,
  genericRepost: GenericRepost,
  relayList: RelayListKind,
  report: Report,
  longForm: LongFormArticle,
  /** NIP-22 comment. */
  comment: 1111,
} as const

/** Signed events, unsigned templates and raw relay payloads all satisfy this. */
export interface Tagged {
  readonly tags: readonly (readonly string[])[]
}

/** Value of the first *usable* tag with this name. */
export function getTagValue(source: Tagged, name: string): string | undefined {
  for (const tag of source.tags) {
    if (tag[0] !== name) continue
    const value = tag[1]
    if (value !== undefined) return value
  }
  return undefined
}

/** Every usable value of tags with this name. */
export function getTagValues(source: Tagged, name: string): string[] {
  const out: string[] = []
  for (const tag of source.tags) {
    if (tag[0] !== name) continue
    const value = tag[1]
    if (value !== undefined) out.push(value)
  }
  return out
}

const HEX_64 = /^[0-9a-f]{64}$/

/** Other clients write mixed-case hex into tags; relay filters only ever match the lowercase form. */
export function normalizeHex(value: string | undefined): Hex | undefined {
  if (value === undefined) return undefined
  if (value.length === 64 && HEX_64.test(value)) return value as Hex
  const lower = value.trim().toLowerCase()
  return HEX_64.test(lower) ? lower : undefined
}

/** The `d` tag. */
export function getIdentifier(source: Tagged): string {
  return getTagValue(source, 'd') ?? ''
}

/** Whether a kind is addressable (30000 to 39999). */
export function isAddressable(kind: number): boolean {
  return kind >= 30000 && kind < 40000
}

/** `kind:pubkey:identifier`, the value of an `a` tag. */
export function eventAddress(event: Pick<NostrEvent, 'kind' | 'pubkey'> & Tagged): string {
  return `${event.kind}:${event.pubkey.toLowerCase()}:${getIdentifier(event)}`
}

export interface ParsedAddress {
  kind: number
  pubkey: Hex
  identifier: string
}

/** Identifiers may contain `:`, so only the first two separators are structural. */
export function parseAddress(value: string): ParsedAddress | undefined {
  const firstColon = value.indexOf(':')
  if (firstColon < 1) return undefined
  const secondColon = value.indexOf(':', firstColon + 1)
  if (secondColon < 0) return undefined
  const kind = Number.parseInt(value.slice(0, firstColon), 10)
  const pubkey = normalizeHex(value.slice(firstColon + 1, secondColon))
  if (!Number.isInteger(kind) || kind < 0 || pubkey === undefined) return undefined
  return { kind, pubkey, identifier: value.slice(secondColon + 1) }
}
