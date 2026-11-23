const entraLoginOrigin = 'https://login.microsoftonline.com'

export function entraDiscoveryUri(tenantId) {
  return `${entraLoginOrigin}/${encodeURIComponent(tenantId)}/v2.0/.well-known/openid-configuration`
}

/**
 * The backend API scope comes first because Entra ID issues the access token
 * for the first resource requested, and the backend validates that token.
 * The other scopes give the user's identity and a refresh token.
 */
export function entraScope(clientId, apiScope) {
  return [
    `api://${clientId}/${apiScope}`,
    'openid',
    'profile',
    'email',
    'offline_access',
    'user.read'
  ].join(' ')
}
