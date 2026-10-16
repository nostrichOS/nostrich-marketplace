import { describe, expect, it } from 'vitest'

import { bitcoinUri, mainnetBitcoinAddress, parseBitcoinAddress } from './bitcoin-address'

describe('a Bitcoin address', () => {
  it('reads every mainnet form, lower-casing bech32 and leaving base58 as written', () => {
    expect(parseBitcoinAddress('BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4')).toEqual({ address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', network: 'mainnet', kind: 'p2wpkh' })
    expect(parseBitcoinAddress('bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3')?.kind).toBe('p2wsh')
    expect(parseBitcoinAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0')).toEqual({
      address: 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
      network: 'mainnet',
      kind: 'p2tr',
    })
    expect(parseBitcoinAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toEqual({ address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', network: 'mainnet', kind: 'p2pkh' })
    expect(parseBitcoinAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toEqual({ address: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', network: 'mainnet', kind: 'p2sh' })
    expect(parseBitcoinAddress('bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y')?.kind).toBe('segwit')
  })

  it('reads the two addresses sellers on other apps already publish on their listings', () => {
    expect(mainnetBitcoinAddress('bc1q2tdwam8g9yd82h93pzq6v36tdmkf407wwpmtm3')).toBe('bc1q2tdwam8g9yd82h93pzq6v36tdmkf407wwpmtm3')
    expect(mainnetBitcoinAddress('bc1q3hwpgnnjjpf88p670zrfqtmf8jtyf9s2qt0wul')).toBe('bc1q3hwpgnnjjpf88p670zrfqtmf8jtyf9s2qt0wul')
  })

  it('catches one changed letter in every form', () => {
    expect(parseBitcoinAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5')).toBeUndefined()
    expect(parseBitcoinAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj9')).toBeUndefined()
    expect(parseBitcoinAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3')).toBeUndefined()
    expect(parseBitcoinAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLz')).toBeUndefined()
    expect(parseBitcoinAddress('1bvbmseystwetqtfn5au4m4gfg7xjanvn2')).toBeUndefined()
  })

  it('refuses the wrong checksum for the version (BIP-350), mixed case, and anything that is not an address', () => {
    expect(parseBitcoinAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh')).toBeUndefined()
    expect(parseBitcoinAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd')).toBeUndefined()
    expect(parseBitcoinAddress('bc1QW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBeUndefined()
    expect(parseBitcoinAddress('')).toBeUndefined()
    expect(parseBitcoinAddress('alice@example.com')).toBeUndefined()
    expect(parseBitcoinAddress('lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq')).toBeUndefined()
    expect(parseBitcoinAddress('bc1q w508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBeUndefined()
  })

  it('names a test-network address, and never passes it as one to publish or pay', () => {
    expect(parseBitcoinAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')?.network).toBe('testnet')
    expect(parseBitcoinAddress('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn')?.network).toBe('testnet')
    expect(mainnetBitcoinAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')).toBeUndefined()
    expect(mainnetBitcoinAddress('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn')).toBeUndefined()
    expect(mainnetBitcoinAddress(undefined)).toBeUndefined()
  })

  it('reads the address out of a pasted bitcoin: link', () => {
    expect(mainnetBitcoinAddress('bitcoin:BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4?amount=0.0005&label=shop')).toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')
    expect(mainnetBitcoinAddress('  1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2  ')).toBe('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')
  })

  it('writes a payment link a wallet reads: the amount in bitcoin, no exponent, no trailing zeros', () => {
    expect(bitcoinUri('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 50_000)).toBe('bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4?amount=0.0005')
    expect(bitcoinUri('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 1_000)).toBe('bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4?amount=0.00001')
    expect(bitcoinUri('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 100_000_000)).toBe('bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4?amount=1')
    expect(bitcoinUri('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 123_456_789)).toBe('bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4?amount=1.23456789')
  })
})
