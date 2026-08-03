function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const [first, second] = parts
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

export function isLocalOpenAICompatibleBaseUrl(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl.trim())
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (!hostname) return false
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return true
    }
    if (hostname === '::1' || isPrivateIpv4(hostname)) return true
    return !hostname.includes('.') && !hostname.includes(':')
  } catch {
    return false
  }
}
