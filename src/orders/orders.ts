/** Order messages: kind 16 types 1 to 4, the kind 17 receipt and kind 14 order chat, built and read. */

import type { Rumor } from './gift-wrap'
import type { Hex } from '../core/types'
import { mainnetBitcoinAddress } from '../listings/bitcoin-address'

export const ORDER_KIND = 16
export const RECEIPT_KIND = 17
export const ORDER_CHAT_KIND = 14

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled'
export type ShippingStatus = 'processing' | 'shipped' | 'delivered' | 'exception'

const ORDER_STATUSES = new Set<OrderStatus>(['pending', 'confirmed', 'processing', 'completed', 'cancelled'])
const SHIPPING_STATUSES = new Set<ShippingStatus>(['processing', 'shipped', 'delivered', 'exception'])

export interface OrderItem {
  /** `30402:<pubkey>:<d>`. */
  address: string
  quantity: number
}

export interface PaymentMethod {
  /** lightning, bitcoin, ecash, fiat… */
  medium: string
  /** An invoice, a lightning address, an on-chain address… */
  reference: string
  /** The preimage, a txid… */
  proof?: string
}

interface MessageBase {
  rumorId: Hex
  from: Hex
  /** The rumor's `p` tags. */
  to: Hex[]
  createdAt: number
  orderId: string
  /** The rumor's content: order notes, payment instructions, a human-readable update. */
  note: string
}

export interface OrderPlaced extends MessageBase {
  type: 'order'
  amount: number
  items: OrderItem[]
  /** `30406:<pubkey>:<d>`. */
  shipping?: string
  address?: string
  email?: string
  phone?: string
}

export interface PaymentRequest extends MessageBase {
  type: 'payment-request'
  amount: number
  payments: PaymentMethod[]
  expiration?: number
}

export interface StatusUpdate extends MessageBase {
  type: 'status'
  status: OrderStatus
  /** Ours only: a cancellation that paid the buyer back. */
  refund?: PaymentMethod & { amount?: number }
}

export interface ShippingUpdate extends MessageBase {
  type: 'shipping'
  status: ShippingStatus
  tracking?: string
  carrier?: string
  eta?: number
}

export interface PaymentReceipt extends MessageBase {
  type: 'receipt'
  amount: number
  payments: PaymentMethod[]
}

export interface OrderChat extends MessageBase {
  type: 'chat'
  /** True when the order id came from our own `order` tag rather than only the subject. */
  tagged: boolean
  asksToCancel?: true
}

export type OrderMessage = OrderPlaced | PaymentRequest | StatusUpdate | ShippingUpdate | PaymentReceipt | OrderChat

/** What `wrapRumor` seals: an unsigned event without its author, which the seal supplies. */
export interface RumorTemplate {
  kind: number
  tags: string[][]
  content: string
}

