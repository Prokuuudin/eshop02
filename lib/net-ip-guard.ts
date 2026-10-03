import net from 'node:net'

// Outbound-request IP policy shared by every server-side fetch of an admin/user supplied
// host (webhooks, competitor price monitor). An address is allowed only if it is a
// publicly routable unicast address; everything else — loopback, private, link-local,
// CGNAT, multicast, documentation/benchmark/reserved ranges, cloud metadata — is blocked.
// Unparseable input is blocked (fail closed).
//
// Addresses are parsed numerically (IPv6 fully expanded), never prefix-matched as strings,
// so non-canonical spellings (0:0:0:0:0:0:0:1, ::ffff:7f00:1, fe80::1%eth0) cannot slip through.

const IPV4_BLOCKED_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network", includes 0.0.0.0 (unspecified)
  ['10.0.0.0', 8], // RFC 1918
  ['100.64.0.0', 10], // CGNAT (also Alibaba metadata 100.100.100.200)
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, AWS/GCP/Azure IMDS 169.254.169.254
  ['172.16.0.0', 12], // RFC 1918
  ['192.0.0.0', 24], // IETF protocol assignments (incl. Oracle metadata 192.0.0.192)
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast (deprecated)
  ['192.168.0.0', 16], // RFC 1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + 255.255.255.255 broadcast
  ['168.63.129.16', 32], // Azure WireServer / platform metadata (public-looking, internal-only)
]

function ipv4ToNumber(ip: string): number | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (!match) return null
  const octets = match.slice(1).map(Number)
  if (octets.some((octet) => octet > 255)) return null
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
}

const IPV4_BLOCKED_NUMERIC = IPV4_BLOCKED_RANGES.map(([base, bits]) => {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return { network: (ipv4ToNumber(base)! & mask) >>> 0, mask }
})

function isBlockedIPv4Number(value: number): boolean {
  return IPV4_BLOCKED_NUMERIC.some(({ network, mask }) => ((value & mask) >>> 0) === network)
}

/** IPv6 text → 8 hextets, or null. Accepts '::' compression, embedded IPv4 tail and zone ids. */
export function parseIPv6(raw: string): number[] | null {
  const ip = raw.split('%')[0].toLowerCase()
  if (!net.isIPv6(ip)) return null
  let head = ip
  const tail: number[] = []
  const lastColon = head.lastIndexOf(':')
  const maybeV4 = head.slice(lastColon + 1)
  if (maybeV4.includes('.')) {
    const v4 = ipv4ToNumber(maybeV4)
    if (v4 === null) return null
    tail.push(v4 >>> 16, v4 & 0xffff)
    head = head.slice(0, lastColon + 1)
    if (head.endsWith(':') && !head.endsWith('::')) head = head.slice(0, -1)
  }
  const parseGroup = (group: string): number[] => (group === '' ? [] : group.split(':').map((h) => parseInt(h, 16)))
  const parts = head.split('::')
  if (parts.length > 2) return null
  const left = parseGroup(parts[0])
  const right = parts.length === 2 ? parseGroup(parts[1]) : []
  const explicit = left.length + right.length + tail.length
  const hextets = parts.length === 2
    ? [...left, ...new Array<number>(8 - explicit).fill(0), ...right, ...tail]
    : [...left, ...tail]
  if (hextets.length !== 8 || hextets.some((h) => !Number.isInteger(h) || h < 0 || h > 0xffff)) return null
  return hextets
}

function embeddedIPv4(high: number, low: number): number {
  return ((high << 16) | low) >>> 0
}

function isBlockedIPv6(hextets: number[]): boolean {
  const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets
  // ::/8 block: unspecified, loopback, IPv4-compatible, SIIT… except IPv4-mapped (::ffff:a.b.c.d),
  // which is judged by the IPv4 it maps to.
  if (h0 === 0) {
    if (h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff) return isBlockedIPv4Number(embeddedIPv4(h6, h7))
    return true
  }
  // NAT64 well-known prefix 64:ff9b::/96 → judged by embedded IPv4; local-use 64:ff9b:1::/48 blocked.
  if (h0 === 0x64 && h1 === 0xff9b) {
    if (h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) return isBlockedIPv4Number(embeddedIPv4(h6, h7))
    return true
  }
  // Only global unicast 2000::/3 is publicly routable. This also blocks ULA fc00::/7,
  // link-local fe80::/10, site-local fec0::/10, multicast ff00::/8 and discard 100::/64.
  if ((h0 & 0xe000) !== 0x2000) return true
  if (h0 === 0x2001 && h1 < 0x0200) return true // 2001::/23 IETF protocol assignments (Teredo, ORCHID…)
  if (h0 === 0x2001 && h1 === 0x0db8) return true // documentation
  if (h0 === 0x3fff && h1 < 0x1000) return true // 3fff::/20 documentation
  if (h0 === 0x2002) return isBlockedIPv4Number(embeddedIPv4(h1, h2)) // 6to4 embeds an IPv4
  return false
}

/** True when an outbound connection to `ip` must not be made. Fails closed on anything unparseable. */
export function isBlockedIp(ip: string): boolean {
  if (typeof ip !== 'string') return true
  if (net.isIPv4(ip)) {
    const value = ipv4ToNumber(ip)
    return value === null || isBlockedIPv4Number(value)
  }
  const hextets = parseIPv6(ip)
  return hextets === null || isBlockedIPv6(hextets)
}

export type ResolvedAddress = { address: string; family: number }

/**
 * Conservative multi-answer policy: a hostname is usable only if it resolves to at least
 * one address and *every* answer is public. A single private/internal answer rejects the
 * host — picking "the public one" would let an attacker-controlled DNS race us into the
 * private one on the next resolution.
 */
export function findBlockedAddress(addresses: readonly ResolvedAddress[]): ResolvedAddress | null {
  return addresses.find(({ address }) => isBlockedIp(address)) ?? null
}
