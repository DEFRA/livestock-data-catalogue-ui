// Open-redirect prevention utility.
//
// When the cookie banner form submits, it includes a returnUrl so the
// server can redirect the user back to the page they were on. Sign-in uses
// it too, for the page the user asked for before signing in. An attacker
// could try to inject an external URL (e.g. https://evil.com or //evil.com)
// to redirect users off-site.
//
// This function ensures the URL:
// - Is a string
// - Starts with "/" (relative to the current origin)
// - Does NOT start with "//" (protocol-relative URL, which would navigate
//   to an external domain)
// - Stays on this site once a browser reads it. Browsers treat "\" like "/"
//   and drop tabs and line breaks, so "/\evil.com" or "/<tab>/evil.com" also
//   lead off-site. The URL must read the same after parsing, which rejects
//   those and anything else a browser would rewrite.

const placeholderOrigin = 'https://service.invalid'

export function isSafeRedirect(url) {
  if (!url || typeof url !== 'string') {
    return false
  }
  if (!url.startsWith('/') || url.startsWith('//')) {
    return false
  }

  const parsed = URL.parse(url, placeholderOrigin)
  return (
    parsed?.origin === placeholderOrigin &&
    `${parsed.pathname}${parsed.search}${parsed.hash}` === url
  )
}
