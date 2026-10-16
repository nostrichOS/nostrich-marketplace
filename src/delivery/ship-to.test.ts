import { describe, expect, it } from 'vitest'

import { countryCode, reaches } from './ship-to'

describe('a country, however it was written', () => {
  it('reads the codes sellers’ apps write', () => {
    expect(countryCode('US')).toBe('US')
    expect(countryCode('de')).toBe('DE')
    expect(countryCode('IRL')).toBe('IE')
    expect(countryCode('DEU')).toBe('DE')
    expect(countryCode('GBR')).toBe('GB')
    expect(countryCode('USA')).toBe('US')
    expect(countryCode('UNITED STATES')).toBe('US')
  })

  it('reads what a buyer types', () => {
    for (const [typed, code] of [
      ['United States', 'US'],
      ['united states of america', 'US'],
      ['U.S.A.', 'US'],
      ['The Netherlands', 'NL'],
      ['Holland', 'NL'],
      ['UK', 'GB'],
      ['England', 'GB'],
      ['Germany', 'DE'],
      ['Deutschland', 'DE'],
      ['España', 'ES'],
      ['Türkiye', 'TR'],
      ['Turkey', 'TR'],
      ['Czech Republic', 'CZ'],
      ['South Korea', 'KR'],
      ['  canada ', 'CA'],
      ['Côte d’Ivoire', 'CI'],
    ] as const) {
      expect(countryCode(typed), typed).toBe(code)
    }
  })

  it('reads a name in the reader’s own language', () => {
    expect(countryCode('Allemagne', ['fr'])).toBe('DE')
    expect(countryCode('Almanya', ['tr'])).toBe('DE')
    expect(countryCode('ドイツ', ['ja'])).toBe('DE')
    expect(countryCode('Almanya')).toBeUndefined()
  })

  it('does not guess', () => {
    expect(countryCode('')).toBeUndefined()
    expect(countryCode(undefined)).toBeUndefined()
    expect(countryCode('Europe')).toBeUndefined()
    expect(countryCode('Worldwide')).toBeUndefined()
    expect(countryCode('ZZ')).toBeUndefined()
    expect(countryCode('my house')).toBeUndefined()
  })

  it('knows a name for every code in its table', () => {
    const names = new Intl.DisplayNames(['en'], { type: 'region' })
    let count = 0
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first, second)
        if (countryCode(code) !== code) continue
        count += 1
        expect(names.of(code), code).not.toBe(code)
      }
    }
    expect(count).toBe(250)
  })
})

describe('whether a delivery option reaches the buyer', () => {
  it('an option that names no country reaches everywhere', () => {
    expect(reaches([], 'Japan')).toBe('yes')
    expect(reaches([], undefined)).toBe('yes')
  })

  it('says yes across the two ways of writing a country', () => {
    expect(reaches(['US', 'CA'], 'United States')).toBe('yes')
    expect(reaches(['IRL', 'DEU', 'FRA'], 'Germany')).toBe('yes')
    expect(reaches(['UNITED STATES'], 'usa')).toBe('yes')
    expect(reaches(['DE'], 'Almanya', ['tr'])).toBe('yes')
  })

  it('says no only when both sides were understood', () => {
    expect(reaches(['US', 'CA'], 'Germany')).toBe('no')
    expect(reaches(['IRL', 'DEU'], 'United States')).toBe('no')
  })

  it('never blocks on something it did not understand', () => {
    expect(reaches(['US'], 'Almanya')).toBe('unknown')
    expect(reaches(['US'], '')).toBe('unknown')
    expect(reaches(['US'], undefined)).toBe('unknown')
    expect(reaches(['US', 'EUROPE'], 'Germany')).toBe('unknown')
    expect(reaches(['EUROPE'], 'Europe')).toBe('yes')
  })
})
