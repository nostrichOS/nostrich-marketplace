import { describe, expect, it } from 'vitest'

import { idempotencyKey, paymentComment } from './checkout'
import { judgeOnchain, type ChainPayment } from './onchain'

const ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
const TX = 'f'.repeat(64)

const judge = (chain: ChainPayment | undefined, extra: Partial<Parameters<typeof judgeOnchain>[0]> = {}) =>
  judgeOnchain({ orderId: 'A7K2-19', amount: 50_000, orderAt: 1_000_000, address: ADDRESS, chain, mine: new Set([ADDRESS]), claims: new Map(), ...extra })

describe('an on-chain payment, as the seller sees it', () => {
  it('is verified only at three confirmations, to the seller’s own address, for the whole amount', () => {
    expect(judge({ txid: TX, sats: 50_000, confirmations: 3, confirmedAt: 1_000_100 })).toEqual({ kind: 'verified', confirmations: 3 })
    expect(judge({ txid: TX, sats: 50_000, confirmations: 1, confirmedAt: 1_000_100 })).toEqual({ kind: 'confirming', confirmations: 1 })
    expect(judge({ txid: TX, sats: 40_000, confirmations: 3 })).toEqual({ kind: 'short', sats: 40_000 })
    expect(judge(undefined)).toEqual({ kind: 'unknown' })
    expect(judge({ txid: TX, sats: 50_000, confirmations: 3 }, { mine: new Set(['bc1qsomebodyelse']) })).toMatchObject({ kind: 'not-yours' })
  })

  it('refuses a transaction another order claims, or one confirmed before the order', () => {
    expect(judge({ txid: TX, sats: 50_000, confirmations: 3 }, { claims: new Map([[TX, ['A7K2-19', 'B8L3-20']]]) })).toEqual({ kind: 'shared', orders: ['B8L3-20'] })
    expect(judge({ txid: TX, sats: 50_000, confirmations: 3, confirmedAt: 900_000 })).toEqual({ kind: 'early' })
  })
})

describe('checkout pieces', () => {
  it('gives one order and one invoice one stable key, shaped as a UUID', async () => {
    const key = await idempotencyKey('A7K2-19', 'lnbc1')
    expect(key).toBe(await idempotencyKey('A7K2-19', 'lnbc1'))
    expect(key).not.toBe(await idempotencyKey('A7K2-19', 'lnbc2'))
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  })

  it('names the order and the item in the seller’s wallet', () => {
    expect(paymentComment('A7K2-19', 'Mug', 2)).toBe('Nostrich order #A7K2-19: Mug ×2')
  })
})
