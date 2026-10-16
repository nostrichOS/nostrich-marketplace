# Delivery

Code: [`src/delivery/`](../src/delivery/), and delivery options themselves in [`src/listings/shipping.ts`](../src/listings/shipping.ts).

## Delivery options (kind 30406)

| Tag | Meaning |
|---|---|
| `d`, `title` | The option. |
| `["price", amount, currency]` | Its base cost. |
| `service` | `standard`, `express`, `overnight` or `pickup`. |
| `["country", code]`, one per country | Where it delivers. None means anywhere. |
| `["duration", min, max, unit]` | How long, with `H`, `D` or `W`. |
| `location`, or `pickup-address`, or the `pickup-street`, `pickup-city`, `pickup-state`, `pickup-postal-code`, `pickup-country` parts | Where to pick it up. |

A listing names its options with `shipping_option` (see [listings](listings.md)), and may add an extra cost per option.

## What a buyer is offered

`deliveryChoices` gives one list:

1. The seller's delivery options, when the listing names any.
2. Otherwise the older inline `shipping` tag.
3. A digital product is delivered by the seller through the order's messages.
4. A listing that says nothing about delivery is "arranged with the seller": the order still carries the buyer's address, and the seller answers.

## Does it reach the buyer

`reaches` reads the countries an option names, written as two-letter codes, three-letter codes or names, and the country the buyer typed. It answers yes, no or unknown, and **only a certain no** stops the buyer: anything it cannot read never blocks a purchase.

## The address

`addressProblems` checks an address before it is sent:

- A postal code in the shape its country uses, for the countries whose shape is known.
- A state or province where mail cannot be sorted without one (United States, Canada, Australia).

A country it does not know is checked for nothing. The address travels only inside the order's gift wrap, to that one seller.
