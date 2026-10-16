/** Bitcoin addresses checked by their own checksum (bech32, bech32m, base58check). */

import { sha256 } from '@noble/hashes/sha256'

export type BitcoinNetwork = 'mainnet' | 'testnet'

export interface BitcoinAddress {
  /** As it is stored, published and paid: bech32 lower-cased, base58 untouched. */
  address: string
  network: BitcoinNetwork
  kind: 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr' | 'segwit'
}

/** The fewest sats an order can be to be paid on-chain: under the network's dust line a payment is not relayed at all. */
export const ONCHAIN_MIN_SATS = 1_000
/** Confirmations before an on-chain order counts as paid. */
export const ONCHAIN_CONFIRMATIONS = 3

const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32_CONST = 1
const BECH32M_CONST = 0x2bc830a3
const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function polymod(values: readonly number[]): number {
  let check = 1
  for (const value of values) {
    const top = check >>> 25
    check = ((check & 0x1ffffff) << 5) ^ value
    for (let bit = 0; bit < 5; bit += 1) if ((top >>> bit) & 1) check ^= GENERATORS[bit] ?? 0
  }
  return check >>> 0
}

function hrpExpand(hrp: string): number[] {
  const high = [...hrp].map(char => char.charCodeAt(0) >>> 5)
  const low = [...hrp].map(char => char.charCodeAt(0) & 31)
  return [...high, 0, ...low]
}

/** Five-bit groups to bytes, with no padding left over (BIP-173's `convertbits`, strict). */
function toBytes(groups: readonly number[]): number[] | undefined {
  let acc = 0
  let bits = 0
  const out: number[] = []
  for (const group of groups) {
    acc = (acc << 5) | group
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((acc >>> bits) & 0xff)
    }
  }
  if (bits >= 5 || ((acc << (8 - bits)) & 0xff) !== 0) return undefined
  return out
}

function segwit(text: string): BitcoinAddress | undefined {
  if (text !== text.toLowerCase() && text !== text.toUpperCase()) return undefined
  const lower = text.toLowerCase()
  const at = lower.lastIndexOf('1')
  if (at < 1 || at + 7 > lower.length || lower.length > 90) return undefined
  const hrp = lower.slice(0, at)
  if (hrp !== 'bc' && hrp !== 'tb' && hrp !== 'bcrt') return undefined
  const data: number[] = []
  for (const char of lower.slice(at + 1)) {
    const value = BECH32.indexOf(char)
    if (value === -1) return undefined
    data.push(value)
  }
  const check = polymod([...hrpExpand(hrp), ...data])
  const version = data[0]
  if (version === undefined || version > 16) return undefined
  if (check !== (version === 0 ? BECH32_CONST : BECH32M_CONST)) return undefined
  const program = toBytes(data.slice(1, -6))
  if (program === undefined || program.length < 2 || program.length > 40) return undefined
  if (version === 0 && program.length !== 20 && program.length !== 32) return undefined
  const kind = version === 0 ? (program.length === 20 ? 'p2wpkh' : 'p2wsh') : version === 1 && program.length === 32 ? 'p2tr' : 'segwit'
  return { address: lower, network: hrp === 'bc' ? 'mainnet' : 'testnet', kind }
}

function base58(text: string): BitcoinAddress | undefined {
  if (text.length < 26 || text.length > 35) return undefined
  let value = 0n
  for (const char of text) {
    const digit = BASE58.indexOf(char)
    if (digit === -1) return undefined
    value = value * 58n + BigInt(digit)
  }
  const bytes: number[] = []
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn))
    value >>= 8n
  }
  for (const char of text) {
    if (char !== '1') break
    bytes.unshift(0)
  }
  if (bytes.length !== 25) return undefined
  const payload = Uint8Array.from(bytes.slice(0, 21))
  const sum = sha256(sha256(payload))
  for (let index = 0; index < 4; index += 1) if (sum[index] !== bytes[21 + index]) return undefined
  const version = bytes[0]
  if (version === 0x00) return { address: text, network: 'mainnet', kind: 'p2pkh' }
  if (version === 0x05) return { address: text, network: 'mainnet', kind: 'p2sh' }
  if (version === 0x6f) return { address: text, network: 'testnet', kind: 'p2pkh' }
  if (version === 0xc4) return { address: text, network: 'testnet', kind: 'p2sh' }
  return undefined
}

/** The address in what was typed, pasted or published, or undefined when it is not one. */
export function parseBitcoinAddress(text: string): BitcoinAddress | undefined {
  const raw = text.trim().replace(/^bitcoin:/iu, '').split('?')[0]?.trim() ?? ''
  if (raw === '' || /\s/u.test(raw)) return undefined
  return /^(bc|tb|bcrt)1/iu.test(raw) ? segwit(raw) : base58(raw)
}

/** The address when it is one this app may publish and pay: checked, and on the real network. */
export function mainnetBitcoinAddress(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  const parsed = parseBitcoinAddress(text)
  return parsed?.network === 'mainnet' ? parsed.address : undefined
}

/** A BIP-21 `bitcoin:` link for an address and an amount in sats. */
export function bitcoinUri(address: string, sats: number): string {
  const whole = Math.floor(Math.max(0, Math.round(sats)) / 100_000_000)
  const rest = String(Math.max(0, Math.round(sats)) % 100_000_000).padStart(8, '0').replace(/0+$/u, '')
  return `bitcoin:${address}?amount=${rest === '' ? String(whole) : `${whole}.${rest}`}`
}
