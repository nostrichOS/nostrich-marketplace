/** Recently viewed listings, merged across devices view by view. */

/** Views kept, newest first. */
export const MAX_RECENT = 20

export interface RecentList {
  /** `[address, seconds]`, newest first, one per address. */
  viewed: (readonly [string, number])[]
  /** Everything viewed at or before this second has been cleared; 0 when never. */
  cleared: number
}

export const EMPTY_RECENT: RecentList = { viewed: [], cleared: 0 }

/** A stored or published list, or empty for anything that is not one. */
export function parseRecent(raw: string | null | undefined): RecentList {
  if (raw === null || raw === undefined) return EMPTY_RECENT
  try {
    const parsed = JSON.parse(raw) as { viewed?: unknown; cleared?: unknown }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return EMPTY_RECENT
    const cleared = typeof parsed.cleared === 'number' && Number.isFinite(parsed.cleared) ? parsed.cleared : 0
    const viewed = Array.isArray(parsed.viewed)
      ? parsed.viewed.filter((entry): entry is [string, number] => Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number' && Number.isFinite(entry[1]))
      : []
    return mergeRecent({ viewed, cleared }, EMPTY_RECENT)
  } catch {
    return EMPTY_RECENT
  }
}

/** Both lists' views, the newest time per address, none at or before either clear, newest first, `MAX_RECENT` at most. */
export function mergeRecent(a: RecentList, b: RecentList): RecentList {
  const cleared = Math.max(a.cleared, b.cleared)
  const newest = new Map<string, number>()
  for (const [address, at] of [...a.viewed, ...b.viewed]) {
    if (at <= cleared) continue
    const held = newest.get(address)
    if (held === undefined || at > held) newest.set(address, at)
  }
  const viewed = [...newest]
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    .slice(0, MAX_RECENT)
  return { viewed, cleared }
}

/** The same views and the same clear: nothing to keep and nothing to publish. */
export function sameRecent(a: RecentList, b: RecentList): boolean {
  return a.cleared === b.cleared && a.viewed.length === b.viewed.length && a.viewed.every(([address, at], index) => b.viewed[index]?.[0] === address && b.viewed[index]?.[1] === at)
}

/** The listings, newest view first. */
export function recentAddresses(list: RecentList): string[] {
  return list.viewed.map(([address]) => address)
}
