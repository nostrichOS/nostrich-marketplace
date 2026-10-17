/** A seller: answer an order with a payment request, then a status and a shipping update. */

import type { Signer } from '../src/core/types'
import { wrapRumor } from '../src/orders/gift-wrap'
import { buildPaymentRequest, buildShippingUpdate, buildStatusUpdate, type OrderView } from '../src/orders/orders'
import { decodeBolt11 } from '../src/payments/lnurl'

/** Asks the buyer to pay this invoice; `expiration` is the invoice's own expiry, read from the invoice. */
export async function requestPayment(seller: Signer, view: OrderView, bolt11: string) {
  if (view.buyer === undefined || view.order === undefined) throw new Error('the order message has not been read yet')
  const invoice = decodeBolt11(bolt11)
  const expiration = invoice === null ? undefined : invoice.timestamp + invoice.expirySeconds
  const payments = [{ medium: 'lightning', reference: bolt11 }]
  return wrapRumor(seller, buildPaymentRequest({ buyer: view.buyer, orderId: view.orderId, amount: view.order.amount, payments, ...(expiration === undefined ? {} : { expiration }) }), [view.buyer])
}

/** Says the payment arrived, then that the order is on its way. */
export async function confirmAndShip(seller: Signer, view: OrderView, carrier: string, tracking: string) {
  if (view.buyer === undefined) throw new Error('the order message has not been read yet')
  const confirmed = await wrapRumor(seller, buildStatusUpdate({ to: view.buyer, orderId: view.orderId, status: 'confirmed' }), [view.buyer])
  const shipped = await wrapRumor(seller, buildShippingUpdate({ buyer: view.buyer, orderId: view.orderId, status: 'shipped', carrier, tracking }), [view.buyer])
  return [confirmed, shipped]
}
