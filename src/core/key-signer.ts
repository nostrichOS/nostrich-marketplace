import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { decrypt, encrypt, getConversationKey } from 'nostr-tools/nip44'

import type { Signer } from './types'

/** A signer over a secret key held in memory, for tests and examples. */
export function keySigner(secretKey: Uint8Array): Signer {
  const pubkey = getPublicKey(secretKey)
  return {
    getPublicKey: async () => pubkey,
    signEvent: async template => finalizeEvent(template, secretKey),
    nip44Encrypt: async (peer, plaintext) => encrypt(plaintext, getConversationKey(secretKey, peer)),
    nip44Decrypt: async (peer, ciphertext) => decrypt(ciphertext, getConversationKey(secretKey, peer)),
  }
}
