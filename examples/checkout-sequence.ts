/** The order of operations Nostrich uses at checkout, with the wallet and the relays passed in. */

import { generateSecretKey } from 'nostr-tools/pure'

import type { Hex, NostrEvent, Signer } from '../src/core/types'
import { wrapRumor } from '../src/orders/gift-wrap'
import { buildOrder, buildReceipt, newOrderId, type OrderItem } from '../src/orders/orders'
import { idempotencyKey, paymentComment } from '../src/payments/checkout'
import type { JournalEntry, JournalPhase } from '../src/payments/journal'
import { createPlainInvoice } from '../src/payments/lnurl'
import { keySigner } from '../src/core/key-signer'

export interface CheckoutDeps {
  signer: Signer
  /** Publishes one gift wrap; true when a relay accepted it. */
  publish(wrap: NostrEvent, recipient: Hex): Promise<boolean>
  /** Pays an invoice once; the key makes a repeat the same payment. */
  pay(bolt11: string, key: string): Promise<{ status: 'paid'; preimage?: string } | { status: 'refused' } | { status: 'unknown' }>
  /** Writes the journal entry before the step it names. */
  record(entry: JournalEntry): void
}

export interface SellerPayment {
  /** The seller’s lightning address, from their kind 0. */
  lud16?: string
  /** `payment_preference` from their kind 0: `lud16` (or `lightning`) means pay at checkout. */
  preference?: string
}

export type CheckoutResult = { phase: JournalPhase; orderId: string }

/** Places an order and, for a seller who takes payment at checkout, pays it, in the one safe order. */
export async function checkout(deps: CheckoutDeps, seller: Hex, sellerPayment: SellerPayment, items: OrderItem[], sats: number, title: string): Promise<CheckoutResult> {
  const orderId = newOrderId()
  const sentAt = Math.floor(Date.now() / 1000)
  const instant = sellerPayment.lud16 !== undefined && (sellerPayment.preference === 'lud16' || sellerPayment.preference === 'lightning')
  const entry = (phase: JournalPhase, extra: Partial<JournalEntry> = {}): JournalEntry => ({ orderId, seller, sats, sentAt, phase, updatedAt: Date.now(), ...extra })

  const invoice = instant
    ? await createPlainInvoice({ recipient: { lud16: sellerPayment.lud16 }, amountMsat: sats * 1000, comment: paymentComment(orderId, title, items[0]?.quantity ?? 1) })
    : undefined
  if (invoice !== undefined && !invoice.ok) throw new Error(invoice.error.message)

  deps.record(entry('placing'))
  const { wraps } = await wrapRumor(deps.signer, buildOrder({ seller, orderId, amount: sats, items }), [seller], { sentAt })
  const sellerCopy = wraps.find(wrap => wrap.recipient === seller)
  const delivered = sellerCopy !== undefined && (await deps.publish(sellerCopy.wrap, seller))
  for (const wrap of wraps) if (wrap !== sellerCopy) await deps.publish(wrap.wrap, wrap.recipient)
  if (!delivered) {
    deps.record(entry('undelivered'))
    return { phase: 'undelivered', orderId }
  }
  if (invoice === undefined) {
    deps.record(entry('placed'))
    return { phase: 'placed', orderId }
  }

  const bolt11 = invoice.value.bolt11
  const paying = { bolt11, ...(invoice.value.paymentHash === undefined ? {} : { paymentHash: invoice.value.paymentHash }), ...(invoice.value.verify === undefined ? {} : { verify: invoice.value.verify }) }
  deps.record(entry('paying', paying))
  const paid = await deps.pay(bolt11, await idempotencyKey(orderId, bolt11))
  if (paid.status !== 'paid') {
    deps.record(entry(paid.status, paying))
    return { phase: paid.status, orderId }
  }
  deps.record(entry('paid', { ...paying, ...(paid.preimage === undefined ? {} : { preimage: paid.preimage }) }))

  const receipt = buildReceipt({ seller, orderId, amount: sats, payment: { medium: 'lightning', reference: bolt11, ...(paid.preimage === undefined ? {} : { proof: paid.preimage }) } })
  const sealed = await wrapRumor(deps.signer, receipt, [seller])
  for (const wrap of sealed.wraps) await deps.publish(wrap.wrap, wrap.recipient)
  deps.record(entry('done', paying))
  return { phase: 'done', orderId }
}

/** A signer for trying the sequence out; a real buyer signs with their own key, extension or remote signer. */
export const trySigner = keySigner(generateSecretKey())
