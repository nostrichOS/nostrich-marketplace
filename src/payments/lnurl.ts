/** Lightning address invoices (LUD-06, LUD-16, LUD-21) and the BOLT-11 decoding they are checked with. */

import { decode as decodeBech32Nostr } from 'nostr-tools/nip19'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils'
import type { Hex, Profile } from '../core/types'

export type ZapErrorCode =
  | 'no-lightning-address'
  /** lud16/lud06 present but unparseable. */
  | 'bad-lightning-address'
  /** DNS/TLS/timeout, or a non-2xx from the lnurlp endpoint; and the same from the callback, when no wallet server answered. */
  | 'lnurl-unreachable'
  /** Reached the server, but the payRequest document is malformed or an LNURL error. */
  | 'lnurl-invalid'
  /** Requested amount outside minSendable..maxSendable. */
  | 'amount-out-of-range'
  /** The callback answered, but with an error or without an invoice. */
  | 'callback-failed'
  | 'invoice-mismatch'
  | 'not-a-zap-receipt'
  /** Receipt id/sig do not check out. */
  | 'bad-signature'
  /** Receipt signed by someone other than the recipient's LNURL server key. */
  | 'wrong-issuer'
  | 'missing-bolt11'
  | 'bad-bolt11'
  /** No `description` tag, or it does not parse as a signed kind-9734. */
  | 'bad-zap-request'
  /** sha256(description) != the invoice's description_hash. */
  | 'description-hash-mismatch'
  /** Invoice amount disagrees with the zap request's amount tag. */
  | 'amount-mismatch'
  /** Receipt is for a different pubkey or a different note than we asked about. */
  | 'target-mismatch'

export interface ZapError {
  code: ZapErrorCode
  message: string
}

export type ZapResult<T> = { ok: true; value: T } | { ok: false; error: ZapError }

