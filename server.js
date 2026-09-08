const { createServer } = require('node:http')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOST || '0.0.0.0'
const port = Number.parseInt(process.env.PORT || '3000', 10)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`)
}

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

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

        server.listen(port, hostname, () => {
            console.log(`Next.js is listening on http://${hostname}:${port}`)
        })
    })
    .catch((error) => {
        console.error('Failed to start Next.js', error)
        process.exit(1)
    })
