import { describe, expect, it } from 'vitest'

import { addressProblems } from './address-check'

describe('a postal code, for the country it is in', () => {
  it('takes every real code', () => {
    for (const [country, postal, region] of [
      ['United States', '11211', 'NY'],
      ['USA', '11211-3204', 'NY'],
      ['US', '112113204', 'NY'],
      ['Canada', 'K1A 0B1', 'ON'],
      ['Canada', 'k1a0b1', 'ON'],
      ['United Kingdom', 'SW1A 1AA', ''],
      ['UK', 'm1 1ae', ''],
      ['England', 'EC1A1BB', ''],
      ['GB', 'BFPO 801', ''],
      ['GB', 'ASCN 1ZZ', ''],
      ['Ireland', 'D02 AF30', ''],
      ['Ireland', 'D6W XK68', ''],
      ['Germany', '10115', ''],
      ['Deutschland', '80331', ''],
      ['France', '75008', ''],
      ['Netherlands', '1012 JS', ''],
      ['Holland', '1012js', ''],
      ['Portugal', '1000-205', ''],
      ['Sweden', '111 22', ''],
      ['Poland', '00-950', ''],
      ['Japan', '100-0001', ''],
      ['Brazil', '01310-100', ''],
      ['India', '110001', ''],
      ['Australia', '2000', 'NSW'],
      ['Türkiye', '34000', ''],
    ] as const) {
      expect(addressProblems({ country, postal, region }), `${country} ${postal}`).toEqual({})
    }
  })

  it('names one that is missing, or is not the country’s shape', () => {
    expect(addressProblems({ country: 'United States', postal: '', region: 'NY' })).toEqual({ postal: 'missing' })
    expect(addressProblems({ country: 'United States', postal: '1121', region: 'NY' })).toEqual({ postal: 'shape' })
    expect(addressProblems({ country: 'Germany', postal: '1011' })).toEqual({ postal: 'shape' })
    expect(addressProblems({ country: 'Canada', postal: '12345', region: 'ON' })).toEqual({ postal: 'shape' })
    expect(addressProblems({ country: 'UK', postal: '12345' })).toEqual({ postal: 'shape' })
    expect(addressProblems({ country: 'Netherlands', postal: '1012' })).toEqual({ postal: 'shape' })
  })

  it('asks for a state only where a parcel cannot be sorted without one', () => {
    expect(addressProblems({ country: 'United States', postal: '11211' })).toEqual({ region: 'missing' })
    expect(addressProblems({ country: 'Canada', postal: 'K1A 0B1', region: ' ' })).toEqual({ region: 'missing' })
    expect(addressProblems({ country: 'Australia', postal: '2000' })).toEqual({ region: 'missing' })
    expect(addressProblems({ country: 'Germany', postal: '10115' })).toEqual({})
  })
})

describe('what is not known is not checked', () => {
  it('a country whose codes are not in the table', () => {
    expect(addressProblems({ country: 'Kenya' })).toEqual({})
    expect(addressProblems({ country: 'Hong Kong', postal: '' })).toEqual({})
    expect(addressProblems({ country: 'Argentina', postal: 'C1425' })).toEqual({})
  })

  it('a country that was not understood', () => {
    expect(addressProblems({ country: 'Middle Earth', postal: 'x' })).toEqual({})
    expect(addressProblems({ country: '' })).toEqual({})
  })

  it('reads the country in the reader’s own language', () => {
    expect(addressProblems({ country: 'Almanya', postal: '1011' }, ['tr'])).toEqual({ postal: 'shape' })
    expect(addressProblems({ country: 'Almanya', postal: '10115' }, ['tr'])).toEqual({})
  })
})
