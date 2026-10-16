import { conversationKeyOf, type Rumor } from './gift-wrap'
import { parseOrderRumor } from './orders'

/** The rumor kinds that are always marketplace messages: an order message and a payment receipt. */
export const ORDER_RUMOR_KINDS: ReadonlySet<number> = new Set([16, 17])

/** Where a rumor out of the inbox goes: the order screens, the chat, both, or neither. */
export type RumorDestination = 'orders' | 'chat' | 'both' | 'none'

/** Kinds 16 and 17 go to orders, a kind 14 with an `order` tag too, and a kind 14 with only a `subject` to both. */
export function routeRumor(rumor: Pick<Rumor, 'kind' | 'tags'>): RumorDestination {
  if (ORDER_RUMOR_KINDS.has(rumor.kind)) return 'orders'
  if (rumor.kind === 15) return 'chat'
  if (rumor.kind !== 14) return 'none'
  if (rumor.tags.some(tag => tag[0] === 'order' && (tag[1] ?? '') !== '')) return 'orders'
  return rumor.tags.some(tag => tag[0] === 'subject') ? 'both' : 'chat'
}

/** Chat messages less order chat: a kind 14 whose subject is a known order between the same two people. */
export function withoutOrderChat<T extends { subject?: string; participants: string[] }>(messages: readonly T[], orderRumors: readonly Rumor[]): T[] {
  const orders = new Set<string>()
  for (const rumor of orderRumors) {
    if (rumor.kind !== 16) continue
    const parsed = parseOrderRumor(rumor)
    if (parsed === null || parsed.type !== 'order' || parsed.to[0] === undefined) continue
    orders.add(`${parsed.orderId}|${conversationKeyOf([parsed.from, parsed.to[0]])}`)
  }
  if (orders.size === 0) return [...messages]
  return messages.filter(message => message.subject === undefined || !orders.has(`${message.subject}|${conversationKeyOf(message.participants)}`))
}
