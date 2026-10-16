import { describe, expect, it } from 'vitest'

import type { Rumor } from './gift-wrap'
import { buildOrder } from './orders'
import { routeRumor, withoutOrderChat } from './route'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

describe('which rumors are orders', () => {
  it('sends orders and receipts to orders, order chat too, and a subject-only message to both', () => {
    expect(routeRumor({ kind: 16, tags: [] })).toBe('orders')
    expect(routeRumor({ kind: 17, tags: [] })).toBe('orders')
    expect(routeRumor({ kind: 14, tags: [['order', 'A7K2-19']] })).toBe('orders')
    expect(routeRumor({ kind: 14, tags: [['subject', 'A7K2-19']] })).toBe('both')
    expect(routeRumor({ kind: 14, tags: [] })).toBe('chat')
    expect(routeRumor({ kind: 1, tags: [] })).toBe('none')
  })

  it('keeps an order’s messages out of the chat with the same person', () => {
    const order = buildOrder({ seller: B, orderId: 'A7K2-19', amount: 1, items: [] })
    const rumor: Rumor = { id: '1'.repeat(64), pubkey: A, created_at: 1, kind: order.kind, tags: order.tags, content: order.content }
    const messages = [
      { subject: 'A7K2-19', participants: [A, B] },
      { subject: 'A7K2-19', participants: [A, 'c'.repeat(64)] },
      { participants: [A, B] },
    ]
    expect(withoutOrderChat(messages, [rumor])).toEqual([messages[1], messages[2]])
  })
})
