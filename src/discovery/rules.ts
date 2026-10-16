/** Listings the index never offers: tests, and money traded for money. */

import type { Listing } from '../listings/listing'

const COIN = String.raw`(?:btc|bitcoin|xmr|monero|ltc|litecoin|eth|ethereum|usdt|usdc|tether|sats?|crypto)`
const MONEY = String.raw`(?:cash|fiat|efectivo|euros?|eur|usd|dollars?|naira|ngn|ghs|kes|ars|pesos?|cny|sepa|paypal|bank\s+transfer|transferencia)`
const TO = String.raw`\s+(?:for|to|->|→|por)\s+`
const MONEY_FOR_COIN = new RegExp(String.raw`\b${MONEY}${TO}${COIN}\b`, 'iu')
const COIN_FOR_MONEY = new RegExp(String.raw`\b${COIN}${TO}(?:${MONEY}|${COIN})\b`, 'iu')
const SWAP_COIN = new RegExp(String.raw`\b(?:exchange|swap|convert|p2p|otc)\s+(?:your\s+)?(?:[\d.,]+\s*)?${COIN}\b`, 'iu')
const TRADE_TITLE = new RegExp(String.raw`^\s*(?:buying|selling|buy|sell|compro|vendo|cambio)\s+(?:[\d.,]+\s*)?${COIN}(?:\s*$|\s+(?:for|via|with|con|en|por|a|at|in)\b)`, 'iu')

/** Whether a listing trades money for money: cash, bank money or one coin for another. */
export function isExchangeListing(listing: Pick<Listing, 'title' | 'summary'>): boolean {
  const text = `${listing.title} ${listing.summary ?? ''}`
  return MONEY_FOR_COIN.test(text) || COIN_FOR_MONEY.test(text) || SWAP_COIN.test(text) || TRADE_TITLE.test(listing.title)
}

const TEST_E2E = /^test service e2e\b/iu
const NOT_FOR_SALE = /not for sale|do not (?:buy|purchase)|don['’]?t (?:buy|purchase)|testing only|to be deleted|please ignore|ignore this/iu
const BRACKETED_TEST = /[[(][^\])]*\btest(?:ing)?\b[^\])]*[\])]/iu
const TEST_PHRASE =
  /\btest (?:item|listing|product|job|sale|title|publish|request|bounty|round|mint|paywall|paid|order|post|offer|widget|shirt|t-shirt|coffee|course|editor|stuck)\b|\btesting (?:paid|zap|another)\b/iu
const TEST_COMPOUND =
  /^test (?:bank|kits?|strips?|tubes?|prep|drive|pattern|node|lab|cable|leads?|equipment|meters?|tools?|charts?|cards?|packs?|sets?|bench|sieve|weights?|dummy|paper|booklet)\b/iu
/** A title that is nothing but filler. */
const FILLER = /^(?:asdf\w*|qwerty|foo|bar|foobar|dummy|lorem ipsum|placeholder|untitled|new (?:product|listing)|sample|example)$/iu

/** Whether a listing was posted to try something, read from its title alone. */
export function isTestListing(listing: Pick<Listing, 'title'>): boolean {
  const title = listing.title.trim()
  if (title === '') return false
  if (TEST_E2E.test(title) || NOT_FOR_SALE.test(title) || BRACKETED_TEST.test(title) || TEST_PHRASE.test(title)) return true
  if (FILLER.test(title.replace(/[\s.!]+$/u, ''))) return true
  const words = title.replace(/[#\d]+\s*$/u, '').trim().match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) ?? []
  const first = words[0]?.toLowerCase()
  const last = words[words.length - 1]?.toLowerCase()
  if (first === undefined || last === undefined) return false
  if (words.length === 1 && /^(?:test(?:ing)?(?:-[\p{L}\p{N}]+)*|[\p{L}\p{N}-]+-test(?:ing)?)$/iu.test(first)) return true
  if ((first === 'test' || first === 'testing') && !TEST_COMPOUND.test(words.join(' '))) return true
  const tail = last.split('-').pop()
  return words.length <= 4 && (tail === 'test' || tail === 'testing')
}
