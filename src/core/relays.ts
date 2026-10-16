/** Whether a URL points at the reader's own machine or local network. */
const PRIVATE_HOST_RE = new RegExp(
  [
    '^localhost$',
    '\\.localhost$',
    '\\.local$',
    '^127(?:\\.\\d{1,3}){3}$',
    '^0\\.0\\.0\\.0$',
    '^10(?:\\.\\d{1,3}){3}$',
    '^192\\.168(?:\\.\\d{1,3}){2}$',
    '^172\\.(?:1[6-9]|2\\d|3[01])(?:\\.\\d{1,3}){2}$',
    '^169\\.254(?:\\.\\d{1,3}){2}$',
    '^\\[?::1?\\]?$',
    '^\\[?f[cd][0-9a-f]{2}:',
    '^\\[?fe80:',
  ].join('|'),
  'i',
)

export function isPrivateHostname(hostname: string): boolean {
  return PRIVATE_HOST_RE.test(hostname.trim())
}

/** True when a URL should never be fetched on the reader's behalf. */
export function isPrivateUrl(value: string): boolean {
  try {
    return isPrivateHostname(new URL(value).hostname)
  } catch {
    return true
  }
}