/** Read one decrypted rumor as an order message, or null when it is not one. */
export function parseOrderRumor(rumor: Rumor): OrderMessage | null {
  const base = (orderId: string): MessageBase => ({
    rumorId: rumor.id,
    from: rumor.pubkey,
    to: pTags(rumor.tags),
    createdAt: rumor.created_at,
    orderId,
    note: rumor.content,
  })
  const orderTag = tag(rumor.tags, 'order')

  if (rumor.kind === ORDER_CHAT_KIND) {
    const subject = tag(rumor.tags, 'subject')
    const orderId = orderTag ?? subject
    if (orderId === undefined || orderId === '') return null
    const chat: OrderChat = { ...base(orderId), type: 'chat', tagged: orderTag !== undefined }
    if (rumor.tags.some(row => row[0] === 'request' && row[1] === 'cancel')) chat.asksToCancel = true
    return chat
  }

  if (orderTag === undefined || orderTag === '') return null

  if (rumor.kind === RECEIPT_KIND) {
    return { ...base(orderTag), type: 'receipt', amount: sats(tag(rumor.tags, 'amount')), payments: payments(rumor.tags, 'payment') }
  }

  if (rumor.kind !== ORDER_KIND) return null
  const type = tag(rumor.tags, 'type')
  if (type === '1') {
    const items: OrderItem[] = []
    for (const row of rumor.tags) {
      if (row[0] !== 'item' || row[1] === undefined || row[1].trim() === '') continue
      const quantity = Number(row[2] ?? '1')
      items.push({ address: row[1].trim(), quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1 })
    }
    const placed: OrderPlaced = { ...base(orderTag), type: 'order', amount: sats(tag(rumor.tags, 'amount')), items }
    const shipping = tag(rumor.tags, 'shipping')
    if (shipping) placed.shipping = shipping
    const address = tag(rumor.tags, 'address')
    if (address) placed.address = address
    const email = tag(rumor.tags, 'email')
    if (email) placed.email = email
    const phone = tag(rumor.tags, 'phone')
    if (phone) placed.phone = phone
    return placed
  }
  if (type === '2') {
    const request: PaymentRequest = { ...base(orderTag), type: 'payment-request', amount: sats(tag(rumor.tags, 'amount')), payments: payments(rumor.tags, 'payment') }
    const expiration = Number(tag(rumor.tags, 'expiration'))
    if (Number.isInteger(expiration) && expiration > 0) request.expiration = expiration
    return request
  }
  if (type === '3') {
    const status = tag(rumor.tags, 'status')?.toLowerCase() as OrderStatus | undefined
    if (status === undefined || !ORDER_STATUSES.has(status)) return null
    const update: StatusUpdate = { ...base(orderTag), type: 'status', status }
    const refund = rumor.tags.find(row => row[0] === 'refund' && row[1] !== undefined && row[2] !== undefined)
    if (refund !== undefined) {
      update.refund = { medium: refund[1] ?? '', reference: refund[2] ?? '' }
      if (refund[3]) update.refund.proof = refund[3]
      const amount = sats(tag(rumor.tags, 'amount'))
      if (amount > 0) update.refund.amount = amount
    }
    return update
  }
  if (type === '4') {
    const status = tag(rumor.tags, 'status')?.toLowerCase() as ShippingStatus | undefined
    if (status === undefined || !SHIPPING_STATUSES.has(status)) return null
    const update: ShippingUpdate = { ...base(orderTag), type: 'shipping', status }
    const tracking = tag(rumor.tags, 'tracking')
    if (tracking) update.tracking = tracking
    const carrier = tag(rumor.tags, 'carrier')
    if (carrier) update.carrier = carrier
    const eta = Number(tag(rumor.tags, 'eta'))
    if (Number.isInteger(eta) && eta > 0) update.eta = eta
    return update
  }
  return null
}

export interface OrderInput {
  seller: Hex
  orderId: string
  /** Everything the buyer is paying, delivery included, in sats. */
  amount: number
  items: readonly OrderItem[]
  shipping?: string
  address?: string
  email?: string
  phone?: string
  note?: string
}

/** A type 1 order: the items, the total in sats, the delivery option, and the buyer’s details. */
export function buildOrder(input: OrderInput): RumorTemplate {
  const tags: string[][] = [
    ['p', input.seller],
    ['subject', `Order ${displayOrderId(input.orderId)}`],
    ['type', '1'],
    ['order', input.orderId],
    ['amount', String(Math.round(input.amount))],
  ]
  for (const item of input.items) tags.push(['item', item.address, String(Math.max(1, Math.floor(item.quantity)))])
  if (input.shipping) tags.push(['shipping', input.shipping])
  if (input.address?.trim()) tags.push(['address', input.address.trim()])
  if (input.email?.trim()) tags.push(['email', input.email.trim()])
  if (input.phone?.trim()) tags.push(['phone', input.phone.trim()])
  return { kind: ORDER_KIND, tags, content: input.note?.trim() ?? '' }
}

/** A type 2 payment request from the seller: an amount and how to pay it. */
export function buildPaymentRequest(input: {
  buyer: Hex
  orderId: string
  amount: number
  payments: readonly PaymentMethod[]
  expiration?: number
  note?: string
}): RumorTemplate {
  const tags: string[][] = [
    ['p', input.buyer],
    ['subject', 'order-payment'],
    ['type', '2'],
    ['order', input.orderId],
    ['amount', String(Math.round(input.amount))],
  ]
  for (const payment of input.payments) tags.push(['payment', payment.medium, payment.reference])
  if (input.expiration !== undefined) tags.push(['expiration', String(input.expiration)])
  return { kind: ORDER_KIND, tags, content: input.note?.trim() ?? '' }
}

