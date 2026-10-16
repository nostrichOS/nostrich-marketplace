import { describe, expect, it } from 'vitest'

import { copiesOf, copyGroups, originalSeller, pictureKey, repeatsOf, sameTitle, type CopyCandidate } from './copies'

const ARTIST = 'c'.repeat(64)
const RESELLER = 'a'.repeat(64)
const OWNER = 'b'.repeat(64)
const PLATFORM = '0'.repeat(64)
const ALBUM = `https://cdn-a.example/${'1a2b'.repeat(16)}.webp`
const VAN = 'https://photos.example/van.jpg'

const listing = (pubkey: string, d: string, title: string, images: string[], listedAt: number, price = '1|SATS|'): CopyCandidate => ({
  address: `30402:${pubkey}:${d}`,
  pubkey,
  title,
  images,
  listedAt,
  price,
})

describe('telling a copy from the original', () => {
  const artist = listing(ARTIST, 'album', 'Night Drive ', [ALBUM], 1_790_167_781)
  const reseller = listing(RESELLER, 'sell-album', '[SELL] Night Drive full album (25k sats)', [ALBUM], 1_790_338_147)
  const owner = listing(OWNER, 'van', 'Delivery van 2013', [VAN], 1_780_502_493)
  const platform = listing(PLATFORM, 'van-146', 'Delivery van 2013', [VAN], 1_780_502_497)

  it('groups listings from different sellers that share a picture and a title', () => {
    expect(copyGroups([artist, reseller, owner, platform])).toHaveLength(2)
    expect(sameTitle('[SELL] Night Drive full album (25k sats)', 'Night Drive ')).toBe(true)
  })

  it('keeps the seller the picture host says uploaded it, else whoever listed first', () => {
    const [album] = copyGroups([artist, reseller])
    expect(originalSeller(album!, pubkey => pubkey === ARTIST, () => 1)).toBe(ARTIST)
    const [van] = copyGroups([owner, platform])
    expect(originalSeller(van!, () => undefined, () => 1)).toBe(OWNER)
  })

  it('believes the upload over the dates, so a backdated copy cannot win', () => {
    const [group] = copyGroups([artist, { ...reseller, listedAt: 1_700_000_000 }])
    expect(originalSeller(group!, pubkey => pubkey === ARTIST, () => 1)).toBe(ARTIST)
  })

  it('at the same second, keeps the account with fewer listings', () => {
    const [group] = copyGroups([{ ...owner, listedAt: 100 }, { ...platform, listedAt: 100 }])
    expect(originalSeller(group!, () => undefined, pubkey => (pubkey === PLATFORM ? 400 : 12))).toBe(OWNER)
  })

  it('maps every copy to the listing that stays', () => {
    const copies = copiesOf(copyGroups([artist, reseller, owner, platform]), (_, pubkey) => (pubkey === ARTIST ? true : undefined), () => 1)
    expect([...copies.entries()].sort()).toEqual([[reseller.address, artist.address], [platform.address, owner.address]].sort())
  })

  it('never calls two shops using one stock photo copies when their titles differ', () => {
    const stock = 'https://stock.example/photo-1?w=400'
    expect(copyGroups([listing(ARTIST, 'candle', 'Lavender candle', [stock], 1), listing(OWNER, 'mug', 'Ceramic mug', [`${stock}&h=300`], 2)])).toHaveLength(0)
    expect(pictureKey(stock)).toBe(pictureKey(`${stock}&h=300`))
  })
})

describe("one seller's repeats", () => {
  const SHOP = '7'.repeat(64)
  const cover = 'https://shop.example/report.png'

  it('keeps the newest of the same title, cover and price', () => {
    const four = [1, 2, 3, 4].map(n => listing(SHOP, `report-${n}`, 'Node report', [cover], 1_790_600_000 + n, '210|SATS|'))
    const repeats = repeatsOf(four)
    expect(repeats.size).toBe(3)
    for (const kept of repeats.values()) expect(kept).toBe(four[3]!.address)
  })

  it('leaves sizes and colours sold as separate listings alone', () => {
    const tee = 'https://shop.example/tee.jpg'
    const sizes = ['Tee - S', 'Tee - M', 'Tee - L'].map((title, n) => listing(SHOP, `tee-${n}`, title, [tee], 100 + n, '40000|SATS|'))
    expect(repeatsOf(sizes).size).toBe(0)
  })
})
