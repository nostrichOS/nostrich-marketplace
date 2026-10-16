# Compatibility

Nostrich reads what other marketplace apps write, and writes what they read. This page says where the two differ.

## Shapes from other apps we accept

| Written as | Read as |
|---|---|
| `name` with no `title` | The title. |
| `quantity` with no `stock` | Stock. |
| `SAT`, `SATOSHI`, `SATOSHIS` | Sats. |
| `daily`, `monthly`, `annually` and similar | NIP-99's `day`, `month`, `year`. |
| An inline `["shipping", kind, cost, currency]` tag | A delivery choice: added cost, free, pickup, free or pickup, or none. |
| `pickup-address`, or `pickup-street`, `pickup-city` and the other parts | Where to pick up. |
| `["payment", "btc", address]` | The same as `bitcoin`. |
| `payment_preference: lightning` in a profile | The same as `lud16`. |
| Order ids of any shape | Accepted as written. |
| Order chat that names its order only in `subject` | Order chat. |

Every tag we do not write is kept as it was when a listing or a delivery option is edited here.

## What we add

These are optional, and an app that does not know them loses nothing.

| Where | Tag | Meaning |
|---|---|---|
| Kind 14 order chat | `["order", id]` | The order it belongs to, besides `subject`. |
| Kind 14 from the buyer | `["request", "cancel"]` | Asks the seller to cancel a paid order. The words are an ordinary message to every app. |
| Type 3 `cancelled` from the seller | `["refund", medium, reference, proof?]` and `amount` | The seller paid the buyer back. |
| Listings | `["payment", "bitcoin", address]`, and `["payment", "lightning"]` for both | How the product is paid. |
| Receipts | `["payment", "bitcoin", address, txid]` | An on-chain payment. |
| Listings and delivery options | `alt` (NIP-31) | A plain description for apps that do not know the kind. |

## What we do not do

- **Escrow, or holding money.** Every payment goes from the buyer's wallet to the seller's.
- **eCash** payments.
- **Carts** across sellers.
- **Checkout for listings from an app whose sellers cannot yet read the standard order messages.** Those listings are left out until they can.
