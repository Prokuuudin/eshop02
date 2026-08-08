const truncate = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.slice(0, maxLength) : ''

export const redactTelemetryText = (value: unknown, maxLength: number): string =>
  truncate(value, maxLength)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b(?:sk|rk|whsec)_(?:live|test)?_?[A-Za-z0-9]+\b/g, '[redacted-secret]')
    .replace(/([?&](?:token|key|secret|session_id|code)=)[^&\s]+/gi, '$1[redacted]')
