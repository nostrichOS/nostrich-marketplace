/** An address checked before it is sent: a postal code in its country’s shape, and a state where one is needed. */

import { countryCode } from './ship-to'

const D = String.raw`\d`
const shape = (source: string): RegExp => new RegExp(`^${source}$`, 'iu')

/** Postal code shapes by country. */
const POSTAL: Record<string, RegExp> = {
  US: shape(`${D}{5}(?:[- ]?${D}{4})?`),
  CA: shape(`[A-Z]${D}[A-Z] ?${D}[A-Z]${D}`),
  GB: shape(`(?:[A-Z]{1,2}${D}[A-Z${D}]? ?${D}[A-Z]{2}|BFPO ?${D}{1,4}|[A-Z]{4} ?1ZZ|GIR ?0AA)`),
  IE: shape(`[A-Z]${D}[${D}W] ?[A-Z${D}]{4}`),
  AU: shape(`${D}{4}`),
  NZ: shape(`${D}{4}`),
  DE: shape(`${D}{5}`),
  FR: shape(`${D}{5}`),
  IT: shape(`${D}{5}`),
  ES: shape(`${D}{5}`),
  FI: shape(`${D}{5}`),
  MX: shape(`${D}{5}`),
  TR: shape(`${D}{5}`),
  NL: shape(`${D}{4} ?[A-Z]{2}`),
  BE: shape(`${D}{4}`),
  AT: shape(`${D}{4}`),
  CH: shape(`${D}{4}`),
  DK: shape(`${D}{4}`),
  NO: shape(`${D}{4}`),
  PT: shape(`${D}{4}(?:-?${D}{3})?`),
  SE: shape(`${D}{3} ?${D}{2}`),
  GR: shape(`${D}{3} ?${D}{2}`),
  CZ: shape(`${D}{3} ?${D}{2}`),
  PL: shape(`${D}{2}-?${D}{3}`),
  JP: shape(`${D}{3}-?${D}{4}`),
  BR: shape(`${D}{5}-?${D}{3}`),
  IN: shape(`${D}{3} ?${D}{3}`),
}

/** Where an address without a state or province cannot be sorted. */
const NEEDS_REGION = new Set(['US', 'CA', 'AU'])

export interface AddressProblems {
  /** No postal code where one is needed, or one that is not the country's shape. */
  postal?: 'missing' | 'shape'
  region?: 'missing'
}

/** What is wrong with an address as typed, for the country it names. */
export function addressProblems(address: { country: string; postal?: string; region?: string }, locales: readonly string[] = []): AddressProblems {
  const code = countryCode(address.country, locales)
  if (code === undefined) return {}
  const problems: AddressProblems = {}
  const wanted = POSTAL[code]
  if (wanted !== undefined) {
    const postal = (address.postal ?? '').trim()
    if (postal === '') problems.postal = 'missing'
    else if (!wanted.test(postal)) problems.postal = 'shape'
  }
  if (NEEDS_REGION.has(code) && (address.region ?? '').trim() === '') problems.region = 'missing'
  return problems
}
