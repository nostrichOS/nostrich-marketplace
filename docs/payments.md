# Payments

Money never passes through Nostrich: the buyer's wallet pays the seller's wallet. Code: [`src/payments/`](../src/payments/), and [`examples/checkout-sequence.ts`](../examples/checkout-sequence.ts) for the whole sequence.

## Paid at checkout, or on request

We read the seller's kind 0 at checkout, not from a cache:

| Seller's profile | What happens |
|---|---|
| `payment_preference` is `lud16` (or `lightning`) and `lud16` is set | The buyer pays the seller's lightning address at checkout. |
| Anything else | The order is placed, and the buyer waits for the seller's type 2 payment request. |

## The order of operations

Each step is written to the buyer's journal ([`src/payments/journal.ts`](../src/payments/journal.ts)) **before** it runs, so a payment interrupted by a closed tab or a dropped connection is looked up afterwards, never repeated.

1. **The invoice first.** Ask the seller's lightning address (LUD-16) for an invoice of exactly the order's amount, with a comment naming the order. An invoice with no amount, or the wrong one, is refused. Nothing has been sent yet.
2. **`placing`**, then send the order. It counts as placed only when the **seller's** copy reached a relay. If it did not: **`undelivered`**, and nothing is paid.
3. **`paying`**, with the invoice and its payment hash, then pay, with a key made from the order and the invoice, so a retry is the same payment.
4. The wallet's answer:
   - paid: **`paid`**;
   - refused before sending: **`refused`**, nothing was spent;
   - no clear answer: **`unknown`**. This is never paid again. It is looked up by its payment hash, or through the invoice's LUD-21 `verify` link.
5. Send the kind 17 receipt with the preimage: **`done`**.

### From another wallet

A buyer can pay the invoice from any wallet as a QR code. We notice the payment through the invoice's LUD-21 `verify` link, which also gives the preimage. A server with no such link leaves the buyer an "I've paid" button, and the receipt then carries no preimage.

### A seller who takes payment on request

The seller answers the order with a type 2 request: an invoice from their own wallet, valid for a day, and the product's Bitcoin address too when it accepts on-chain payment. The buyer pays it and sends the receipt.

## When a seller may believe a receipt

A preimage that matches its invoice proves only that **some** invoice was paid: a buyer could pay an invoice to themselves and send that preimage. So the seller's side calls a Lightning receipt verified only when the **seller's own wallet** received a payment with the invoice's payment hash. Until then it says the proof is attached and asks the seller to check their wallet.

## On-chain

A listing with `["payment", "bitcoin", address]` can be paid at that address ([`src/payments/onchain.ts`](../src/payments/onchain.ts)):

- The buyer pays the address the seller's relays hold **now**, read again just before paying.
- The network fee is quoted before anything is sent, and the order is sent before the money.
- The receipt names the address and the transaction.
- Under 1,000 sats nothing is paid on-chain.

Transaction ids are public, so the seller's side checks every receipt against the public chain (`judgeOnchain`):

| Verdict | When |
|---|---|
| not yours | The address is not one of the seller's. |
| shared | Another of the seller's orders claims the same transaction. Neither is believed. |
| short | The transaction pays the address less than the order. |
| early | It was confirmed more than two hours before the order was placed. |
| confirming | Fewer than three confirmations. |
| verified | Three confirmations, the seller's address, the whole amount, and nobody else's claim. |

An order paid on-chain is held as confirming until it is verified, so it is never shipped on a receipt alone. A seller who checked their own wallet can still mark it paid.
