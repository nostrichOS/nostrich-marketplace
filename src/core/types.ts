import type { Event, EventTemplate as Template } from 'nostr-tools/pure'

/** A signed Nostr event. */
export type NostrEvent = Event

/** An event before it is signed. */
export type EventTemplate = Template

/** A lowercase hex string: a pubkey, an event id or a hash. */
export type Hex = string

/** A relay address, `wss://` and normalized. */
export type RelayUrl = string

/** Whatever holds the key: a key in memory, a browser extension or a remote signer. Every method is async. */
export interface Signer {
  getPublicKey(): Promise<Hex>
  signEvent(template: EventTemplate): Promise<NostrEvent>
  nip44Encrypt(peerPubkey: Hex, plaintext: string): Promise<string>
  nip44Decrypt(peerPubkey: Hex, ciphertext: string): Promise<string>
}

/** The parts of a kind 0 profile that say how to pay somebody. */
export interface Profile {
  lud16?: string
  lud06?: string
}
