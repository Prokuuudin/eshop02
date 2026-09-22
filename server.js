const { createServer, request } = require('node:http')
const next = require('next')

const IMAGE_WARMUP_PATH = '/_next/image?url=%2Fhero.jpg&w=3840&q=90'
const IMAGE_WARMUP_TIMEOUT_MS = 60_000

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOST || '0.0.0.0'

// iisnode assigns a Windows named pipe (e.g. "\\.\pipe\...") via PORT instead of
// a TCP port number, so it can reverse-proxy the app without binding a real port.
// A raw parseInt would turn that into NaN and crash the app on every iisnode start.
const rawPort = process.env.PORT || '3000'
const isNamedPipe = Number.isNaN(Number(rawPort))
const port = isNamedPipe ? rawPort : Number.parseInt(rawPort, 10)

if (!isNamedPipe && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error(`Invalid PORT value: ${rawPort}`)
}

const app = next(isNamedPipe ? { dev } : { dev, hostname, port })
const handle = app.getRequestHandler()

function warmImageOptimizer(server) {
    const startedAt = performance.now()
    const address = server.address()

    if (address === null) {
        console.warn('Image optimizer warm-up skipped: server address is unavailable')
        return
    }

    const requestOptions = typeof address === 'string'
        ? { socketPath: address }
        : {
            hostname: address.family === 'IPv6' ? '::1' : '127.0.0.1',
            port: address.port,
        }

    const warmupRequest = request({
        ...requestOptions,
        path: IMAGE_WARMUP_PATH,
        method: 'GET',
        headers: {
            Accept: 'image/webp',
        },
    }, (response) => {
        response.resume()
        response.on('end', () => {
            const durationMs = Math.round(performance.now() - startedAt)
            const cacheStatus = response.headers['x-nextjs-cache'] || 'unknown'
            const message = `Image optimizer warm-up: status=${response.statusCode} cache=${cacheStatus} duration=${durationMs}ms`

            if (response.statusCode === 200) {
                console.log(message)
            } else {
                console.warn(message)
            }
        })
    })

    warmupRequest.setTimeout(IMAGE_WARMUP_TIMEOUT_MS, () => {
        warmupRequest.destroy(new Error(`timed out after ${IMAGE_WARMUP_TIMEOUT_MS}ms`))
    })
    warmupRequest.on('error', (error) => {
        const durationMs = Math.round(performance.now() - startedAt)
        console.warn(`Image optimizer warm-up failed after ${durationMs}ms: ${error.message}`)
    })
    warmupRequest.end()
}

app.prepare()
    .then(() => {
        const server = createServer((request, response) => {
            handle(request, response).catch((error) => {
                console.error('Failed to handle request', error)

                if (!response.headersSent) {
                    response.statusCode = 500
                    response.end('Internal Server Error')
                }
            })
        })

        server.on('error', (error) => {
            console.error('Server failed to listen', error)
            process.exit(1)
        })

        // On Windows, Node/libuv only emulate a catchable signal for SIGINT/SIGBREAK/SIGHUP —
        // SIGTERM there unconditionally terminates the process before this handler can run
        // (verified: process.kill(pid, 'SIGTERM') from another Node process kills it immediately,
        // no log line). Kept for when this same server.js runs on a POSIX host, where it works.
        const shutdown = (signal) => {
            console.log(`Received ${signal}, closing server`)
            server.close(() => process.exit(0))
        }
        process.on('SIGTERM', () => shutdown('SIGTERM'))
        process.on('SIGINT', () => shutdown('SIGINT'))

        const listenArgs = isNamedPipe ? [port] : [port, hostname]
        server.listen(...listenArgs, () => {
            console.log(`Next.js is listening on ${isNamedPipe ? port : `http://${hostname}:${port}`}`)

            if (!dev) {
                // Do not await: the listener is already ready and warm-up failures are non-fatal.
                warmImageOptimizer(server)
            }
        })
    })
    .catch((error) => {
        console.error('Failed to start Next.js', error)
        process.exit(1)
    })
