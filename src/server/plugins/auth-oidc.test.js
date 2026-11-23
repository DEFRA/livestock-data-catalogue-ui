import { MockProvider, WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'

import { authOidc, createTokenProvider } from './auth-oidc.js'

const placeholderId = '00000000-0000-0000-0000-000000000000'

describe('#authOidc', () => {
  test('asks for the backend API scope first, so the access token is for the backend API', () => {
    expect(authOidc.options.oidc.scope).toBe(
      `api://${placeholderId}/access_as_user openid profile email offline_access user.read`
    )
  })

  test('finds Microsoft Entra ID for the configured tenant', () => {
    expect(authOidc.options.oidc.discoveryUri).toBe(
      `https://login.microsoftonline.com/${placeholderId}/v2.0/.well-known/openid-configuration`
    )
  })

  test('returns the user to the sign-in callback route', () => {
    expect(authOidc.options.oidc).toMatchObject({
      loginCallbackUri: '/auth/callback',
      externalBaseUrl: 'http://localhost:3000',
      responseMode: 'query'
    })
  })

  test('protects the sign-in state cookie', () => {
    expect(authOidc.options.cookieOptions).toMatchObject({
      isHttpOnly: true,
      isSecure: false,
      isSameSite: 'Lax'
    })
  })

  test('uses a short-lived AWS STS web identity token with the configured audience', () => {
    const provider = createTokenProvider(
      'web-identity',
      'api://AzureADTokenExchange'
    )

    expect(provider).toBeInstanceOf(WebIdentityTokenProvider)
    expect(provider.audience).toEqual(['api://AzureADTokenExchange'])
  })

  test('uses the mock token provider when asked', () => {
    expect(createTokenProvider('mock', 'api://AzureADTokenExchange')).toEqual(
      expect.any(MockProvider)
    )
  })
})
