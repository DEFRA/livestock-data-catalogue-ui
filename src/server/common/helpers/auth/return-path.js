import { isSafeRedirect } from '#/server/common/helpers/is-safe-redirect.js'

const defaultReturnPath = '/'
const authPathPrefix = '/auth/'
const placeholderOrigin = 'https://service.invalid'

// hapi decodes characters such as %61 ("a") before matching routes, so check
// the decoded path. Malformed encoding gives null, which is never safe.
function decodedPathname(returnPath) {
  try {
    return decodeURIComponent(URL.parse(returnPath, placeholderOrigin).pathname)
  } catch {
    return null
  }
}

/**
 * Where to send a user after they sign in. Only paths on this service are
 * allowed, and never the sign-in routes themselves: the callback can only be
 * used once, and returning to sign-out would sign the user straight out.
 * @param {unknown} returnPath - the path asked for, from the query or session
 * @returns {string} a safe path on this service
 */
export function safeReturnPath(returnPath) {
  if (!isSafeRedirect(returnPath)) {
    return defaultReturnPath
  }

  const pathname = decodedPathname(returnPath)
  if (pathname === null || pathname.startsWith(authPathPrefix)) {
    return defaultReturnPath
  }
  return returnPath
}