/** A type 3 status update: pending, confirmed, processing, completed or cancelled. */
export function buildStatusUpdate(input: {
  to: Hex
  orderId: string
  status: OrderStatus
  note?: string
  refund?: PaymentMethod & { amount?: number }
}): RumorTemplate {
  const tags: string[][] = [
    ['p', input.to],
    ['subject', 'order-info'],
    ['type', '3'],
    ['order', input.orderId],
    ['status', input.status],
  ]
  if (input.refund !== undefined) {
    const row = ['refund', input.refund.medium, input.refund.reference]
    if (input.refund.proof) row.push(input.refund.proof)
    tags.push(row)
    if (input.refund.amount !== undefined) tags.push(['amount', String(Math.round(input.refund.amount))])
  }
  return { kind: ORDER_KIND, tags, content: input.note?.trim() ?? '' }
}

/** A type 4 shipping update, with tracking when there is any. */
export function buildShippingUpdate(input: {
  buyer: Hex
  orderId: string
  status: ShippingStatus
  tracking?: string
  carrier?: string
  eta?: number
  note?: string
}): RumorTemplate {
  const tags: string[][] = [
    ['p', input.buyer],
    ['subject', 'shipping-info'],
    ['type', '4'],
    ['order', input.orderId],
    ['status', input.status],
  ]
  if (input.tracking?.trim()) tags.push(['tracking', input.tracking.trim()])
  if (input.carrier?.trim()) tags.push(['carrier', input.carrier.trim()])
  if (input.eta !== undefined) tags.push(['eta', String(input.eta)])
  return { kind: ORDER_KIND, tags, content: input.note?.trim() ?? '' }
}

/** The buyer’s kind 17 receipt: what was paid, and the preimage or transaction that proves it. */
export function buildReceipt(input: {
  seller: Hex
  orderId: string
  amount: number
  payment: PaymentMethod
  note?: string
}): RumorTemplate {
  const payment = ['payment', input.payment.medium, input.payment.reference]
  if (input.payment.proof) payment.push(input.payment.proof)
  return {
    kind: RECEIPT_KIND,
    tags: [['p', input.seller], ['subject', 'order-receipt'], ['order', input.orderId], payment, ['amount', String(Math.round(input.amount))]],
    content: input.note?.trim() ?? '',
  }
}

/** A kind 14 message about an order; `asksToCancel` marks a request to cancel a paid order. */
export function buildOrderChat(input: { to: Hex; orderId: string; content: string; asksToCancel?: boolean }): RumorTemplate {
  const tags = [['p', input.to], ['subject', input.orderId], ['order', input.orderId]]
  if (input.asksToCancel === true) tags.push(['request', 'cancel'])
  return {
    kind: ORDER_CHAT_KIND,
    tags,
    content: input.content,
  }
}

/** No 0/O, 1/I: an id somebody may read out over the phone. */
const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/** `A7K2-19`: short enough to say, and 104 million of them. */
export function newOrderId(random: (bound: number) => number = cryptoBelow): string {
  let head = ''
  for (let index = 0; index < 4; index += 1) head += ID_ALPHABET[random(ID_ALPHABET.length)]
  return `${head}-${String(random(100)).padStart(2, '0')}`
}

/** `#A7K2-19` for ours; another client's UUID shows as its first eight characters. */
export function displayOrderId(orderId: string): string {
  if (/^[A-Z0-9]{4}-\d{2}$/u.test(orderId)) return `#${orderId}`
  const compact = orderId.replace(/[^a-zA-Z0-9]/gu, '').slice(0, 8).toUpperCase()
  return `#${compact || orderId.slice(0, 8)}`
}

export type OrderStage =
  | 'awaiting-payment'
  | 'payment-requested'
  | 'paid'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'exception'
  | 'completed'
  | 'cancelled'

export type TimelineEntry =
  | { kind: 'placed'; at: number; by: Hex }
  | { kind: 'requested'; at: number; amount: number; expiration?: number }
  | { kind: 'paid'; at: number; amount: number }
  | { kind: 'status'; at: number; by: Hex; status: OrderStatus; note: string; refund?: StatusUpdate['refund'] }
  | { kind: 'shipping'; at: number; status: ShippingStatus; carrier?: string; tracking?: string; note: string }

