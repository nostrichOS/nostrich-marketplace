# Discovery

The Nostrich Marketplace is drawn from an index on our server that reads public listings from relays. This page says how that index reads them. Its rules that can be run on their own are in [`src/discovery/`](../src/discovery/).

## Reading listings

- **The walk.** Each relay is asked for kind 30402 since the last time, with an overlap, and is also paged back through its history with `until`. A relay can cut a page short and still end it with an ordinary EOSE, so an empty page counts as the bottom only when it comes back empty twice, and every relay is walked again from the top once a day.
- **One version per address.** The newest `created_at` wins, and on a tie the lower id (NIP-01).
- **Deletions.** Kind 5s that name kind 30402 are read as they come, and every listing is also asked about by its `a` address and its event id in turn, because some apps delete by `e` alone. See [listings](listings.md#deletions).
- **Expiry.** A listing past its NIP-40 `expiration` is gone.
- **Delivery options and profiles** are read with the listings, and a relay that answers with nothing never erases what is already known.

## What is never offered

| Rule | Code |
|---|---|
| Drafts, hidden, sold and expired listings | `isForSale` in [`listing.ts`](../src/listings/listing.ts) |
| A listing posted to test something, read from its title | `isTestListing` in [`rules.ts`](../src/discovery/rules.ts) |
| Money traded for money: cash, bank money or one coin for another | `isExchangeListing` in [`rules.ts`](../src/discovery/rules.ts) |
| A listing with no price, or a price of zero | |
| A listing with no picture, or whose pictures are all gone | [`pictures.ts`](../src/discovery/pictures.ts) |
| Adult content | |

Nostrich also applies its own content policy, which is not part of this repository.

## Pictures that are gone

A listing's pictures are asked about from the server ([`pictures.ts`](../src/discovery/pictures.ts)), through an address guard that refuses private addresses on every redirect hop ([`safe-fetch.ts`](../src/discovery/safe-fetch.ts)):

- A 404 or 410 from the host: missing, at once.
- A web page served where a picture was named: gone.
- A name that does not resolve, or a refused connection: gone, but only after two answers in a row.
- Anything else (a timeout, a 403, a 5xx): no conclusion, and nothing changes.

A card shows the first picture that is not gone.

## One listing per product

[`copies.ts`](../src/discovery/copies.ts):

- **Another seller's copy:** listings from different sellers that share a picture (the same URL without its query, or the same Blossom hash on any host) and a matching title. The original is the seller the picture's Blossom host lists as its uploader (BUD-02 `/list/<pubkey>`), else whoever listed it first, else the account with fewer listings.
- **A seller's own repeats:** the same title, cover and price. The newest stays. Sizes and colours sold as separate listings differ in title or price and are left alone.

A link to a copy opens the listing that stays.

## Products with options

The options of a product fold into one card at the product's address, priced at the lowest option that can still be bought, with stock summed when every option counts its stock. A link to an option still finds the product.

## Shops nobody is behind

A seller whose newest listing is over a year old, and who has published nothing at all in ninety days, has no cards. Their listings still open from a link, and they come back within a day of the seller publishing anything.

## Popularity

Interactions that name a listing's address: likes count 1, reposts and quotes 2, zaps 3. Replies and zero-sat zaps do not count.

## Reviews

Every relay is paged through for kind 31555, and swept again once a day. The newest review per reviewer and listing is kept ([`merge.ts`](../src/reviews/merge.ts)), and a seller's own review never counts.
