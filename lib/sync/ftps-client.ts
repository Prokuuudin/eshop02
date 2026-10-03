import { Client } from 'basic-ftp'
import { Writable } from 'stream'
import type { TLSSocket } from 'tls'

export interface FtpsConfig {
  host: string
  user: string
  password: string
  remotePath: string
  /** Control-channel port. Omitted → basic-ftp default 21 (explicit TLS). */
  port?: number
}

export interface FtpsTlsInfo {
  protocol: string | null
  cipher: string | null
  authorized: boolean
  certificateSubject?: string
  certificateIssuer?: string
  certificateValidTo?: string
}

export interface FtpsDownload {
  content: string
  modifiedAt?: string
  /** Remote file size reported by the server (SIZE), when supported. */
  remoteSizeBytes?: number
  tls?: FtpsTlsInfo
}

/**
 * Which FTPS credentials to read.
 * - primary:   GRINS_FTPS_* — the ONLY source the scheduled/production sync uses.
 * - candidate: GRINS_FTPS_CANDIDATE_* — a new source under verification during a
 *   migration. Read only by the read-only verification command; never falls back
 *   to (or mixes with) primary values.
 */
export type FtpsSource = 'primary' | 'candidate'

const ENV_PREFIX: Record<FtpsSource, string> = {
  primary: 'GRINS_FTPS',
  candidate: 'GRINS_FTPS_CANDIDATE',
}

function parsePort(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  const port = Number(raw.trim())
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`${name} must be an integer 1-65535`)
  return port
}

export function getFtpsConfigForSource(source: FtpsSource, env: NodeJS.ProcessEnv = process.env): FtpsConfig {
  const prefix = ENV_PREFIX[source]
  const host = env[`${prefix}_HOST`]
  const user = env[`${prefix}_USER`]
  const password = env[`${prefix}_PASSWORD`]
  const remotePath = env[`${prefix}_REMOTE_PATH`] || 'export.xml'
  const port = parsePort(env[`${prefix}_PORT`], `${prefix}_PORT`)

  if (!host || !user || !password) {
    throw new Error(`${prefix}_HOST, ${prefix}_USER and ${prefix}_PASSWORD must all be set`)
  }

  return { host, user, password, remotePath, ...(port !== undefined && { port }) }
}

/** Production source. Scheduled sync, dry-run and backfill read only GRINS_FTPS_*. */
export function getFtpsConfigFromEnv(): FtpsConfig {
  return getFtpsConfigForSource('primary')
}

const FTP_TIMEOUT_MS = 30_000

function readTlsInfo(client: Client): FtpsTlsInfo | undefined {
  const socket = client.ftp.socket as Partial<TLSSocket>
  if (typeof socket.getProtocol !== 'function') return undefined
  const cert = socket.getPeerCertificate?.()
  const name = (value: unknown) => (value && typeof value === 'object' ? Object.entries(value).map(([k, v]) => `${k}=${String(v)}`).join(', ') : undefined)
  return {
    protocol: socket.getProtocol() ?? null,
    cipher: socket.getCipher?.()?.name ?? null,
    authorized: socket.authorized === true,
    ...(cert && Object.keys(cert).length > 0 && {
      certificateSubject: name(cert.subject),
      certificateIssuer: name(cert.issuer),
      certificateValidTo: cert.valid_to,
    }),
  }
}

export async function downloadFtpsFileWithMetadata(config: FtpsConfig): Promise<FtpsDownload> {
  // basic-ftp has no timeout by default; a hung socket could otherwise stall a sync run
  // indefinitely (compounding with sync-runner's own retry loop — see xml-snapshot-store.ts).
  const client = new Client(FTP_TIMEOUT_MS)
  try {
    await client.access({
      host: config.host,
      user: config.user,
      password: config.password,
      ...(config.port !== undefined && { port: config.port }),
      secure: true, // explicit TLS — confirmed working transport, 2026-07-27
    })

    const chunks: Buffer[] = []
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      },
    })

    let modifiedAt: string | undefined
    try {
      modifiedAt = (await client.lastMod(config.remotePath)).toISOString()
    } catch {
      // Some FTPS servers do not support MDTM. Content download remains valid.
    }
    let remoteSizeBytes: number | undefined
    try {
      remoteSizeBytes = await client.size(config.remotePath)
    } catch {
      // SIZE is optional too.
    }
    let tls: FtpsTlsInfo | undefined
    try {
      tls = readTlsInfo(client)
    } catch {
      // Diagnostics only.
    }
    await client.downloadTo(sink, config.remotePath)
    return { content: Buffer.concat(chunks).toString('utf-8'), modifiedAt, remoteSizeBytes, tls }
  } finally {
    client.close()
  }
}

export async function downloadFtpsFile(config: FtpsConfig): Promise<string> {
  return (await downloadFtpsFileWithMetadata(config)).content
}