/** One order as its messages say, read from the side of whoever is reading it. */
export interface OrderView {
  orderId: string
  /** Absent until the type-1 message itself has been opened; nothing else is trusted before it. */
  order?: OrderPlaced
  buyer?: Hex
  seller?: Hex
  paymentRequest?: PaymentRequest & { expired: boolean; overOrder: boolean }
  receipt?: PaymentReceipt
  status?: StatusUpdate
  shipping?: ShippingUpdate
  chats: OrderChat[]
  timeline: TimelineEntry[]
  stage: OrderStage
  lastActivity: number
  cancelAsked?: { at: number; note: string }
}

/** Every order the reader is part of, from every decrypted rumor, keyed by order id. */
export function orderViews(messages: readonly OrderMessage[], now = Math.floor(Date.now() / 1000)): Map<string, OrderView> {
  const byId = new Map<string, OrderMessage[]>()
  const seen = new Set<Hex>()
  for (const message of messages) {
    if (seen.has(message.rumorId)) continue
    seen.add(message.rumorId)
    const list = byId.get(message.orderId)
    if (list === undefined) byId.set(message.orderId, [message])
    else list.push(message)
  }
  const views = new Map<string, OrderView>()
  for (const [orderId, list] of byId) views.set(orderId, orderView(orderId, list, now))
  return views
}

/** Builds one order’s view, trusting each message only from the person allowed to send it. */
export function orderView(orderId: string, messages: readonly OrderMessage[], now = Math.floor(Date.now() / 1000)): OrderView {
  const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt || (a.rumorId < b.rumorId ? -1 : 1))
  const order = sorted.find((message): message is OrderPlaced => message.type === 'order')
  const view: OrderView = { orderId, chats: [], timeline: [], stage: 'awaiting-payment', lastActivity: 0 }
  if (order === undefined) {
    view.lastActivity = sorted.at(-1)?.createdAt ?? 0
    return view
  }
  const buyer = order.from
  const seller = order.to[0]
  const paidByBuyer = sorted.some(message => message.type === 'receipt' && message.from === buyer)
  view.order = order
  view.buyer = buyer
  if (seller !== undefined) view.seller = seller
  view.timeline.push({ kind: 'placed', at: order.createdAt, by: buyer })
  view.lastActivity = order.createdAt

  for (const message of sorted) {
    if (message === order) continue
    const fromSeller = seller !== undefined && message.from === seller
    const fromBuyer = message.from === buyer
    if (!fromSeller && !fromBuyer) continue
    switch (message.type) {
      case 'order':
        continue
      case 'payment-request': {
        if (!fromSeller) continue
        view.paymentRequest = {
          ...message,
          expired: message.expiration !== undefined && message.expiration <= now,
          overOrder: order.amount > 0 && message.amount > order.amount,
        }
        view.timeline.push({ kind: 'requested', at: message.createdAt, amount: message.amount, ...(message.expiration === undefined ? {} : { expiration: message.expiration }) })
        break
      }
      case 'receipt': {
        if (!fromBuyer) continue
        view.receipt = message
        view.timeline.push({ kind: 'paid', at: message.createdAt, amount: message.amount })
        break
      }
      case 'status': {
        if (fromBuyer && message.status === 'cancelled' && paidByBuyer) {
          view.cancelAsked = { at: message.createdAt, note: message.note }
          break
        }
        view.status = message
        view.timeline.push({
          kind: 'status',
          at: message.createdAt,
          by: message.from,
          status: message.status,
          note: message.note,
          ...(message.refund === undefined ? {} : { refund: message.refund }),
        })
        break
      }
      case 'shipping': {
        if (!fromSeller) continue
        view.shipping = message
        view.timeline.push({
          kind: 'shipping',
          at: message.createdAt,
          status: message.status,
          note: message.note,
          ...(message.carrier === undefined ? {} : { carrier: message.carrier }),
          ...(message.tracking === undefined ? {} : { tracking: message.tracking }),
        })
        break
      }
      case 'chat': {
        view.chats.push(message)
        if (fromBuyer && message.asksToCancel === true) view.cancelAsked = { at: message.createdAt, note: message.note }
        break
      }
    }
    view.lastActivity = Math.max(view.lastActivity, message.createdAt)
  }
  view.stage = stageOf(view)
  return view
}

