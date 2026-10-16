/** On-chain payments: what a seller may believe about a receipt, read from the public chain. */

import { ONCHAIN_CONFIRMATIONS } from '../listings/bitcoin-address'
import { bitcoinPayment, bitcoinProof, type OrderView } from '../orders/orders'
type OrderRow = { view: OrderView }

export interface ChainPayment {
  txid: string
  /** What the transaction pays the address, in sats (every output to it). */
  sats: number
  /** 0 while it waits in the mempool. */
  confirmations: number
  /** The confirming block's time, in seconds. */
  confirmedAt?: number
}
const ORDER_SLACK_S = 2 * 60 * 60

const sameAddress = (a: string, b: string): boolean => (/^bc1/iu.test(a) ? a.toLowerCase() === b.toLowerCase() : a === b)

export type OnchainVerdict =
  /** The receipt names no transaction and none was found, or no explorer answered. */
  | { kind: 'unknown' }
  /** Paid to an address that is not the seller's. */
  | { kind: 'not-yours'; address: string }
  /** The transaction pays the address less than the order. */
  | { kind: 'short'; sats: number }
  /** More than one of the seller's orders claims this transaction. */
  | { kind: 'shared'; orders: string[] }
  /** Confirmed before the order was placed. */
  | { kind: 'early' }
  | { kind: 'confirming'; confirmations: number }
  | { kind: 'verified'; confirmations: number }

export interface JudgeInput {
  orderId: string
  /** What the order is for, in sats. */
  amount: number
  /** The order message's own time, in seconds. */
  orderAt: number
  address: string
  chain: ChainPayment | undefined
  /** The seller's own addresses. */
  mine: ReadonlySet<string>
  /** Transaction id → the seller's orders whose receipts name it. */
  claims: ReadonlyMap<string, readonly string[]>
}

/** What a seller may believe about an on-chain payment, from the chain and the seller’s own orders. */
export function judgeOnchain(input: JudgeInput): OnchainVerdict {
  const mine = [...input.mine].some(address => sameAddress(address, input.address))
  if (!mine) return { kind: 'not-yours', address: input.address }
  const chain = input.chain
  if (chain === undefined) return { kind: 'unknown' }
  const claimed = input.claims.get(chain.txid) ?? []
  if (claimed.some(orderId => orderId !== input.orderId)) return { kind: 'shared', orders: claimed.filter(orderId => orderId !== input.orderId) }
  if (chain.sats < input.amount) return { kind: 'short', sats: chain.sats }
  if (chain.confirmedAt !== undefined && chain.confirmedAt < input.orderAt - ORDER_SLACK_S) return { kind: 'early' }
  if (chain.confirmations < ONCHAIN_CONFIRMATIONS) return { kind: 'confirming', confirmations: chain.confirmations }
  return { kind: 'verified', confirmations: chain.confirmations }
}

/** Every transaction the seller's orders claim, and which orders claim it. */
export function claimsOf(rows: readonly Pick<OrderRow, 'view'>[]): Map<string, string[]> {
  const claims = new Map<string, string[]>()
  for (const row of rows) {
    const txid = row.view.receipt === undefined ? undefined : bitcoinProof(row.view.receipt)?.txid
    if (txid === undefined) continue
    claims.set(txid, [...(claims.get(txid) ?? []), row.view.orderId])
  }
  return claims
}

export interface OnchainOrder {
  address: string
  /** The transaction the receipt names, or the one found paying the address for this order. */
  txid?: string
  chain?: ChainPayment
}

/** An order whose receipt says it was paid on-chain: the address, and the transaction when the buyer's side sent one. */
export function onchainReceipt(view: Pick<OrderView, 'receipt'>): { address: string; txid?: string } | undefined {
  return view.receipt === undefined ? undefined : bitcoinProof(view.receipt)
}

/** Whether an order paid on-chain is still short of its confirmations. */
export function isConfirming(view: Pick<OrderView, 'receipt' | 'stage'>, onchain: OnchainOrder | undefined): boolean {
  if (view.stage !== 'paid' || onchainReceipt(view) === undefined) return false
  return (onchain?.chain?.confirmations ?? 0) < ONCHAIN_CONFIRMATIONS
}

/** The rule for one of the seller's orders, or undefined when it was not paid on-chain. */
export function sellerVerdict(
  row: Pick<OrderRow, 'view'>,
  onchain: OnchainOrder | undefined,
  mine: ReadonlySet<string>,
  claims: ReadonlyMap<string, readonly string[]>,
): OnchainVerdict | undefined {
  const proof = onchainReceipt(row.view)
  if (proof === undefined) return undefined
  const asked = row.view.paymentRequest === undefined ? undefined : bitcoinPayment(row.view.paymentRequest)
  return judgeOnchain({
    orderId: row.view.orderId,
    amount: row.view.order?.amount ?? row.view.receipt?.amount ?? 0,
    orderAt: row.view.order?.createdAt ?? 0,
    address: proof.address,
    chain: onchain?.chain,
    mine: asked === undefined ? mine : new Set([...mine, asked]),
    claims,
  })
}
