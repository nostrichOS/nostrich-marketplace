/** Which of a seller’s delivery options a listing names. */

import { SHIPPING_OPTION_KIND, type Listing } from '../listings/listing'
import { isNewerVersion } from '../listings/deletions'
import { parseShippingOption, type ShippingOption } from '../listings/shipping'
import type { NostrEvent } from '../core/types'

/** A delivery option a listing names, with the listing's own extra cost on it (in the LISTING's currency). */
export interface OfferedOption {
  option: ShippingOption
  extraCost?: number
}

/** The options a listing names, from a seller's option events. */
export function optionsFor(listing: Listing, events: readonly NostrEvent[]): OfferedOption[] {
  const newest = new Map<string, NostrEvent>()
  for (const event of events) {
    if (event.kind !== SHIPPING_OPTION_KIND) continue
    const option = parseShippingOption(event)
    if (option === null) continue
    const held = newest.get(option.address)
    if (held === undefined || isNewerVersion(event, held)) newest.set(option.address, event)
  }
  const all = [...newest.values()].map(parseShippingOption).filter((option): option is ShippingOption => option !== null)
  const named: OfferedOption[] = []
  for (const ref of listing.shipping) {
    for (const option of all) {
      const matches = ref.all === true ? `${SHIPPING_OPTION_KIND}:${option.pubkey}` === ref.address : option.address === ref.address
      if (!matches || named.some(held => held.option.address === option.address)) continue
      named.push(ref.extraCost === undefined ? { option } : { option, extraCost: ref.extraCost })
    }
  }
  return named
}
