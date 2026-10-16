# Orders

Orders follow the Open Markets order flow. Every message is a rumor (an unsigned event), sealed and gift-wrapped (NIP-59) for the other side and for the sender's own copy, exactly as NIP-17 does for messages. Code: [`src/orders/orders.ts`](../src/orders/orders.ts), [`src/orders/gift-wrap.ts`](../src/orders/gift-wrap.ts).

## The messages

| Kind | `type` | From | Tags we write | Content |
|---|---|---|---|---|
| 16 | `1` order | buyer | `p` seller, `subject`, `order`, `amount` (sats, delivery included), `["item", "30402:…", quantity]` per item, `shipping` (`30406:…`) when one is picked, `address`, `email`, `phone` when given | The buyer's note, plain text |
| 16 | `2` payment request | seller | `p` buyer, `subject`, `order`, `amount`, `["payment", medium, reference]` per way to pay, `expiration` | Payment instructions |
| 16 | `3` status | either | `p`, `subject`, `order`, `status`: `pending`, `confirmed`, `processing`, `completed` or `cancelled` | A short update |
| 16 | `4` shipping | seller | `p` buyer, `subject`, `order`, `status`: `processing`, `shipped`, `delivered` or `exception`, `tracking`, `carrier`, `eta` | A short update |
| 17 | receipt | buyer | `p` seller, `subject`, `order`, `["payment", medium, reference, proof]`, `amount` | A note |
| 14 | order chat | either | `p`, `subject` and `order` set to the order id | The message |

Example, before sealing:

```
kind 16
["p", "<seller>"]
["subject", "Order #A7K2-19"]
["type", "1"]
["order", "A7K2-19"]
["amount", "21000"]
["item", "30402:<seller>:<d>", "2"]
["shipping", "30406:<seller>:<d>"]
["address", "..."]
content: the buyer's note

kind 17
["p", "<seller>"]
["subject", "order-receipt"]
["order", "A7K2-19"]
["payment", "lightning", "<bolt11>", "<preimage>"]
["amount", "21000"]
```

The receipt's `amount` is the invoice's own amount. A receipt for an on-chain payment is `["payment", "bitcoin", "<address>", "<txid>"]`.

## Who may say what

`orderView` builds one order from its messages and trusts each message only from the person allowed to send it:

- Nothing about an order is kept until its type 1 message has been opened.
- A payment request and a shipping update come from the order's seller alone.
- A receipt comes from the order's buyer alone.
- A status comes from either of them.
- Anybody else's message about the order is ignored.
- A payment request above the order's total is shown with a warning; one past its `expiration` is expired.
- A later shipping update replaces an earlier one, so a seller can take back `shipped`.

The order's stage comes from those messages: awaiting payment, payment requested, paid, confirmed, processing, shipped, delivered, exception, completed or cancelled.

## Cancelling

- A buyer cancels an unpaid order alone, with a type 3 `cancelled`.
- A paid order can only be refunded by the seller, so a buyer's `cancelled` on a paid order is read as a **request**, and the order stays as it was.
- We send that request as an ordinary kind 14 message, which every app reads, with `["request", "cancel"]` added so both sides here know it was asked.
- A seller who refunds sends a type 3 `cancelled` with `["refund", medium, reference, proof?]` and the amount.

## Which wraps are orders

One inbox holds both messages and orders ([`src/orders/route.ts`](../src/orders/route.ts)):

- Kinds 16 and 17 are orders.
- A kind 14 with an `order` tag is order chat.
- A kind 14 with only a `subject` may be either, so it goes to both until an order with that id is known; then it leaves the chat.

## Order ids

Ours are four letters or digits and two digits, `A7K2-19`, easy to read out. Any other app's id is accepted as it is.
