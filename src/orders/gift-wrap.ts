/** NIP-59 gift wrapping for any rumor, as NIP-17 does for messages: orders travel this way. */


import { finalizeEvent, generateSecretKey, getEventHash, verifyEvent } from 'nostr-tools/pure'
import { encrypt as nip44Encrypt, getConversationKey } from 'nostr-tools/nip44'
import { GiftWrap, Seal } from 'nostr-tools/kinds'

import { isSealed } from './ciphertext'
import type { Hex, NostrEvent, RelayUrl, Signer } from '../core/types'

/** Ceiling on how far seal and wrap timestamps are pushed into the past, per NIP-17. */
export const MAX_WRAP_JITTER_SECONDS = 2 * 24 * 60 * 60

const HEX_64 = /^[0-9a-f]{64}$/
const HEX_128 = /^[0-9a-f]{128}$/

/** The unsigned inner event. */
export interface Rumor {
  id: Hex
  pubkey: Hex
  created_at: number
  kind: number
  tags: string[][]
  content: string
}

export interface GiftWrapDelivery {
  /** The participant this wrap decrypts for. */
  recipient: Hex
  wrap: NostrEvent
}

/** Opens a kind 1059 gift wrap down to its rumor, or null when it is not ours or the seal does not hold. */
export async function unwrapRumor(
  signer: Signer,
  wrap: NostrEvent,
): Promise<{ rumor: Rumor; wrapId: string } | null> {
  if (wrap.kind !== GiftWrap) return null

  const sealJson = await decryptOrNull(signer, wrap.pubkey, wrap.content)
  if (sealJson === null) return null
  const seal = parseSeal(sealJson)
  if (seal === null) return null
  if (!verifyEvent(seal)) return null

  const rumorJson = await decryptOrNull(signer, seal.pubkey, seal.content)
  if (rumorJson === null) return null
  const rumor = parseRumor(rumorJson)
  if (rumor === null) return null

  if (rumor.pubkey !== seal.pubkey) return null
  return { rumor, wrapId: wrap.id }
}

/** Any rumor to seal: its kind, tags and content. */
export interface RumorInput {
  kind: number
  tags: string[][]
  content: string
}

/** Seals and gift-wraps one rumor for each recipient and for the sender. Nothing is published here. */
export async function wrapRumor(
  signer: Signer,
  input: RumorInput,
  recipients: readonly Hex[],
  options: { sentAt?: number; relayHints?: Readonly<Record<Hex, RelayUrl>> } = {},
): Promise<{ rumor: Rumor; wraps: GiftWrapDelivery[] }> {
  const self = assertHexPubkey(await signer.getPublicKey(), 'signer pubkey')
  const everyone = sortedParticipants([...recipients, self])
  const draft = {
    pubkey: self,
    created_at: options.sentAt ?? Math.floor(Date.now() / 1000),
    kind: input.kind,
    tags: input.tags.map(tag => [...tag]),
    content: input.content,
  }
  const rumor: Rumor = { ...draft, id: getEventHash(draft) }
  const serialisedRumor = JSON.stringify(rumor)
  const wraps: GiftWrapDelivery[] = []
  for (const recipient of everyone) {
    const sealed = await signer.nip44Encrypt(recipient, serialisedRumor)
    if (!isSealed(sealed, serialisedRumor)) {
      throw new Error('signer did not encrypt the message: refusing to publish a seal that would be readable')
    }
    const seal = await signer.signEvent({ kind: Seal, content: sealed, created_at: backdated(rumor.created_at), tags: [] })
    wraps.push({ recipient, wrap: giftWrap(seal, recipient, rumor.created_at, options.relayHints?.[recipient]) })
  }
  return { rumor, wraps }
}

/** The conversation's identity: its participant set, not a thread id. */
export function conversationKeyOf(participants: Hex[]): string {
  return sortedParticipants(participants).join(':')
}

function giftWrap(
  seal: NostrEvent,
  recipient: Hex,
  sentAt: number,
  relayHint?: RelayUrl,
): NostrEvent {
  const throwaway = generateSecretKey()
  return finalizeEvent(
    {
      kind: GiftWrap,
      content: nip44Encrypt(JSON.stringify(seal), getConversationKey(throwaway, recipient)),
      created_at: backdated(sentAt),
      tags: [relayHint === undefined ? ['p', recipient] : ['p', recipient, relayHint]],
    },
    throwaway,
  )
}

function backdated(sentAt: number): number {
  return sentAt - (1 + randomBelow(MAX_WRAP_JITTER_SECONDS))
}

function randomBelow(bound: number): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return (buffer[0] ?? 0) % bound
}

async function decryptOrNull(signer: Signer, peer: Hex, ciphertext: string): Promise<string | null> {
  try {
    return await signer.nip44Decrypt(peer, ciphertext)
  } catch {
    return null
  }
}

interface EventFields {
  pubkey: Hex
  created_at: number
  kind: number
  tags: string[][]
  content: string
}

function parseSeal(json: string): NostrEvent | null {
  const raw = parseObject(json)
  if (raw === null) return null
  const base = eventFields(raw)
  if (base === null || base.kind !== Seal) return null
  const { id, sig } = raw
  if (typeof id !== 'string' || !HEX_64.test(id)) return null
  if (typeof sig !== 'string' || !HEX_128.test(sig)) return null
  return { ...base, id, sig }
}

function parseRumor(json: string): Rumor | null {
  const raw = parseObject(json)
  if (raw === null) return null
  if ('sig' in raw && raw.sig !== null && raw.sig !== '') return null
  const base = eventFields(raw)
  if (base === null) return null
  const computed = getEventHash(base)
  if (typeof raw.id === 'string' && raw.id !== computed) return null
  return { ...base, id: computed }
}

function eventFields(raw: Record<string, unknown>): EventFields | null {
  const { pubkey, created_at, kind, content } = raw
  if (typeof pubkey !== 'string' || !HEX_64.test(pubkey)) return null
  if (typeof created_at !== 'number' || !Number.isInteger(created_at)) return null
  if (typeof kind !== 'number' || !Number.isInteger(kind)) return null
  if (typeof content !== 'string') return null
  const tags = stringMatrix(raw.tags)
  if (tags === null) return null
  return { pubkey, created_at, kind, tags, content }
}

function parseObject(json: string): Record<string, unknown> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  return parsed as Record<string, unknown>
}

function stringMatrix(value: unknown): string[][] | null {
  if (!Array.isArray(value)) return null
  const matrix: string[][] = []
  for (const entry of value) {
    if (!Array.isArray(entry)) return null
    const row: string[] = []
    for (const item of entry) {
      if (typeof item !== 'string') return null
      row.push(item)
    }
    matrix.push(row)
  }
  return matrix
}

function sortedParticipants(pubkeys: readonly Hex[]): Hex[] {
  const unique = new Set<Hex>()
  for (const pubkey of pubkeys) unique.add(assertHexPubkey(pubkey, 'participant'))
  return [...unique].sort()
}

function assertHexPubkey(value: string, label: string): Hex {
  if (!HEX_64.test(value)) {
    throw new Error(`${label} must be lowercase hex, got ${JSON.stringify(value)}`)
  }
  return value
}
