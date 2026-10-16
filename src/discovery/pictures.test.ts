import { describe, expect, it, vi } from 'vitest'

vi.mock('./safe-fetch', () => ({
  checkUrl: async (raw: string) => {
    const url = new URL(raw)
    return url.hostname === 'private.test' ? { ok: false, reason: 'private' } : { ok: true, url }
  },
}))

const { askPicture, byHost, checkDue, nextCheck, STRIKES } = await import('./pictures')

const answer = (status: number, headers: Record<string, string> = {}): typeof fetch =>
  (async () => new Response(status === 204 ? null : 'x', { status, headers })) as unknown as typeof fetch

describe('asking a picture', () => {
  it('reads 2xx as there, 404 and 410 as the host saying it is missing, and everything else as unclear', async () => {
    expect(await askPicture('https://i.example/a.jpg', answer(206))).toBe('ok')
    expect(await askPicture('https://i.example/a.jpg', answer(404))).toBe('missing')
    expect(await askPicture('https://i.example/a.jpg', answer(410))).toBe('missing')
    expect(await askPicture('https://i.example/a.jpg', answer(200, { 'content-type': 'text/html; charset=utf-8' }))).toBe('gone')
    expect(await askPicture('https://i.example/a.jpg', answer(403))).toBe('unsure')
    expect(await askPicture('https://i.example/a.jpg', answer(502))).toBe('unsure')
  })

  it('takes a name that does not resolve or a refused connection for gone, and a timeout for unclear', async () => {
    const failing = (code: string): typeof fetch => (async () => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code } }))) as unknown as typeof fetch
    expect(await askPicture('https://tunnel.example/a.png', failing('ENOTFOUND'))).toBe('gone')
    expect(await askPicture('https://i.example/a.png', failing('ECONNREFUSED'))).toBe('gone')
    expect(await askPicture('https://i.example/a.png', failing('UND_ERR_CONNECT_TIMEOUT'))).toBe('unsure')
  })

  it('checks every hop of a redirect, so a public address cannot lead the box inside', async () => {
    const hops = vi.fn(async (url: URL) =>
      url.hostname === 'i.example' ? new Response(null, { status: 302, headers: { location: 'http://private.test/x' } }) : new Response('x', { status: 200 }),
    )
    expect(await askPicture('https://i.example/a.jpg', hops as unknown as typeof fetch)).toBe('gone')
    expect(hops).toHaveBeenCalledTimes(1)
  })
})

describe('what an answer does', () => {
  const now = new Date('2026-09-29T20:00:00Z')
  it('needs two gone answers before a picture is dead, and one that loads clears it', () => {
    const first = nextCheck('u', undefined, 'gone', now)
    expect(first).toMatchObject({ state: 'unsure', strikes: 1 })
    const second = nextCheck('u', first, 'gone', now)
    expect(second).toMatchObject({ state: 'dead', strikes: STRIKES })
    expect(nextCheck('u', second, 'unsure', now).state).toBe('dead')
    expect(nextCheck('u', second, 'ok', now)).toMatchObject({ state: 'ok', strikes: 0 })
  })

  it('takes a 404 from a picture that was there for dead at once (2026-09-29, "no image products, no showing them")', () => {
    const live = nextCheck('u', undefined, 'ok', now)
    expect(nextCheck('u', live, 'missing', now)).toMatchObject({ state: 'dead', strikes: STRIKES })
  })

  it('asks a suspect picture again after an hour, a live one daily and a dead one daily', () => {
    const at = now.getTime()
    const hour = 60 * 60 * 1000
    expect(checkDue(undefined, at)).toBe(true)
    expect(checkDue({ url: 'u', state: 'unsure', strikes: 1, checkedAt: now }, at + hour - 1)).toBe(false)
    expect(checkDue({ url: 'u', state: 'unsure', strikes: 1, checkedAt: now }, at + hour)).toBe(true)
    expect(checkDue({ url: 'u', state: 'ok', strikes: 0, checkedAt: now }, at + 23 * hour)).toBe(false)
    expect(checkDue({ url: 'u', state: 'ok', strikes: 0, checkedAt: now }, at + 24 * hour)).toBe(true)
    expect(checkDue({ url: 'u', state: 'dead', strikes: 2, checkedAt: now }, at + 24 * hour)).toBe(true)
  })

  it('asks one host after another', () => {
    expect(byHost(['https://a.test/1', 'https://a.test/2', 'https://a.test/3', 'https://b.test/1'])).toEqual(['https://a.test/1', 'https://b.test/1', 'https://a.test/2', 'https://a.test/3'])
  })
})
