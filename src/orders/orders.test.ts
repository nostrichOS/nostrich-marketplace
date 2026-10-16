import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { describe, expect, it } from 'vitest'

import { keySigner } from '../core/key-signer'
import { unwrapRumor, wrapRumor, type Rumor } from './gift-wrap'
import {
  buildOrder,
  buildOrderChat,
  buildPaymentRequest,
  buildReceipt,
  buildShippingUpdate,
  buildStatusUpdate,
  cancelPending,
  displayOrderId,
  newOrderId,
  orderViews,
  parseOrderRumor,
  type OrderMessage,
  type RumorTemplate,
} from './orders'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)

function rumor(template: RumorTemplate, from: string, createdAt: number): Rumor {
  return { id: `${from.slice(0, 8)}${createdAt}`.padEnd(64, '0'), pubkey: from, created_at: createdAt, kind: template.kind, tags: template.tags, content: template.content }
}

describe('orders', () => {
  const buyer = A
  const seller = B
  const stranger = C
  const orderId = 'A7K2-19'
  const placed = rumor(
    buildOrder({ seller, orderId, amount: 28000, items: [{ address: `30402:${seller}:mug`, quantity: 1 }], shipping: `30406:${seller}:std`, address: '1 Example Lane', note: 'Gift wrap' }),
    buyer,
    100,
  )

  function view(extra: Rumor[]) {
    const messages = [placed, ...extra].map(parseOrderRumor).filter((message): message is OrderMessage => message !== null)
    return orderViews(messages, 1000).get(orderId)
  }

  it('reads an order with its address, delivery and note', () => {
    const order = view([])?.order
    expect(order?.address).toBe('1 Example Lane')
    expect(order?.shipping).toBe(`30406:${seller}:std`)
    expect(order?.items).toEqual([{ address: `30402:${seller}:mug`, quantity: 1 }])
    expect(order?.note).toBe('Gift wrap')
    expect(view([])?.stage).toBe('awaiting-payment')
  })

  it('writes the tags the order flow expects', () => {
    const template = buildOrder({ seller, orderId, amount: 28000, items: [{ address: `30402:${seller}:mug`, quantity: 2 }] })
    expect(template.kind).toBe(16)
    expect(template.tags).toContainEqual(['type', '1'])
    expect(template.tags).toContainEqual(['order', orderId])
    expect(template.tags).toContainEqual(['amount', '28000'])
    expect(template.tags).toContainEqual(['item', `30402:${seller}:mug`, '2'])
    const receipt = buildReceipt({ seller, orderId, amount: 28000, payment: { medium: 'lightning', reference: 'lnbc1', proof: 'ab'.repeat(32) } })
    expect(receipt.kind).toBe(17)
    expect(receipt.tags).toContainEqual(['payment', 'lightning', 'lnbc1', 'ab'.repeat(32)])
  })

  it('walks an order from paid to completed', () => {
    const receipt = rumor(buildReceipt({ seller, orderId, amount: 28000, payment: { medium: 'lightning', reference: 'lnbc1', proof: 'ab'.repeat(32) } }), buyer, 110)
    expect(view([receipt])?.stage).toBe('paid')
    const shipped = rumor(buildShippingUpdate({ buyer, orderId, status: 'shipped', carrier: 'UPS', tracking: '1Z999AA10123456784' }), seller, 120)
    expect(view([receipt, shipped])?.stage).toBe('shipped')
    const delivered = rumor(buildShippingUpdate({ buyer, orderId, status: 'delivered' }), seller, 130)
    expect(view([receipt, shipped, delivered])?.stage).toBe('delivered')
    const completed = rumor(buildStatusUpdate({ to: seller, orderId, status: 'completed' }), buyer, 140)
    const done = view([receipt, shipped, delivered, completed])
    expect(done?.stage).toBe('completed')
    expect(done?.timeline.map(entry => entry.kind)).toEqual(['placed', 'paid', 'shipping', 'shipping', 'status'])
  })

  it('takes back a shipped update when a later one says processing', () => {
    const receipt = rumor(buildReceipt({ seller, orderId, amount: 28000, payment: { medium: 'lightning', reference: 'lnbc1' } }), buyer, 110)
    const shipped = rumor(buildShippingUpdate({ buyer, orderId, status: 'shipped' }), seller, 120)
    const undone = rumor(buildShippingUpdate({ buyer, orderId, status: 'processing' }), seller, 121)
    expect(view([receipt, shipped, undone])?.stage).toBe('processing')
  })

  it('refuses a payment request, a shipping update or a receipt from anybody but the right side', () => {
    const forgedRequest = rumor(buildPaymentRequest({ buyer, orderId, amount: 28000, payments: [{ medium: 'lightning', reference: 'lnbc-thief' }] }), stranger, 105)
    const forgedShipping = rumor(buildShippingUpdate({ buyer, orderId, status: 'delivered' }), buyer, 106)
    const forgedReceipt = rumor(buildReceipt({ seller, orderId, amount: 1, payment: { medium: 'lightning', reference: 'x' } }), seller, 107)
    const result = view([forgedRequest, forgedShipping, forgedReceipt])
    expect(result?.paymentRequest).toBeUndefined()
    expect(result?.shipping).toBeUndefined()
    expect(result?.receipt).toBeUndefined()
    expect(result?.stage).toBe('awaiting-payment')
  })

  it("flags a seller's request over the order total and expires an old one", () => {
    const over = rumor(buildPaymentRequest({ buyer, orderId, amount: 30000, payments: [{ medium: 'lightning', reference: 'lnbc2' }], expiration: 2000 }), seller, 105)
    expect(view([over])?.paymentRequest?.overOrder).toBe(true)
    expect(view([over])?.stage).toBe('payment-requested')
    const stale = rumor(buildPaymentRequest({ buyer, orderId, amount: 28000, payments: [{ medium: 'lightning', reference: 'lnbc3' }], expiration: 500 }), seller, 106)
    expect(view([stale])?.paymentRequest?.expired).toBe(true)
    expect(view([stale])?.stage).toBe('awaiting-payment')
  })

  it('keeps nothing about an order until its order message is open', () => {
    const early = rumor(buildShippingUpdate({ buyer, orderId, status: 'shipped' }), seller, 120)
    const alone = orderViews([parseOrderRumor(early)].filter((message): message is OrderMessage => message !== null), 1000).get(orderId)
    expect(alone?.order).toBeUndefined()
    expect(alone?.shipping).toBeUndefined()
  })

  it('reads a cancellation that refunded the buyer', () => {
    const cancelled = rumor(buildStatusUpdate({ to: buyer, orderId, status: 'cancelled', refund: { medium: 'lightning', reference: 'lnbc4', proof: 'cd'.repeat(32), amount: 28000 } }), seller, 150)
    const result = view([cancelled])
    expect(result?.stage).toBe('cancelled')
    expect(result?.status?.refund?.amount).toBe(28000)
  })

  it('lets a buyer cancel an order nobody paid', () => {
    const cancelled = rumor(buildStatusUpdate({ to: seller, orderId, status: 'cancelled' }), buyer, 105)
    expect(view([cancelled])?.stage).toBe('cancelled')
  })

  it('reads a buyer’s cancel of a paid order as a request, since only the seller can send the money back', () => {
    const receipt = rumor(buildReceipt({ seller, orderId, amount: 28000, payment: { medium: 'lightning', reference: 'lnbc1', proof: 'ab'.repeat(32) } }), buyer, 110)
    const cancelled = rumor(buildStatusUpdate({ to: seller, orderId, status: 'cancelled', note: 'changed my mind' }), buyer, 115)
    const result = view([receipt, cancelled])
    expect(result?.stage).toBe('paid')
    expect(result?.cancelAsked).toEqual({ at: 115, note: 'changed my mind' })
    expect(result !== undefined && cancelPending(result)).toBe(true)
  })

  it('reads a request to cancel sent as an order message, from the buyer only', () => {
    const receipt = rumor(buildReceipt({ seller, orderId, amount: 28000, payment: { medium: 'lightning', reference: 'lnbc1' } }), buyer, 110)
    const template = buildOrderChat({ to: seller, orderId, content: 'Please cancel this order.', asksToCancel: true })
    expect(template.kind).toBe(14)
    expect(template.tags).toContainEqual(['request', 'cancel'])
    expect(view([receipt, rumor(template, buyer, 116)])?.cancelAsked).toEqual({ at: 116, note: 'Please cancel this order.' })
    expect(view([receipt, rumor(template, seller, 117)])?.cancelAsked).toBeUndefined()
    expect(view([receipt, rumor(template, stranger, 117)])?.cancelAsked).toBeUndefined()
  })

  it('reads order chat by its order tag or by its subject', () => {
    const tagged = parseOrderRumor(rumor(buildOrderChat({ to: seller, orderId, content: 'hi' }), buyer, 111))
    expect(tagged).toMatchObject({ type: 'chat', orderId, tagged: true })
    const bySubject = parseOrderRumor({ id: '1'.repeat(64), pubkey: seller, created_at: 1, kind: 14, tags: [['p', buyer], ['subject', orderId]], content: 'packed' })
    expect(bySubject).toMatchObject({ type: 'chat', orderId, tagged: false })
    expect(parseOrderRumor({ id: '2'.repeat(64), pubkey: seller, created_at: 1, kind: 14, tags: [['p', buyer]], content: 'hello' })).toBeNull()
  })

  it('makes short order ids, and shows long ones compactly', () => {
    expect(newOrderId()).toMatch(/^[2-9A-HJ-NP-Z]{4}-\d{2}$/u)
    expect(displayOrderId('A7K2-19')).toBe('#A7K2-19')
    expect(displayOrderId('3f2a9c1e-77aa-4b1e-9d11-0a0b0c0d0e0f')).toBe('#3F2A9C1E')
  })
})

