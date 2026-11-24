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
 * Whether a path is the asset folder or inside it. Compares the decoded path
 * without regard to case, and ignores a trailing slash on the asset path, so
 * /%70ublic/x and /Public/x count. Malformed encoding counts as an asset path,
 * so it fails closed.
 * @param {string} returnPath
 * @param {string} assetPath - the configured ASSET_PATH
 */
export function isAssetPath(returnPath, assetPath) {
  const pathname = decodedPathname(returnPath)
  if (pathname === null) {
    return true
  }

  const folder = assetPath.replace(/\/+$/, '').toLowerCase()
  const path = pathname.toLowerCase()
  return path === folder || path.startsWith(`${folder}/`)
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
