/** A buyer: build an order, gift-wrap it, and read every reply back into one order view. */

import type { Hex, NostrEvent, Signer } from '../src/core/types'
import { unwrapRumor, wrapRumor } from '../src/orders/gift-wrap'
import { buildOrder, orderViews, parseOrderRumor, type OrderMessage, type OrderView } from '../src/orders/orders'
import { routeRumor } from '../src/orders/route'

/** The wraps to publish: one for the seller, one for the buyer’s own copy. */
export async function placeOrder(buyer: Signer, seller: Hex, orderId: string, listing: string, sats: number) {
  const template = buildOrder({ seller, orderId, amount: sats, items: [{ address: listing, quantity: 1 }], address: '1 Example Lane' })
  return wrapRumor(buyer, template, [seller])
}

/** Opens every gift wrap from the inbox and keeps the order messages, one view per order. */
export async function readOrders(reader: Signer, wraps: readonly NostrEvent[]): Promise<Map<string, OrderView>> {
  const messages: OrderMessage[] = []
  for (const wrap of wraps) {
    const opened = await unwrapRumor(reader, wrap)
    if (opened === null || routeRumor(opened.rumor) === 'chat' || routeRumor(opened.rumor) === 'none') continue
    const message = parseOrderRumor(opened.rumor)
    if (message !== null) messages.push(message)
  }
  return orderViews(messages)
}
