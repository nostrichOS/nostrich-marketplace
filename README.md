# nostrich-marketplace

The Nostr marketplace implementation behind [Nostrich](https://nostrich.org): NIP-99 listings and the Open Markets order flow, from a published listing to a delivered order.

It covers every part of the marketplace that crosses from one app to another: the listings and delivery options we publish, the order messages we send and accept, how payments are made and verified, and how our index reads the network. Every rule is documented and backed by tests, so any Nostr marketplace can interoperate with Nostrich.

## What is in here

| Folder | What it covers | Read first |
|---|---|---|
| [`src/listings`](src/listings) | Listings (30402, 30403), delivery options (30406), products with options, Bitcoin addresses, deletions | [docs/listings.md](docs/listings.md) |
| [`src/orders`](src/orders) | Order messages (kind 16 types 1 to 4, kind 17, kind 14), who may say what, gift wrapping | [docs/orders.md](docs/orders.md) |
| [`src/payments`](src/payments) | Lightning address invoices, the payment journal, on-chain verification | [docs/payments.md](docs/payments.md) |
| [`src/delivery`](src/delivery) | Delivery choices, whether an option reaches the buyer, address checks | [docs/delivery.md](docs/delivery.md) |
| [`src/reviews`](src/reviews) | Seller reviews (31555) | [docs/reviews.md](docs/reviews.md) |
| [`src/discovery`](src/discovery) | How our index reads listings: tests, exchanges, copies, pictures that are gone | [docs/discovery.md](docs/discovery.md) |
| [`src/private-data`](src/private-data) | What a buyer keeps encrypted to themselves | [docs/private-data.md](docs/private-data.md) |
| [`examples`](examples) | Placing an order, a seller's replies, the checkout sequence | |

Where we differ from other apps, and what we add: [docs/compatibility.md](docs/compatibility.md).

## Quick start

```sh
pnpm install
pnpm typecheck
pnpm test
```

```ts
import { buildOrder, keySigner, orderViews, parseOrderRumor, unwrapRumor, wrapRumor } from './src'

const buyer = keySigner(buyerSecretKey)
const order = buildOrder({ seller, orderId: 'A7K2-19', amount: 21000, items: [{ address: `30402:${seller}:mug`, quantity: 1 }] })
const { wraps } = await wrapRumor(buyer, order, [seller])
// Publish each wrap to its recipient's inbox relays.

// On the other side:
const opened = await unwrapRumor(sellerSigner, wrap)
const message = opened === null ? null : parseOrderRumor(opened.rumor)
```

## Specifications

- [NIP-99](https://github.com/nostr-protocol/nips/blob/master/99.md) listings, and the [Open Markets specification](https://github.com/OpenMarketsFoundation/specification) for delivery options, orders and reviews
- [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md), [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) and [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md) for private messages and gift wraps
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md), [NIP-31](https://github.com/nostr-protocol/nips/blob/master/31.md) and [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md)
- [LUD-06, LUD-12, LUD-16 and LUD-21](https://github.com/lnurl/luds) for lightning addresses, and [BOLT 11](https://github.com/lightning/bolts/blob/master/11-payment-encoding.md) for invoices
- [BIP-21](https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki), [BIP-173](https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki) and [BIP-350](https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki) for Bitcoin addresses
- BUD-02 (Blossom) for asking a picture's server who uploaded it

## License

MIT
