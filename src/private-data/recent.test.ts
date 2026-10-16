import { describe, expect, it } from 'vitest'

import { EMPTY_RECENT, MAX_RECENT, mergeRecent, parseRecent, recentAddresses, sameRecent, type RecentList } from './recent'

describe('recently viewed across devices', () => {
  const phone: RecentList = { viewed: [['a', 300], ['b', 100]], cleared: 0 }
  const desk: RecentList = { viewed: [['c', 200], ['b', 250]], cleared: 0 }

  it('keeps every view from both devices, newest first, one per listing at its newest time', () => {
    const merged = mergeRecent(phone, desk)
    expect(recentAddresses(merged)).toEqual(['a', 'b', 'c'])
    expect(merged.viewed.find(([address]) => address === 'b')?.[1]).toBe(250)
    expect(sameRecent(merged, mergeRecent(desk, phone))).toBe(true)
  })

  it('never lets a copy that missed the other device\'s views take them away', () => {
    const stale: RecentList = { viewed: [['b', 100]], cleared: 0 }
    const published = mergeRecent(desk, EMPTY_RECENT)
    expect(recentAddresses(mergeRecent(stale, published))).toContain('c')
  })

  it('drops everything viewed up to a clear, on every device, and keeps what is viewed after it', () => {
    const clearedOnDesk: RecentList = { viewed: [], cleared: 260 }
    const merged = mergeRecent(phone, clearedOnDesk)
    expect(recentAddresses(merged)).toEqual(['a'])
    expect(merged.cleared).toBe(260)
  })

  it('keeps the newest twenty', () => {
    const many: RecentList = { viewed: Array.from({ length: 30 }, (_, index) => [`l${index}`, index] as const), cleared: 0 }
    const merged = mergeRecent(many, EMPTY_RECENT)
    expect(merged.viewed).toHaveLength(MAX_RECENT)
    expect(merged.viewed[0]?.[0]).toBe('l29')
  })

  it('reads anything that is not a list as empty', () => {
    expect(parseRecent('["30402:x:y"]')).toEqual(EMPTY_RECENT)
    expect(parseRecent('not json')).toEqual(EMPTY_RECENT)
    expect(parseRecent(null)).toEqual(EMPTY_RECENT)
    expect(recentAddresses(parseRecent(JSON.stringify({ viewed: [['a', 1], ['b', 'x'], [3, 4]], cleared: 0 })))).toEqual(['a'])
  })
})
