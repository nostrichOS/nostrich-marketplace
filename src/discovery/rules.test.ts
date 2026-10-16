import { describe, expect, it } from 'vitest'

import { isExchangeListing, isTestListing } from './rules'

describe('listings the index never offers', () => {
  it('knows a test by its title, and leaves real products that use the word alone', () => {
    for (const title of ['Test', 'test item', 'Test listing #2', 'Mug (testing)', 'Not for sale', 'asdf']) expect(isTestListing({ title })).toBe(true)
    for (const title of ['Test Bank', 'Load Testing Field Guide', 'Brass lamp']) expect(isTestListing({ title })).toBe(false)
  })

  it('knows money traded for money', () => {
    for (const title of ['Cash for BTC', 'Exchange bitcoin for cash', 'Selling 10 BTC', 'Buying BTC for NGN']) expect(isExchangeListing({ title })).toBe(true)
    for (const title of ['Bitcoin t-shirt', 'Hardware wallet', 'Cash register']) expect(isExchangeListing({ title })).toBe(false)
  })
})
