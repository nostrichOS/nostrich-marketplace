/** One listing per product: another seller’s copy, and a seller’s own exact repeats. */

export interface CopyCandidate {
  address: string
  pubkey: string
  title: string
  images: readonly string[]
  /** When it says it was first listed: `published_at`, else the event's `created_at`. */
  listedAt: number
  /** The price as one string (amount, currency, frequency), for telling a repeat from a variant. */
  price?: string
}

export interface CopyGroup {
  members: CopyCandidate[]
  /** The picture keys its members share across sellers. */
  pictures: string[]
}

const SHA256 = /\b([0-9a-f]{64})\b/iu

/** A picture's identity: a Blossom blob by its hash wherever it is served, anything else by its URL without the query. */
export function pictureKey(url: string): string {
  try {
    const parsed = new URL(url)
    const blob = SHA256.exec(parsed.pathname)
    if (blob !== null) return `sha256:${blob[1]!.toLowerCase()}`
    return `${parsed.host.toLowerCase()}${parsed.pathname}`
  } catch {
    return url.trim()
  }
}

/** A title reduced to its words: lower case, letters and digits in any script, single spaces. */
export function titleWords(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** The same title, or one holding the other as whole words (at least four characters of it). */
export function sameTitle(a: string, b: string): boolean {
  const x = titleWords(a)
  const y = titleWords(b)
  if (x === '' || y === '') return false
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return short.length >= 4 && ` ${long} `.includes(` ${short} `)
}

/** Listings from different sellers joined by a shared picture and a matching title, grouped. */
export function copyGroups(candidates: readonly CopyCandidate[]): CopyGroup[] {
  const byPicture = new Map<string, CopyCandidate[]>()
  for (const candidate of candidates) {
    for (const key of new Set(candidate.images.map(pictureKey))) {
      const held = byPicture.get(key)
      if (held === undefined) byPicture.set(key, [candidate])
      else held.push(candidate)
    }
  }
  const parent = new Map<string, string>()
  const find = (address: string): string => {
    let root = address
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!
    parent.set(address, root)
    return root
  }
  const shared = new Map<string, Set<string>>()
  for (const [key, members] of byPicture) {
    if (new Set(members.map(member => member.pubkey)).size < 2) continue
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const a = members[i]!
        const b = members[j]!
        if (a.pubkey === b.pubkey || !sameTitle(a.title, b.title)) continue
        if (!parent.has(a.address)) parent.set(a.address, a.address)
        if (!parent.has(b.address)) parent.set(b.address, b.address)
        parent.set(find(a.address), find(b.address))
        for (const address of [a.address, b.address]) {
          const keys = shared.get(address) ?? new Set<string>()
          keys.add(key)
          shared.set(address, keys)
        }
      }
    }
  }
  const byAddress = new Map(candidates.map(candidate => [candidate.address, candidate]))
  const groups = new Map<string, CopyGroup>()
  for (const address of parent.keys()) {
    const root = find(address)
    const group = groups.get(root) ?? { members: [], pictures: [] }
    const member = byAddress.get(address)
    if (member !== undefined) group.members.push(member)
    for (const key of shared.get(address) ?? []) if (!group.pictures.includes(key)) group.pictures.push(key)
    groups.set(root, group)
  }
  return [...groups.values()].filter(group => new Set(group.members.map(member => member.pubkey)).size > 1)
}

/** The seller whose listing stays. */
export function originalSeller(group: CopyGroup, uploaded: (pubkey: string) => boolean | undefined, listings: (pubkey: string) => number): string {
  const sellers = [...new Set(group.members.map(member => member.pubkey))]
  const uploaders = sellers.filter(pubkey => uploaded(pubkey) === true)
  if (uploaders.length === 1) return uploaders[0]!
  const pool = uploaders.length > 1 ? uploaders : sellers
  const first = (pubkey: string): number => Math.min(...group.members.filter(member => member.pubkey === pubkey).map(member => member.listedAt))
  return [...pool].sort((a, b) => first(a) - first(b) || listings(a) - listings(b) || (a < b ? -1 : 1))[0]!
}

/** Every copy's address, and the original listing it copies. */
export function copiesOf(groups: readonly CopyGroup[], uploaded: (group: CopyGroup, pubkey: string) => boolean | undefined, listings: (pubkey: string) => number): Map<string, string> {
  const copies = new Map<string, string>()
  for (const group of groups) {
    const original = originalSeller(group, pubkey => uploaded(group, pubkey), listings)
    const kept = [...group.members].filter(member => member.pubkey === original).sort((a, b) => a.listedAt - b.listedAt)[0]
    if (kept === undefined) continue
    for (const member of group.members) if (member.pubkey !== original) copies.set(member.address, kept.address)
  }
  return copies
}

/** A seller's exact repeats (same title, cover and price): each repeat's address, and the newest listing that stays. */
export function repeatsOf(candidates: readonly CopyCandidate[]): Map<string, string> {
  const groups = new Map<string, CopyCandidate[]>()
  for (const candidate of candidates) {
    const cover = candidate.images[0]
    const words = titleWords(candidate.title)
    if (cover === undefined || words === '') continue
    const key = `${candidate.pubkey}|${words}|${pictureKey(cover)}|${candidate.price ?? ''}`
    const held = groups.get(key)
    if (held === undefined) groups.set(key, [candidate])
    else held.push(candidate)
  }
  const repeats = new Map<string, string>()
  for (const members of groups.values()) {
    if (members.length < 2) continue
    const kept = [...members].sort((a, b) => b.listedAt - a.listedAt || (a.address < b.address ? -1 : 1))[0]!
    for (const member of members) if (member.address !== kept.address) repeats.set(member.address, kept.address)
  }
  return repeats
}

/** A Blossom blob's hash, when a picture key names one. */
export function blobHash(key: string): string | undefined {
  return key.startsWith('sha256:') ? key.slice(7) : undefined
}
