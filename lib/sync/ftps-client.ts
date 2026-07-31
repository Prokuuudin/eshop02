import { Client } from 'basic-ftp'
import { Writable } from 'stream'

export interface FtpsConfig {
  host: string
  user: string
  password: string
  remotePath: string
}

export function getFtpsConfigFromEnv(): FtpsConfig {
  const host = process.env.GRINS_FTPS_HOST
  const user = process.env.GRINS_FTPS_USER
  const password = process.env.GRINS_FTPS_PASSWORD
  const remotePath = process.env.GRINS_FTPS_REMOTE_PATH ?? 'export.xml'

  if (!host || !user || !password) {
    throw new Error(
      'GRINS_FTPS_HOST, GRINS_FTPS_USER and GRINS_FTPS_PASSWORD must all be set',
    )
  }

  return { host, user, password, remotePath }
}

const FTP_TIMEOUT_MS = 30_000

export async function downloadFtpsFile(config: FtpsConfig): Promise<string> {
  // basic-ftp has no timeout by default; a hung socket could otherwise stall a sync run
  // indefinitely (compounding with sync-runner's own retry loop — see xml-snapshot-store.ts).
  const client = new Client(FTP_TIMEOUT_MS)
  try {
    await client.access({
      host: config.host,
      user: config.user,
      password: config.password,
      secure: true, // explicit TLS — confirmed working transport, 2026-07-27
    })

    const chunks: Buffer[] = []
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      },
    })

    await client.downloadTo(sink, config.remotePath)
    return Buffer.concat(chunks).toString('utf-8')
  } finally {
    client.close()
  }
}
