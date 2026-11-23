/**
 * @typedef {object} UserSession
 * @property {string} id - the user's Entra ID object ID (oid)
 * @property {string} displayName
 * @property {string} email
 * @property {string[]} roles - app roles from the App Registration
 * @property {string} [loginHint] - used to skip the account picker on sign out
 * @property {string} accessToken - for the backend API; never sent to the browser
 * @property {string} refreshToken
 * @property {string|null} expiresAt - when the access token expires (ISO 8601)
 */

function userFromClaims(claims) {
  return {
    id: claims.oid,
    displayName: claims.name,
    email: claims.preferred_username,
    roles: Array.isArray(claims.roles) ? claims.roles : [],
    loginHint: claims.login_hint
  }
}

function expiresAtFrom(expiresInSeconds) {
  if (!Number.isFinite(expiresInSeconds)) {
    return null
  }
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString()
}

/**
 * Builds the server-side session from a completed Entra ID sign-in.
 * @returns {UserSession}
 */
export function createUserSession({
  accessToken,
  refreshToken,
  expiresIn,
  claims
}) {
  return {
    ...userFromClaims(claims),
    accessToken,
    refreshToken,
    expiresAt: expiresAtFrom(expiresIn)
  }
}

/**
 * Updates a session with refreshed tokens. Claims come back only when Entra
 * ID returns a new ID token, so the user's details and roles are updated only then.
 * @returns {UserSession}
 */
function refreshUserSession(userSession, token) {
  return {
    ...userSession,
    ...(token.claims ? userFromClaims(token.claims) : {}),
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? userSession.refreshToken,
    expiresAt: expiresAtFrom(token.expiresIn)
  }
}

async function readUserSession(request, sessionId) {
  try {
    return await request.server.userSessionCache.get(sessionId)
  } catch (error) {
    request.logger.error(
      `Could not read the session store, so the user is treated as signed out: ${error.message}`
    )
    return null
  }
}

/**
 * Checks the session behind a session cookie, refreshing the access token
 * when it is close to expiry. Fails closed: if the session is missing or the
 * refresh fails, the session is dropped and the user is treated as signed out.
 * @param {import('@hapi/hapi').Request} request
 * @param {{ sessionId?: string }} cookieSession
 */
export async function validateUserSession(request, cookieSession) {
  const sessionId = cookieSession?.sessionId
  if (!sessionId) {
    return { isValid: false }
  }

  const userSession = await readUserSession(request, sessionId)
  if (!userSession) {
    return { isValid: false }
  }

  const userSessionCache = request.server.userSessionCache
  try {
    const { token, refreshed } = await request.ensureValidToken(userSession)
    if (!refreshed) {
      return { isValid: true, credentials: userSession }
    }

    const refreshedSession = refreshUserSession(userSession, token)
    await userSessionCache.set(sessionId, refreshedSession)
    return { isValid: true, credentials: refreshedSession }
  } catch (error) {
    request.logger.warn(
      `Access token refresh failed, so the user has been signed out: ${error.message}`
    )
    await userSessionCache.drop(sessionId)
    return { isValid: false }
  }
}
