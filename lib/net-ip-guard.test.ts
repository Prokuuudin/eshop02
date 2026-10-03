import { describe, expect, it } from 'vitest'
import { findBlockedAddress, isBlockedIp, parseIPv6 } from './net-ip-guard'

describe('isBlockedIp — public addresses are allowed', () => {
  it.each([
    '93.184.216.34',
    '8.8.8.8',
    '1.1.1.1',
    '172.15.255.255', // just below 172.16/12
    '172.32.0.0', // just above 172.16/12
    '100.63.255.255', // just below CGNAT
    '2606:4700:4700::1111',
    '2a00:1450:4001:82a::200e',
    '::ffff:93.184.216.34', // IPv4-mapped public
    '64:ff9b::808:808', // NAT64 of 8.8.8.8
    '2002:5db8:d822::1', // 6to4 of 93.184.216.34
  ])('%s', (ip) => expect(isBlockedIp(ip)).toBe(false))
})

describe('isBlockedIp — IPv4 special ranges are blocked', () => {
  it.each([
    ['unspecified', '0.0.0.0'],
    ['this network', '0.1.2.3'],
    ['loopback', '127.0.0.1'],
    ['loopback range', '127.255.255.254'],
    ['RFC1918 10/8', '10.0.0.1'],
    ['RFC1918 172.16/12', '172.16.0.1'],
    ['RFC1918 172.31', '172.31.255.255'],
    ['RFC1918 192.168/16', '192.168.1.1'],
    ['link-local', '169.254.10.20'],
    ['AWS/GCP/Azure metadata', '169.254.169.254'],
    ['Azure wireserver', '168.63.129.16'],
    ['Alibaba metadata / CGNAT', '100.100.100.200'],
    ['Oracle metadata', '192.0.0.192'],
    ['TEST-NET-1', '192.0.2.1'],
    ['TEST-NET-2', '198.51.100.1'],
    ['TEST-NET-3', '203.0.113.1'],
    ['benchmark', '198.18.0.1'],
    ['multicast', '224.0.0.1'],
    ['reserved', '240.0.0.1'],
    ['broadcast', '255.255.255.255'],
  ])('%s %s', (_label, ip) => expect(isBlockedIp(ip)).toBe(true))
})

describe('isBlockedIp — IPv6 special ranges are blocked', () => {
  it.each([
    ['unspecified', '::'],
    ['loopback', '::1'],
    ['loopback uncompressed', '0:0:0:0:0:0:0:1'],
    ['link-local', 'fe80::1'],
    ['link-local with zone', 'fe80::1%eth0'],
    ['link-local upper bound', 'febf::1'],
    ['site-local (deprecated)', 'fec0::1'],
    ['ULA fc00', 'fc00::1'],
    ['ULA fd00 (AWS IMDS v6)', 'fd00:ec2::254'],
    ['multicast', 'ff02::1'],
    ['IPv4-mapped loopback', '::ffff:127.0.0.1'],
    ['IPv4-mapped loopback hex form', '::ffff:7f00:1'],
    ['IPv4-mapped private', '::ffff:10.1.2.3'],
    ['IPv4-mapped metadata', '::ffff:169.254.169.254'],
    ['IPv4-compatible (deprecated)', '::127.0.0.1'],
    ['NAT64 of private IPv4', '64:ff9b::a00:1'],
    ['NAT64 local-use', '64:ff9b:1::1'],
    ['discard', '100::1'],
    ['Teredo', '2001:0:4136:e378::1'],
    ['documentation', '2001:db8::1'],
    ['documentation 3fff::/20', '3fff::1'],
    ['6to4 of private IPv4', '2002:a00:1::1'],
    ['6to4 of loopback', '2002:7f00:1::1'],
    ['unallocated outside 2000::/3', '4000::1'],
  ])('%s %s', (_label, ip) => expect(isBlockedIp(ip)).toBe(true))
})

describe('isBlockedIp — fails closed on non-addresses', () => {
  it.each(['', 'localhost', 'example.com', '256.1.1.1', '1.2.3', '::ffff:999.1.1.1', 'fe80::1::2', '0x7f000001', '2130706433'])(
    '%s',
    (ip) => expect(isBlockedIp(ip)).toBe(true),
  )
})

describe('compatibility with the previous webhook-sender guard', () => {
  // Every address the old inline implementation blocked must still be blocked.
  it.each([
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.0.0.1', '192.0.2.1',
    '192.88.99.1', '192.168.0.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1',
    '::1', '::', 'fe80::1', 'fe9f::1', 'fea0::1', 'feb0::1', 'fc00::1', 'fd12::1', 'ff00::1', '::ffff:192.168.1.1',
  ])('still blocks %s', (ip) => expect(isBlockedIp(ip)).toBe(true))

  it('still allows ordinary public IPv4/IPv6 and mapped public IPv4', () => {
    expect(isBlockedIp('93.184.216.34')).toBe(false)
    expect(isBlockedIp('2606:4700::6810:84e5')).toBe(false)
    expect(isBlockedIp('::ffff:93.184.216.34')).toBe(false)
  })
})

describe('parseIPv6', () => {
  it('expands compressed forms and embedded IPv4', () => {
    expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
    expect(parseIPv6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304])
    expect(parseIPv6('1:2:3:4:5:6:7.8.9.10')).toEqual([1, 2, 3, 4, 5, 6, 0x0708, 0x090a])
    expect(parseIPv6('FE80::1%25eth0')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1])
  })

  it('rejects invalid input', () => {
    expect(parseIPv6('1.2.3.4')).toBeNull()
    expect(parseIPv6('gggg::1')).toBeNull()
  })
})

describe('findBlockedAddress — conservative multi-answer policy', () => {
  it('accepts only when every answer is public', () => {
    expect(findBlockedAddress([{ address: '93.184.216.34', family: 4 }, { address: '2606:4700::1', family: 6 }])).toBeNull()
  })

  it('rejects a host whose answers mix public and private', () => {
    expect(findBlockedAddress([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }]))
      .toEqual({ address: '10.0.0.5', family: 4 })
    expect(findBlockedAddress([{ address: '2606:4700::1', family: 6 }, { address: '::ffff:127.0.0.1', family: 6 }]))
      .not.toBeNull()
  })
})
