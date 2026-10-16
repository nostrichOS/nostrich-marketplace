/** Whether a listing’s picture still exists: gone only on an answer that says so. */

import { checkUrl } from './safe-fetch'

export type PictureState = 'ok' | 'dead' | 'unsure'

/** What one ask says: the picture answered, its host says it is not there, it looks gone, or nothing can be concluded. */
export type PictureAnswer = 'ok' | 'missing' | 'gone' | 'unsure'

export interface PictureCheck {
  url: string
  state: PictureState
  /** Consecutive `gone` answers; any `ok` resets it. */
  strikes: number
  checkedAt: Date
}

/** Answers that say gone, needed in a row, before a picture is dead. */
export const STRIKES = 2

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** When a picture is asked again: a live one daily, a suspect one hourly, an unclear one every six hours, a dead one daily. */
export function checkDue(check: PictureCheck | undefined, now: number): boolean {
  if (check === undefined) return true
  const age = now - check.checkedAt.getTime()
  if (check.state === 'ok') return age >= DAY
  if (check.state === 'dead') return age >= DAY
  return age >= (check.strikes > 0 ? HOUR : 6 * HOUR)
}

/** The next state from the last one and a new answer. */
export function nextCheck(url: string, previous: PictureCheck | undefined, answer: PictureAnswer, now: Date): PictureCheck {
  if (answer === 'ok') return { url, state: 'ok', strikes: 0, checkedAt: now }
  if (answer === 'missing') return { url, state: 'dead', strikes: Math.max(STRIKES, previous?.strikes ?? 0), checkedAt: now }
  if (answer === 'gone') {
    const strikes = (previous?.strikes ?? 0) + 1
    return { url, state: strikes >= STRIKES ? 'dead' : 'unsure', strikes, checkedAt: now }
  }
  return { url, state: previous?.state === 'dead' ? 'dead' : 'unsure', strikes: previous?.strikes ?? 0, checkedAt: now }
}

const TIMEOUT_MS = 8_000
const HOPS = 3
const GONE_STATUS = new Set([404, 410])
/** Connection errors that mean the host is not there, as opposed to slow or busy. */
const GONE_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED'])

/** Ask a picture whether it exists, following redirects by hand so every hop is checked. */
export async function askPicture(raw: string, fetchImpl: typeof fetch = fetch): Promise<PictureAnswer> {
  let url = raw
  for (let hop = 0; hop <= HOPS; hop += 1) {
    const verdict = await checkUrl(url)
    if (!verdict.ok) return 'gone'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetchImpl(verdict.url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { range: 'bytes=0-1023', accept: 'image/*', 'user-agent': 'Mozilla/5.0 (compatible; picture-check)' },
      })
      await response.body?.cancel().catch(() => undefined)
      if (response.status >= 300 && response.status < 400) {
        const next = response.headers.get('location')
        if (next === null) return 'unsure'
        url = new URL(next, verdict.url).toString()
        continue
      }
      if (response.ok) return (response.headers.get('content-type') ?? '').toLowerCase().startsWith('text/html') ? 'gone' : 'ok'
      return GONE_STATUS.has(response.status) ? 'missing' : 'unsure'
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code ?? ''
      return GONE_CODES.has(code) ? 'gone' : 'unsure'
    } finally {
      clearTimeout(timer)
    }
  }
  return 'unsure'
}

/** The order to ask pictures in: one host after another, never one small server many times at once. */
export function byHost(urls: readonly string[]): string[] {
  const hosts = new Map<string, string[]>()
  for (const url of urls) {
    let host = ''
    try {
      host = new URL(url).host
    } catch {
    }
    const list = hosts.get(host)
    if (list === undefined) hosts.set(host, [url])
    else list.push(url)
  }
  const out: string[] = []
  const lists = [...hosts.values()]
  for (let round = 0; out.length < urls.length; round += 1) {
    for (const list of lists) {
      const url = list[round]
      if (url !== undefined) out.push(url)
    }
  }
  return out
}
