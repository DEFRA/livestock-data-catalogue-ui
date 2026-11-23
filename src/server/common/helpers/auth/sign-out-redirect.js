import { authPaths } from '#/server/common/constants/auth-paths.js'

const discoveryTimeoutMs = 5000

async function fetchEndSessionEndpoint(discoveryUri) {
  const response = await fetch(discoveryUri, {
    signal: AbortSignal.timeout(discoveryTimeoutMs)
  })
  if (!response.ok) {
    throw new Error(`discovery request failed with status ${response.status}`)
  }

  const { end_session_endpoint: endSessionEndpoint } = await response.json()
  const endSessionUrl = URL.parse(endSessionEndpoint)

  // Only ever send users to Entra ID's own sign-out page
  if (endSessionUrl?.origin !== new URL(discoveryUri).origin) {
    throw new Error('discovery returned no sign-out address on the same site')
  }
  return endSessionUrl
}

/**
 * Where to send a user once they are signed out of this service: Entra ID's
 * sign-out page, which then returns them to the signed-out page. If Entra ID
 * can't be reached, straight to the signed-out page instead.
 * @param {object} options
 * @param {string} options.discoveryUri - Entra ID's OpenID configuration address
 * @param {string} options.externalBaseUrl - this service's public address
 * @param {string} [options.loginHint] - the user's login_hint claim, if any
 * @param {object} options.logger
 * @returns {Promise<string>}
 */
export async function signOutRedirectUrl({
  discoveryUri,
  externalBaseUrl,
  loginHint,
  logger
}) {
  try {
    const endSessionUrl = await fetchEndSessionEndpoint(discoveryUri)
    endSessionUrl.searchParams.set(
      'post_logout_redirect_uri',
      new URL(authPaths.signedOut, externalBaseUrl).href
    )
    if (loginHint) {
      endSessionUrl.searchParams.set('logout_hint', loginHint)
    }
    return endSessionUrl.href
  } catch (error) {
    logger.warn(
      `Could not reach Entra ID to sign the user out there, so they were signed out of this service only: ${error.message}`
    )
    return authPaths.signedOut
  }
}