describe('gift wrapping', () => {
  it('seals an order for the seller and the buyer, and each opens the same rumor', async () => {
    const buyerKey = generateSecretKey()
    const sellerKey = generateSecretKey()
    const sellerPub = getPublicKey(sellerKey)
    const template = buildOrder({ seller: sellerPub, orderId: 'A7K2-19', amount: 28000, items: [{ address: `30402:${sellerPub}:mug`, quantity: 1 }] })
    const { rumor: sealed, wraps } = await wrapRumor(keySigner(buyerKey), template, [sellerPub], { sentAt: 1_790_000_000 })
    expect(wraps).toHaveLength(2)
    const forSeller = wraps.find(wrap => wrap.recipient === sellerPub)
    const opened = forSeller === undefined ? null : await unwrapRumor(keySigner(sellerKey), forSeller.wrap)
    expect(opened?.rumor.id).toBe(sealed.id)
    expect(opened?.rumor.kind).toBe(16)
    const again = await wrapRumor(keySigner(buyerKey), template, [sellerPub], { sentAt: 1_790_000_000 })
    expect(again.rumor.id).toBe(sealed.id)
  })

  it('opens nothing addressed to somebody else', async () => {
    const sellerPub = getPublicKey(generateSecretKey())
    const template = buildOrder({ seller: sellerPub, orderId: 'A7K2-19', amount: 1, items: [] })
    const { wraps } = await wrapRumor(keySigner(generateSecretKey()), template, [sellerPub])
    const forSeller = wraps.find(wrap => wrap.recipient === sellerPub)
    expect(forSeller === undefined ? 'missing' : await unwrapRumor(keySigner(generateSecretKey()), forSeller.wrap)).toBeNull()
  })
})
