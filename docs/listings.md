# Listings

A listing is a NIP-99 classified (kind 30402), and a draft is a kind 30403 that no market shows. Code: [`src/listings/listing.ts`](../src/listings/listing.ts).

## What we read

| Tag | Read as |
|---|---|
| `d` | The listing's identifier. A listing without one is not a listing. |
| `title`, else `name`, else `summary`, else the content's first line | The title. |
| `summary` | A short description. |
| content | The description, as Markdown. |
| `["image", url, dims, order]` | Pictures, sorted by `order`. A private address or a non-web scheme is refused. |
| `["price", amount, currency, frequency?]` | The price. `SAT`, `SATS`, `SATOSHI` and `SATOSHIS` are all sats; `BTC` is bitcoin; anything else is money. |
| `["type", simple \| variable \| variation, physical \| digital]` | The product type and format. A listing that says neither is `simple` and `physical`. |
| `visibility` | `on-sale`, `hidden` or `pre-order`. A hidden listing is never shown. |
| `stock`, else `quantity` | Units in stock. |
| `["spec", key, value]` | Details. |
| `weight`, `dim`, `location`, `condition` | As written. |
| `t` | Tags, lower case, with `#` and repeats removed. |
| `["shipping_option", ref, extraCost?]` | Delivery options: `30406:<pubkey>:<d>`, or `30406:<pubkey>` for all of the seller's options, with an extra cost in the listing's currency. |
| `["shipping", kind, cost, currency]` | An older inline delivery tag: added cost, free, pickup, free or pickup, or none. |
| `r` | A link to a shop that sells it. A listing with a link and no delivery of its own is bought on that site. |
| `["a", "30402:…"]` | The product this listing is an option of. |
| `["a", "30405:…"]` | Collections it belongs to. |
| `published_at`, `expiration`, `status` | When it was first published, when it expires, and `sold`. |
| `["payment", "bitcoin" \| "btc", address]` | Paid at a Bitcoin address, checked by its checksum. With `["payment", "lightning"]` too, it takes both. |

A listing can be shown when it is not a draft, not hidden and not expired. It can be bought when it can be shown and is not sold.

## Prices

A price in sats is used as it is. A price in money is converted with the exchange rates the caller passes in, and a price with no rate has no sats figure: it is never guessed.

## What we write

`buildListing` writes the tags in the table above that the form owns, and **keeps every other tag exactly as it was** on an edit, so a listing made in another app loses nothing when it is edited here. It adds an `alt` tag (NIP-31) so an app that does not know the kind can still describe it. `withStock` and `withOnchainAddress` change one thing and keep the rest.

## Products with options

A product with options is one `variable` listing and one `variation` listing per option ([`src/listings/variations.ts`](../src/listings/variations.ts)):

- Each option is a whole listing (pictures, words, tags, delivery, payment) under its own title, price and stock, because other apps read an option on its own.
- An option names its product in one `a` tag, and answers each choice in a `spec` tag (`["spec", "Size", "M"]`).
- The product carries the lowest option's price.
- A family is read only from one seller: an option that names another seller's product is not an option of it.
- We give options identifiers like `<product>-o1`, `-o2`, and never reuse one, since an old order still names it.

## Deletions

NIP-09, with the rules every reader here applies ([`src/listings/deletions.ts`](../src/listings/deletions.ts)):

- Only the author's own kind 5 counts.
- `e` removes one event. `a` removes every version of an address up to the deletion's time.
- A revision with a `deleted` tag is a deletion of its own address.
- The newest version of an address is chosen first and judged second, so a deleted listing never falls back to an older copy.
