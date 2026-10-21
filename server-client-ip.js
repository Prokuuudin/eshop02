const { isIP } = require('node:net')

// IIS terminates the client connection and nothing sits in front of it, so every
// cf-connecting-ip / x-forwarded-for / x-real-ip header that reaches Node was written by
// the client and must not identify it. The one trusted source is the IIS REMOTE_ADDR
// server variable, which iisnode forwards as x-iisnode-remote_addr when web.config has
// <iisnode promoteServerVars="REMOTE_ADDR" />.
const CLIENT_SUPPLIED_IP_HEADERS = ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip']
const IISNODE_REMOTE_ADDR_HEADER = 'x-iisnode-remote_addr'

/**
 * Replaces client-controlled IP headers with a single x-forwarded-for derived from the
 * iisnode-promoted REMOTE_ADDR. A missing, repeated (comma-joined) or malformed value sets
 * nothing, so the app's readers fall back to 'unknown' instead of trusting the client.
 * Mutates and returns the Node request headers object.
 */
function applyTrustedClientIp(headers) {
    const promoted = headers[IISNODE_REMOTE_ADDR_HEADER]
    for (const name of CLIENT_SUPPLIED_IP_HEADERS) delete headers[name]

    const value = typeof promoted === 'string' ? promoted.trim() : ''
    if (value && !value.includes(',') && isIP(value) !== 0) {
        headers['x-forwarded-for'] = value
    }
    return headers
}

module.exports = { applyTrustedClientIp }