function fail(code: ZapErrorCode, message: string): { ok: false; error: ZapError } {
  return { ok: false, error: { code, message } }
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export interface ZapHttpOptions {
  fetch?: FetchLike
  /** Per-request budget. */
  timeoutMs?: number
}

const DEFAULT_HTTP_TIMEOUT_MS = 15_000

async function getJson(
  url: string,
  opts: ZapHttpOptions,
  /** For the callback: an LNURL server may refuse under an error status, in LNURL's own JSON (`status: ERROR` and a reason). */
  readRefusal = false,
): Promise<ZapResult<unknown>> {
  const doFetch: FetchLike | undefined = opts.fetch ?? (typeof fetch === 'function' ? fetch : undefined)
  if (!doFetch) return fail('lnurl-unreachable', 'no fetch implementation available')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS)
  try {
    const res = await doFetch(url, { signal: controller.signal })
    if (!res.ok) {
      if (readRefusal) {
        const refusal: unknown = await res.json().catch(() => undefined)
        if (isRecord(refusal) && refusal['status'] === 'ERROR') return { ok: true, value: refusal }
      }
      return fail('lnurl-unreachable', `HTTP ${res.status} from ${url}`)
    }
    return { ok: true, value: await res.json() }
  } catch (e) {
    return fail('lnurl-unreachable', `${url}: ${errorText(e)}`)
  } finally {
    clearTimeout(timer)
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

const HEX64 = /^[0-9a-f]{64}$/

function isHex64(value: unknown): value is Hex {
  return typeof value === 'string' && HEX64.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** LUD-16: `user@domain` -> `https://domain/.well-known/lnurlp/user`. */
export function lightningAddressToUrl(address: string): string | null {
  const trimmed = address.trim().replace(/^₿/, '')
  const at = trimmed.lastIndexOf('@')
  if (at <= 0 || at === trimmed.length - 1) return null

  const name = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1).toLowerCase()

  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null
  if (/^\.+$/.test(name)) return null
  if (!/^[a-z0-9.-]+$/.test(domain) || !domain.includes('.')) return null

  const scheme = domain.endsWith('.onion') ? 'http' : 'https'
  return `${scheme}://${domain}/.well-known/lnurlp/${name}`
}

/** LUD-06: bech32 `lnurl1...` (or a bare https URL, which some clients store in lud06). */
export function lnurlToUrl(lnurl: string): string | null {
  const raw = lnurl.trim().replace(/^lightning:/i, '')
  if (/^https?:\/\//i.test(raw)) return raw

  const decoded = bech32Decode(raw)
  if (!decoded || decoded.hrp !== 'lnurl') return null
  const bytes = wordsToBytes(decoded.words)
  if (!bytes) return null
  const url = new TextDecoder().decode(bytes)
  return /^https?:\/\//i.test(url) ? url : null
}

/** bech32 `lnurl1...` form of a pay endpoint, for the zap request's `lnurl` tag. */
export function encodeLnurl(url: string): string {
  return bech32Encode('lnurl', bytesToWords(utf8ToBytes(url)))
}

/** The lnurlp URL for a profile, preferring lud16 the way every other client does. */
export function zapEndpointUrl(recipient: Pick<Profile, 'lud16' | 'lud06'>): string | null {
  if (recipient.lud16) {
    const url = lightningAddressToUrl(recipient.lud16)
    if (url) return url
  }
  if (recipient.lud06) return lnurlToUrl(recipient.lud06)
  return null
}

export interface LnurlPayEndpoint {
  /** Where to GET an invoice from. */
  callback: string
  minSendable: number
  maxSendable: number
  /** LUD-06 metadata string. */
  metadata: string
  /** Max comment length on a plain LNURL payment. */
  commentAllowed: number
  /** Set only when the server advertises BOTH `allowsNostr: true` and a usable `nostrPubkey`. */
  zapPubkey?: Hex
  /** The lnurlp URL these params came from. */
  sourceUrl: string
  /** bech32 form of `sourceUrl`, echoed back in the zap request and the callback. */
  lnurl: string
}

/** Fetch and validate a recipient's LNURL-pay params. */
export async function resolveZapEndpoint(
  recipient: Pick<Profile, 'lud16' | 'lud06'>,
  opts: ZapHttpOptions = {},
): Promise<ZapResult<LnurlPayEndpoint>> {
  if (!recipient.lud16 && !recipient.lud06) {
    return fail('no-lightning-address', 'profile has no lud16 or lud06')
  }
  const url = zapEndpointUrl(recipient)
  if (!url) return fail('bad-lightning-address', `cannot parse ${recipient.lud16 ?? recipient.lud06}`)

  const res = await getJson(url, opts)
  if (!res.ok) return res
  return parseLnurlPayParams(res.value, url)
}

/** Reads an LNURL-pay document, refusing one that is malformed. */
export function parseLnurlPayParams(body: unknown, sourceUrl: string): ZapResult<LnurlPayEndpoint> {
  if (!isRecord(body)) return fail('lnurl-invalid', `${sourceUrl} did not return a JSON object`)
  if (body['status'] === 'ERROR') {
    const reason = typeof body['reason'] === 'string' ? body['reason'] : 'unspecified'
    return fail('lnurl-invalid', `${sourceUrl}: ${reason}`)
  }
  if (body['tag'] !== 'payRequest') return fail('lnurl-invalid', `${sourceUrl} is not a payRequest`)

  const callback = body['callback']
  if (typeof callback !== 'string' || !/^https?:\/\//i.test(callback)) {
    return fail('lnurl-invalid', `${sourceUrl} has no usable callback URL`)
  }

  const minSendable = body['minSendable']
  const maxSendable = body['maxSendable']
  /** `maxSendable: 0` is an answer, not a malformed document. */
  if (typeof maxSendable === 'number' && maxSendable === 0) {
    return fail('lnurl-invalid', `${sourceUrl} cannot receive payments right now (its wallet reports no receive capacity)`)
  }
  if (typeof minSendable !== 'number' || typeof maxSendable !== 'number' || minSendable > maxSendable) {
    return fail('lnurl-invalid', `${sourceUrl} has no usable min/maxSendable`)
  }

  const metadata = typeof body['metadata'] === 'string' ? body['metadata'] : ''
  const commentAllowed = typeof body['commentAllowed'] === 'number' ? body['commentAllowed'] : 0

  const endpoint: LnurlPayEndpoint = {
    callback,
    minSendable,
    maxSendable,
    metadata,
    commentAllowed,
    sourceUrl,
    lnurl: encodeLnurl(sourceUrl),
  }

  if (body['allowsNostr'] === true) {
    const advertised = body['nostrPubkey']
    const hex =
      typeof advertised === 'string' && advertised.startsWith('npub1') ? npubToHex(advertised) : advertised
    if (isHex64(hex)) endpoint.zapPubkey = hex
  }

  return { ok: true, value: endpoint }
}

function npubToHex(npub: string): Hex | null {
  try {
    const decoded = decodeBech32Nostr(npub)
    return decoded.type === 'npub' ? decoded.data : null
  } catch {
    return null
  }
}

function amountOutOfRange(endpoint: LnurlPayEndpoint, amountMsat: number): { ok: false; error: ZapError } | undefined {
  if (amountMsat >= endpoint.minSendable && amountMsat <= endpoint.maxSendable) return undefined
  return fail(
    'amount-out-of-range',
    `${amountMsat} msat outside ${endpoint.minSendable}..${endpoint.maxSendable} accepted by ${endpoint.sourceUrl}`,
  )
}

function commitsToMetadata(invoice: DecodedInvoice, endpoint: LnurlPayEndpoint): boolean {
  return (
    invoice.descriptionHash === sha256Hex(endpoint.metadata) ||
    (invoice.descriptionHash === undefined && invoice.description === endpoint.metadata)
  )
}

async function fetchCallbackInvoice(
  endpoint: LnurlPayEndpoint,
  query: URLSearchParams,
  amountMsat: number,
  http: ZapHttpOptions,
): Promise<ZapResult<{ bolt11: string; invoice: DecodedInvoice & { amountMsat: number }; verify?: string }>> {
  const separator = endpoint.callback.includes('?') ? '&' : '?'
  const res = await getJson(`${endpoint.callback}${separator}${query.toString()}`, http, true)
  if (!res.ok) return { ok: false, error: res.error }

  const body = res.value
  if (!isRecord(body)) return fail('callback-failed', `${endpoint.callback} did not return a JSON object`)
  if (body['status'] === 'ERROR') {
    const reason = typeof body['reason'] === 'string' ? body['reason'] : 'unspecified'
    return fail('callback-failed', `${endpoint.callback}: ${reason}`)
  }
  const bolt11 = body['pr']
  if (typeof bolt11 !== 'string' || bolt11.length === 0) {
    return fail('callback-failed', `${endpoint.callback} returned no invoice`)
  }

  const invoice = decodeBolt11(bolt11)
  if (!invoice) return fail('invoice-mismatch', 'callback returned an undecodable invoice')
  if (invoice.amountMsat === null) {
    return fail('invoice-mismatch', 'callback returned an amountless invoice')
  }
  if (invoice.amountMsat !== amountMsat) {
    return fail('invoice-mismatch', `asked for ${amountMsat} msat, invoice is for ${invoice.amountMsat}`)
  }
  const verify = typeof body['verify'] === 'string' && /^https:\/\//iu.test(body['verify']) ? body['verify'] : undefined
  return { ok: true, value: { bolt11, invoice: { ...invoice, amountMsat: invoice.amountMsat }, ...(verify === undefined ? {} : { verify }) } }
}

export interface PlainInvoice {
  bolt11: string
  amountMsat: number
  paymentHash?: Hex
  committed: boolean
  endpoint: LnurlPayEndpoint
  verify?: string
}

export interface CreatePlainInvoiceInput {
  recipient: Pick<Profile, 'lud16' | 'lud06'>
  amountMsat: number
  /** LUD-12 comment, sent only when the server takes one, and cut to the length it allows. */
  comment?: string
  http?: ZapHttpOptions
  /** How to read the pay document when a browser cannot ask for it directly. */
  resolveEndpoint?: (recipient: Pick<Profile, 'lud16' | 'lud06'>) => Promise<ZapResult<LnurlPayEndpoint>>
}

/** Asks a lightning address for an invoice for exactly this amount, with its LUD-21 verify link when offered. */
export async function createPlainInvoice(input: CreatePlainInvoiceInput): Promise<ZapResult<PlainInvoice>> {
  const http = input.http ?? {}
  const resolved = await (input.resolveEndpoint ?? (recipient => resolveZapEndpoint(recipient, http)))(input.recipient)
  if (!resolved.ok) return resolved
  const endpoint = resolved.value

  const range = amountOutOfRange(endpoint, input.amountMsat)
  if (range) return range

  const query = new URLSearchParams({ amount: String(input.amountMsat) })
  if (input.comment && endpoint.commentAllowed > 0) {
    query.set('comment', input.comment.slice(0, endpoint.commentAllowed))
  }

  const fetched = await fetchCallbackInvoice(endpoint, query, input.amountMsat, http)
  if (!fetched.ok) return fetched
  const { bolt11, invoice, verify } = fetched.value

  const value: PlainInvoice = {
    bolt11,
    amountMsat: invoice.amountMsat,
    committed: endpoint.metadata !== '' && commitsToMetadata(invoice, endpoint),
    endpoint,
  }
  if (invoice.paymentHash !== undefined) value.paymentHash = invoice.paymentHash
  if (verify !== undefined) value.verify = verify
  return { ok: true, value }
}

function sha256Hex(input: string): Hex {
  return bytesToHex(sha256(utf8ToBytes(input)))
}

export interface DecodedInvoice {
  amountMsat: number | null
  timestamp: number
  expirySeconds: number
  network: string
  paymentHash?: Hex
  /** The `h` field. */
  descriptionHash?: Hex
  /** The `d` field, when the payee inlined the description instead of hashing it. */
  description?: string
}

/** The payment hash a settled payment's preimage proves, or null for anything that is not a 32-byte hex preimage. */
export function paymentHashOfPreimage(preimage: string): Hex | null {
  if (!/^[0-9a-f]{64}$/i.test(preimage)) return null
  return bytesToHex(sha256(hexToBytes(preimage.toLowerCase())))
}

/** Enough of BOLT-11 to say how much an invoice is for and which payment hash it carries. */
export function decodeBolt11(invoice: string): DecodedInvoice | null {
  let answer = decodedInvoices.get(invoice)
  if (answer === undefined) {
    answer = decodeBolt11Now(invoice)
    if (decodedInvoices.size >= DECODED_CAP) decodedInvoices.clear()
    decodedInvoices.set(invoice, answer)
  }
  return answer === null ? null : { ...answer }
}

const DECODED_CAP = 2_000
const decodedInvoices = new Map<string, DecodedInvoice | null>()

function decodeBolt11Now(invoice: string): DecodedInvoice | null {
  const decoded = bech32Decode(invoice.trim().replace(/^lightning:/i, ''))
  if (!decoded) return null

  const hrp = /^ln(bcrt|bc|tbs|tb|sb)(\d+)?([munp])?$/.exec(decoded.hrp)
  if (!hrp) return null
  const network = hrp[1] ?? ''
  const amountMsat = hrpAmountToMsat(hrp[2], hrp[3])
  if (amountMsat === undefined) return null

  const words = decoded.words
  const fieldsEnd = words.length - SIGNATURE_WORDS
  if (fieldsEnd < TIMESTAMP_WORDS) return null

  let timestamp = 0
  for (let i = 0; i < TIMESTAMP_WORDS; i++) timestamp = timestamp * 32 + (words[i] ?? 0)

  const result: DecodedInvoice = { amountMsat, timestamp, expirySeconds: DEFAULT_EXPIRY_SECONDS, network }

  let pos = TIMESTAMP_WORDS
  while (pos + 3 <= fieldsEnd) {
    const type = words[pos]
    const lenHigh = words[pos + 1]
    const lenLow = words[pos + 2]
    if (type === undefined || lenHigh === undefined || lenLow === undefined) return null
    const length = lenHigh * 32 + lenLow
    pos += 3
    if (pos + length > fieldsEnd) return null
    const data = words.slice(pos, pos + length)
    pos += length

    switch (type) {
      case FIELD_PAYMENT_HASH: {
        const bytes = wordsToBytes(data)
        if (bytes && bytes.length === 32) result.paymentHash = bytesToHex(bytes)
        break
      }
      case FIELD_DESCRIPTION_HASH: {
        const bytes = wordsToBytes(data)
        if (bytes && bytes.length === 32) result.descriptionHash = bytesToHex(bytes)
        break
      }
      case FIELD_DESCRIPTION: {
        const bytes = wordsToBytes(data)
        if (bytes) result.description = new TextDecoder().decode(bytes)
        break
      }
      case FIELD_EXPIRY: {
        let expiry = 0
        for (const word of data) expiry = expiry * 32 + word
        result.expirySeconds = expiry
        break
      }
      default:
        break
    }
  }

  return result
}

const TIMESTAMP_WORDS = 7
const SIGNATURE_WORDS = 104
const DEFAULT_EXPIRY_SECONDS = 3600
const FIELD_PAYMENT_HASH = 1
const FIELD_DESCRIPTION = 13
const FIELD_EXPIRY = 6
const FIELD_DESCRIPTION_HASH = 23

/** `undefined` = malformed, `null` = the invoice deliberately has no amount. */
function hrpAmountToMsat(digits: string | undefined, multiplier: string | undefined): number | null | undefined {
  if (digits === undefined || digits.length === 0) return multiplier === undefined ? null : undefined

  const value = BigInt(digits)
  let msat: bigint
  switch (multiplier) {
    case undefined:
      msat = value * 100_000_000_000n
      break
    case 'm':
      msat = value * 100_000_000n
      break
    case 'u':
      msat = value * 100_000n
      break
    case 'n':
      msat = value * 100n
      break
    case 'p':
      if (value % 10n !== 0n) return undefined
      msat = value / 10n
      break
    default:
      return undefined
  }
  if (msat > BigInt(Number.MAX_SAFE_INTEGER)) return undefined
  return Number(msat)
}

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32_GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

function bech32Polymod(values: number[]): number {
  let checksum = 1
  for (const value of values) {
    const top = checksum >>> 25
    checksum = ((checksum & 0x1ffffff) << 5) ^ value
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) checksum ^= BECH32_GENERATOR[i] ?? 0
    }
  }
  return checksum
}

function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = []
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5)
  out.push(0)
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31)
  return out
}

