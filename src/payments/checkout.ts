/** Small pieces of checkout: the payment comment, a stable payment key, and the preimage check. */

import { decodeBolt11, paymentHashOfPreimage } from './lnurl'
import { displayOrderId } from '../orders/orders'

/** What the seller's wallet shows beside the payment: the order and the item. */
export function paymentComment(orderId: string, title: string, quantity: number): string {
  const item = title.length > 60 ? `${title.slice(0, 59).trimEnd()}…` : title
  return `Nostrich order ${displayOrderId(orderId)}: ${item}${quantity > 1 ? ` ×${quantity}` : ''}`
}

/** One stable key per order and invoice, so a retried payment is never paid twice. */
export async function idempotencyKey(orderId: string, bolt11: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nostrich-order:${orderId}:${bolt11}`)))
  const hex = [...digest.slice(0, 16)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  const v = `${hex.slice(0, 12)}4${hex.slice(13, 16)}${((parseInt(hex[16] ?? '8', 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 32)}`
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`
}

/** A preimage belongs to an invoice when it hashes to the invoice's payment hash. */
export function preimageMatches(bolt11: string, preimage: string): boolean {
  const invoice = decodeBolt11(bolt11)
  if (invoice?.paymentHash === undefined) return false
  try {
    return paymentHashOfPreimage(preimage) === invoice.paymentHash
  } catch {
    return false
  }
}
