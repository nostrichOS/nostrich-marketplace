/** Whether a delivery option reaches the buyer: country codes and names as sellers and buyers write them. */

import { ISO_COUNTRY_TABLE } from './countries'

const ISO = ISO_COUNTRY_TABLE

const ALPHA3 = new Map<string, string>()
const ALPHA2 = new Set<string>()
for (const word of ISO.split(' ')) {
  ALPHA2.add(word.slice(0, 2))
  ALPHA3.set(word.slice(2), word.slice(0, 2))
}

/** What people type that no list of official names holds. */
const ALIASES: Record<string, string> = {
  usa: 'US',
  'u s': 'US',
  'u s a': 'US',
  america: 'US',
  'united states of america': 'US',
  uk: 'GB',
  'u k': 'GB',
  britain: 'GB',
  'great britain': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  uae: 'AE',
  holland: 'NL',
  'czech republic': 'CZ',
  korea: 'KR',
  'south korea': 'KR',
  'north korea': 'KP',
  turkey: 'TR',
  turkiye: 'TR',
  'ivory coast': 'CI',
  burma: 'MM',
  macedonia: 'MK',
  swaziland: 'SZ',
  'cape verde': 'CV',
  'hong kong': 'HK',
  macau: 'MO',
  macao: 'MO',
  palestine: 'PS',
  russia: 'RU',
  'viet nam': 'VN',
  deutschland: 'DE',
  espana: 'ES',
  italia: 'IT',
  brasil: 'BR',
  nederland: 'NL',
  osterreich: 'AT',
  schweiz: 'CH',
  suisse: 'CH',
  svizzera: 'CH',
  polska: 'PL',
  belgique: 'BE',
  belgie: 'BE',
  sverige: 'SE',
  norge: 'NO',
  danmark: 'DK',
  suomi: 'FI',
  eire: 'IE',
  hellas: 'GR',
  ellada: 'GR',
  nippon: 'JP',
  nihon: 'JP',
}

function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^the /u, '')
}

const NAMES = new Map<string, Map<string, string>>()

/** Every country's name in one language, folded, to its code. */
function namesIn(locale: string): Map<string, string> {
  const held = NAMES.get(locale)
  if (held !== undefined) return held
  const names = new Map<string, string>()
  try {
    const display = new Intl.DisplayNames([locale], { type: 'region' })
    for (const code of ALPHA2) {
      const name = display.of(code)
      if (name !== undefined && name !== code) names.set(fold(name), code)
    }
  } catch {
  }
  NAMES.set(locale, names)
  return names
}

/** The two-letter code of a country as a seller's app or a buyer wrote it, or undefined when it is not understood. */
export function countryCode(text: string | undefined, locales: readonly string[] = []): string | undefined {
  const typed = (text ?? '').trim()
  if (typed === '') return undefined
  const folded = fold(typed)
  const alias = ALIASES[folded]
  if (alias !== undefined) return alias
  const upper = typed.toUpperCase()
  if (ALPHA2.has(upper)) return upper
  const three = ALPHA3.get(upper)
  if (three !== undefined) return three
  for (const locale of ['en', ...locales]) {
    const code = namesIn(locale).get(folded)
    if (code !== undefined) return code
  }
  return undefined
}

export type Reach = 'yes' | 'no' | 'unknown'

/** Whether a delivery option that names `countries` reaches the country the buyer typed. */
export function reaches(countries: readonly string[], typed: string | undefined, locales: readonly string[] = []): Reach {
  if (countries.length === 0) return 'yes'
  const wanted = (typed ?? '').trim()
  if (wanted === '') return 'unknown'
  if (countries.some(country => fold(country) === fold(wanted))) return 'yes'
  const code = countryCode(wanted, locales)
  if (code === undefined) return 'unknown'
  let understood = true
  for (const country of countries) {
    const named = countryCode(country, locales)
    if (named === code) return 'yes'
    if (named === undefined) understood = false
  }
  return understood ? 'no' : 'unknown'
}
