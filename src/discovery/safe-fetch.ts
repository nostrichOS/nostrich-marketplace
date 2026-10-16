/** The address guard for any fetch of a URL somebody else chose: every address it resolves to must be public. */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { isPrivateHostname } from '../core/relays'


/** Why a URL was refused, because the three reasons deserve different answers. */
export type UrlVerdict =
  | { ok: true; url: URL }
  | { ok: false; reason: 'invalid' | 'private' | 'unresolved' }

const TEMPORARY = new Set(['EAI_AGAIN', 'ETIMEOUT', 'ETIMEDOUT', 'ESERVFAIL', 'ECONNREFUSED'])

/** Every address a hostname resolves to must be public. */
export async function resolveVerdict(hostname: string): Promise<'public' | 'private' | 'unresolved'> {
  if (isPrivateHostname(hostname)) return 'private'
  if (isIP(hostname) !== 0) return 'public'

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const addresses = await lookup(hostname, { all: true })
      if (addresses.length === 0) return 'unresolved'
      return addresses.every(address => !isPrivateHostname(address.address)) ? 'public' : 'private'
    } catch (error) {
      const code = (error as { code?: string }).code ?? ''
      if (!TEMPORARY.has(code)) return 'unresolved'
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 120))
    }
  }
  return 'unresolved'
}

/** A URL that may be fetched: https or http, and a host that resolves only to public addresses. */
export async function checkUrl(raw: string): Promise<UrlVerdict> {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'invalid' }
  }
  const verdict = await resolveVerdict(parsed.hostname)
  if (verdict === 'public') return { ok: true, url: parsed }
  return { ok: false, reason: verdict === 'private' ? 'private' : 'unresolved' }
}