function bech32Decode(input: string): { hrp: string; words: number[] } | null {
  const raw = input.trim()
  if (raw.length < 8) return null
  if (raw !== raw.toLowerCase() && raw !== raw.toUpperCase()) return null

  const lower = raw.toLowerCase()
  const separator = lower.lastIndexOf('1')
  if (separator < 1 || separator + 7 > lower.length) return null

  const hrp = lower.slice(0, separator)
  const words: number[] = []
  for (let i = separator + 1; i < lower.length; i++) {
    const value = BECH32_CHARSET.indexOf(lower.charAt(i))
    if (value === -1) return null
    words.push(value)
  }
  if (bech32Polymod([...bech32HrpExpand(hrp), ...words]) !== 1) return null
  return { hrp, words: words.slice(0, -6) }
}

function bech32Encode(hrp: string, words: number[]): string {
  const checksumInput = [...bech32HrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0]
  const polymod = bech32Polymod(checksumInput) ^ 1
  const checksum: number[] = []
  for (let i = 0; i < 6; i++) checksum.push((polymod >> (5 * (5 - i))) & 31)

  let out = `${hrp}1`
  for (const word of [...words, ...checksum]) out += BECH32_CHARSET.charAt(word)
  return out
}

/** 5-bit groups -> bytes. */
function wordsToBytes(words: number[]): Uint8Array | null {
  let acc = 0
  let bits = 0
  const out: number[] = []
  for (const word of words) {
    if (word < 0 || word > 31) return null
    acc = (acc << 5) | word
    bits += 5
    while (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 0xff)
    }
  }
  return Uint8Array.from(out)
}

function bytesToWords(bytes: Uint8Array): number[] {
  let acc = 0
  let bits = 0
  const out: number[] = []
  for (const byte of bytes) {
    acc = (acc << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out.push((acc >> bits) & 31)
    }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31)
  return out
}