function stageOf(view: OrderView): OrderStage {
  const status = view.status?.status
  if (status === 'cancelled') return 'cancelled'
  if (status === 'completed') return 'completed'
  const shipping = view.shipping?.status
  if (shipping === 'delivered') return 'delivered'
  if (shipping === 'exception') return 'exception'
  if (shipping === 'shipped') return 'shipped'
  if (view.receipt !== undefined) {
    if (status === 'processing' || shipping === 'processing') return 'processing'
    if (status === 'confirmed') return 'confirmed'
    return 'paid'
  }
  if (view.paymentRequest !== undefined && !view.paymentRequest.expired) return 'payment-requested'
  if (status === 'confirmed' || status === 'processing') return 'confirmed'
  return 'awaiting-payment'
}

/** Whether the buyer’s request to cancel still waits on the seller. */
export function cancelPending(view: Pick<OrderView, 'cancelAsked' | 'stage'>): boolean {
  if (view.cancelAsked === undefined) return false
  return view.stage === 'awaiting-payment' || view.stage === 'payment-requested' || view.stage === 'paid' || view.stage === 'confirmed' || view.stage === 'processing'
}

/** Whether the buyer has done their part: a receipt from them, whatever the seller said since. */
export function isPaid(view: Pick<OrderView, 'receipt'>): boolean {
  return view.receipt !== undefined
}

/** Whether the lightning receipt carries a preimage, the only proof of payment a receipt can hold. */
export function receiptProof(receipt: PaymentReceipt): { invoice: string; preimage?: string } | undefined {
  const lightning = receipt.payments.find(payment => payment.medium === 'lightning')
  if (lightning === undefined) return undefined
  return lightning.proof ? { invoice: lightning.reference, preimage: lightning.proof } : { invoice: lightning.reference }
}

/** The lightning invoice or address a payment request asks for, if any. */
export function lightningPayment(request: Pick<PaymentRequest, 'payments'>): string | undefined {
  return request.payments.find(payment => payment.medium === 'lightning' && payment.reference.trim() !== '')?.reference.trim()
}

/** A payment to a Bitcoin address, as the order messages name it: `bitcoin`, and `btc` as two sellers' listings spell it. */
const isOnchain = (payment: PaymentMethod): boolean => payment.medium.trim().toLowerCase() === 'bitcoin' || payment.medium.trim().toLowerCase() === 'btc'

/** The Bitcoin address a payment request asks to be paid at, when it passes its checksum. */
export function bitcoinPayment(request: Pick<PaymentRequest, 'payments'>): string | undefined {
  for (const payment of request.payments) {
    if (!isOnchain(payment)) continue
    const address = mainnetBitcoinAddress(payment.reference)
    if (address !== undefined) return address
  }
  return undefined
}

/** What an on-chain receipt says was paid: the address, and the transaction when the buyer's side knew it. */
export function bitcoinProof(receipt: Pick<PaymentReceipt, 'payments'>): { address: string; txid?: string } | undefined {
  const onchain = receipt.payments.find(isOnchain)
  if (onchain === undefined) return undefined
  const txid = onchain.proof?.trim().toLowerCase()
  return txid !== undefined && /^[0-9a-f]{64}$/u.test(txid) ? { address: onchain.reference.trim(), txid } : { address: onchain.reference.trim() }
}

function tag(tags: readonly string[][], name: string): string | undefined {
  const value = tags.find(row => row[0] === name)?.[1]
  return value === undefined ? undefined : value.trim()
}

function pTags(tags: readonly string[][]): Hex[] {
  const out: Hex[] = []
  for (const row of tags) if (row[0] === 'p' && row[1] !== undefined && /^[0-9a-f]{64}$/u.test(row[1]) && !out.includes(row[1])) out.push(row[1])
  return out
}

function payments(tags: readonly string[][], name: string): PaymentMethod[] {
  const out: PaymentMethod[] = []
  for (const row of tags) {
    if (row[0] !== name || row[1] === undefined || row[2] === undefined) continue
    const method: PaymentMethod = { medium: row[1].trim().toLowerCase(), reference: row[2].trim() }
    if (row[3] !== undefined && row[3].trim() !== '') method.proof = row[3].trim()
    out.push(method)
  }
  return out
}

function sats(value: string | undefined): number {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0
}

function cryptoBelow(bound: number): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return (buffer[0] ?? 0) % bound
}
