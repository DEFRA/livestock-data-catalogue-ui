import {
  hapiAuthOidcPlugin,
  MockProvider,
  WebIdentityTokenProvider
} from '@defra/hapi-auth-oidc'

import { config } from '#/config/config.js'
import { authPaths } from '#/server/common/constants/auth-paths.js'
import {
  entraDiscoveryUri,
  entraScope
} from '#/server/common/helpers/auth/entra.js'

const authConfig = config.get('auth')

/**
 * The service has no client secret. It proves who it is to Entra ID with a
 * short-lived token from AWS STS (a federated credential). The mock provider
 * is for local development only; production config refuses it.
 */
export function createTokenProvider(providerType, audience) {
  if (providerType === 'mock') {
    return new MockProvider({})
  }
  return new WebIdentityTokenProvider({ audience: [audience] })
}

/**
 * Signs staff in with Microsoft Entra ID, using the authorisation code flow
 * with PKCE. Adds request.login, request.callback and request.ensureValidToken.
 * @satisfies {import('@hapi/hapi').ServerRegisterPluginObject<*>}
 */
export const authOidc = {
  plugin: hapiAuthOidcPlugin,
  options: {
    oidc: {
      clientId: authConfig.clientId,
      discoveryUri: entraDiscoveryUri(authConfig.tenantId),
      externalBaseUrl: authConfig.externalBaseUrl,
      loginCallbackUri: authPaths.callback,
      responseMode: authConfig.responseMode,
      scope: entraScope(authConfig.clientId, authConfig.apiScope),
      authProvider: createTokenProvider(
        authConfig.tokenProvider,
        authConfig.federatedCredentialAudience
      )
    },
    cookieOptions: {
      password: config.get('session.cookie.password'),
      isHttpOnly: true,
      isSecure: authConfig.stateCookie.isSecure,
      isSameSite: authConfig.stateCookie.isSameSite
    }
  }
}
