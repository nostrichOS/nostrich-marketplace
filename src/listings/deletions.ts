/** NIP-09 deletions: a kind 5 by `e` removes one event, by `a` every version of an address up to its time. */

import { KINDS, eventAddress, isAddressable } from '../core/events'
import type { NostrEvent } from '../core/types'

export interface Deletions {
  /** `<author>:<id>`, keyed with the author so a stranger's kind 5 naming a note deletes nothing. */
  readonly ids: Set<string>
  /** Address → the newest time up to which its author deleted it. */
  readonly addresses: Map<string, number>
}

/** No deletions yet. */
export function emptyDeletions(): Deletions {
  return { ids: new Set(), addresses: new Map() }
}

/** A revision that says it is gone: an addressable event with a `deleted` tag. */
export function isTombstone(event: Pick<NostrEvent, 'kind' | 'tags'>): boolean {
  if (!isAddressable(event.kind)) return false
  const tag = event.tags.find(candidate => candidate[0] === 'deleted')
  return tag !== undefined && tag[1] !== 'false'
}

/** Folds one event into `into` when it deletes anything: a kind 5, or a tombstone. */
export function recordDeletion(into: Deletions, event: NostrEvent): boolean {
  const author = event.pubkey.toLowerCase()
  if (event.kind === KINDS.deletion) {
    let named = false
    for (const tag of event.tags) {
      if (typeof tag[1] !== 'string') continue
      if (tag[0] === 'e') {
        into.ids.add(`${author}:${tag[1].toLowerCase()}`)
        named = true
      } else if (tag[0] === 'a') {
        const [kind, pubkey, ...rest] = tag[1].split(':')
        if (pubkey?.toLowerCase() !== author || kind === undefined) continue
        deleteAddress(into, `${kind}:${author}:${rest.join(':')}`, event.created_at)
        named = true
      }
    }
    return named
  }
  if (!isTombstone(event)) return false
  deleteAddress(into, eventAddress(event), event.created_at)
  return true
}

function deleteAddress(into: Deletions, address: string, at: number): void {
  into.addresses.set(address, Math.max(into.addresses.get(address) ?? 0, at))
}

/** Every deletion among `events`: its kind 5s and its tombstones. */
export function collectDeletions(events: Iterable<NostrEvent>, into: Deletions = emptyDeletions()): Deletions {
  for (const event of events) recordDeletion(into, event)
  return into
}

/** Whether `deletions` removes this event: by its id, or as a version of an address deleted at or after it. */
export function isDeletedBy(event: Pick<NostrEvent, 'id' | 'kind' | 'pubkey' | 'tags' | 'created_at'>, deletions: Deletions): boolean {
  if (deletions.ids.has(`${event.pubkey.toLowerCase()}:${event.id}`)) return true
  if (!isAddressable(event.kind) || deletions.addresses.size === 0) return false
  const deletedAt = deletions.addresses.get(eventAddress(event))
  return deletedAt !== undefined && deletedAt >= event.created_at
}

/** NIP-01's rule for two versions of one address: newer wins, and on a tie the LOWER id. */
export function isNewerVersion(a: Pick<NostrEvent, 'id' | 'created_at'>, b: Pick<NostrEvent, 'id' | 'created_at'>): boolean {
  if (a.created_at !== b.created_at) return a.created_at > b.created_at
  return a.id < b.id
}

/** The newest version of each addressable event in `events`, minus every one its author deleted. */
export function newestLiveVersions<T extends NostrEvent>(events: readonly T[], known?: Deletions): T[] {
  const deletions = collectDeletions(events, known === undefined ? emptyDeletions() : cloneDeletions(known))
  const newest = new Map<string, T>()
  for (const event of events) {
    if (!isAddressable(event.kind)) continue
    const address = eventAddress(event)
    const held = newest.get(address)
    if (held === undefined || isNewerVersion(event, held)) newest.set(address, event)
  }
  return [...newest.values()].filter(event => !isDeletedBy(event, deletions))
}

function cloneDeletions(source: Deletions): Deletions {
  return { ids: new Set(source.ids), addresses: new Map(source.addresses) }
}
