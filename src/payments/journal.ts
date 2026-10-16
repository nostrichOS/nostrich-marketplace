/** The buyer’s payment journal: written before each step, so an interrupted payment is looked up, never repeated. */

export type JournalPhase =
  /** The order is being sealed and sent. */
  | 'placing'
  /** The order reached the seller; nothing is paid yet (the manual path stays here until a request). */
  | 'placed'
  /** Nobody took the order: nothing was paid, the buyer may try again. */
  | 'undelivered'
  /** A payment was handed to the wallet and no verdict has been read yet. */
  | 'paying'
  /** The wallet refused before sending: nothing was spent. */
  | 'refused'
  /** Sent with no clean verdict: may have been paid. */
  | 'unknown'
  /** Paid, receipt not yet delivered. */
  | 'paid'
  /** Paid and the receipt delivered. */
  | 'done'

export interface JournalEntry {
  orderId: string
  seller: string
  sats: number
  /** The rumor clock the order was sealed with, so a retry is the same rumor. */
  sentAt: number
  phase: JournalPhase
  bolt11?: string
  paymentHash?: string
  verify?: string
  preimage?: string
  btcAddress?: string
  txid?: string
  updatedAt: number
}
