import { vi } from 'vitest'
import Boom from '@hapi/boom'
import * as cheerio from 'cheerio'

import { createServer } from '#/server/server.js'
import { config } from '#/config/config.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

const sessionCookieName = config.get('auth.sessionCookieName')
const fakeTenantId = config.get('auth.tenantId')
const discoveryUri = `https://login.microsoftonline.com/${fakeTenantId}/v2.0/.well-known/openid-configuration`
const endSessionEndpoint = `https://login.microsoftonline.com/${fakeTenantId}/oauth2/v2.0/logout`
const fakeAuthorizeUrl = 'https://login.microsoftonline.com/fake/authorize'
const fakeUserId = '11111111-1111-1111-1111-111111111111'
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function fakeCredentials(claims = {}) {
  return {
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token',
    idToken: 'fake-id-token',
    expiresIn: 3600,
    claims: {
      oid: fakeUserId,
      name: 'Test User',
      preferred_username: 'test.user@example.com',
      roles: ['DataSteward'],
      login_hint: 'fake-login-hint',
      ...claims
    }
  }
}

function parseSetCookies(response) {
  return [response.headers['set-cookie'] ?? []].flat().map((header) => {
    const [pair] = header.split(';')
    const separator = pair.indexOf('=')
    return {
      name: pair.slice(0, separator),
      value: pair.slice(separator + 1),
      header
    }
  })
}

function storeCookies(response, jar) {
  for (const { name, value } of parseSetCookies(response)) {
    if (value === '') {
      delete jar[name]
    } else {
      jar[name] = value
    }
  }
  return jar
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

function setCookieNames(response) {
  return parseSetCookies(response)
    .filter(({ value }) => value !== '')
    .map(({ name }) => name)
}

function clearedCookieNames(response) {
  return parseSetCookies(response)
    .filter(({ value }) => value === '')
    .map(({ name }) => name)
}

function postCallback(server, payload = 'code=fake-code&state=fake-state') {
  // Microsoft posts the sign-in response from its own site, so the browser
  // sends none of this service's SameSite=Lax cookies with it.
  return server.inject({
    method: 'POST',
    url: '/auth/callback',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload
  })
}

async function signIn(server, returnPath = '/about') {
  const jar = {}
  const signInResponse = await server.inject({
    method: 'GET',
    url: `/auth/sign-in?next=${encodeURIComponent(returnPath)}`
  })
  storeCookies(signInResponse, jar)

  const callbackResponse = await postCallback(server)
  storeCookies(callbackResponse, jar)

  const jarBeforeSignedIn = { ...jar }
  const signedInResponse = await server.inject({
    method: 'GET',
    url: callbackResponse.headers.location,
    headers: { cookie: cookieHeader(jar) }
  })
  storeCookies(signedInResponse, jar)

  return { jar, jarBeforeSignedIn, callbackResponse, signedInResponse }
}

describe('Signing in with Microsoft Entra ID', () => {
  let server
  let oidc

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
    oidc = server.plugins['hapi-auth-oidc'].oidc
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.spyOn(oidc, 'login').mockImplementation((_request, h) =>
      h.redirect(fakeAuthorizeUrl).takeover()
    )
    vi.spyOn(oidc, 'callback').mockResolvedValue(fakeCredentials())
    vi.spyOn(oidc, 'ensureValidToken').mockImplementation(
      (_request, token) => ({ token, refreshed: false })
    )
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        Response.json({ end_session_endpoint: endSessionEndpoint })
      )
    )
  })

  describe('Visitors who are not signed in', () => {
    test('are sent to sign in, keeping the page and query they asked for', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/about?view=all'
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe(
        '/auth/sign-in?next=%2Fabout%3Fview%3Dall'
      )
    })

    test('are sent to sign in from the home page', async () => {
      const response = await server.inject({ method: 'GET', url: '/' })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe('/auth/sign-in?next=%2F')
    })

    test('are sent to sign in when their session cookie is not valid', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/about',
        headers: { cookie: `${sessionCookieName}=not-a-real-session` }
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe('/auth/sign-in?next=%2Fabout')
    })

    test.each([
      ['the health check', '/health', statusCodes.ok],
      ['the cookies page', '/cookies', statusCodes.ok],
      ['the signed out page', '/auth/signed-out', statusCodes.ok],
      ['the favicon', '/favicon.ico', statusCodes.noContent],
      ['static assets', '/public/assets/not-built.css', statusCodes.notFound],
      ['a page that does not exist', '/no-such-page', statusCodes.notFound]
    ])('can reach %s without signing in', async (_name, url, statusCode) => {
      const response = await server.inject({ method: 'GET', url })

      expect(response.statusCode).toBe(statusCode)
    })

    test('can save cookie settings without signing in', async () => {
      const getResponse = await server.inject({
        method: 'GET',
        url: '/cookies'
      })
      const crumb = cheerio
        .load(getResponse.payload)('input[name="crumb"]')
        .val()

      const response = await server.inject({
        method: 'POST',
        url: '/cookies',
        headers: { cookie: cookieHeader(storeCookies(getResponse, {})) },
        payload: { analytics: false, async: false, crumb }
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe('/cookies?updated=true')
    })

    test('do not see a Sign out link', async () => {
      const response = await server.inject({ method: 'GET', url: '/cookies' })

      expect(
        cheerio.load(response.payload)('.govuk-service-navigation').text()
      ).not.toContain('Sign out')
    })
  })

  describe('Starting sign in', () => {
    test('sends the user to Microsoft to sign in', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/sign-in?next=%2Fabout'
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe(fakeAuthorizeUrl)
      expect(oidc.login).toHaveBeenCalledTimes(1)
    })

    test('rejects a return path that is too long', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/auth/sign-in?next=/${'a'.repeat(2001)}`
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
      expect(oidc.login).not.toHaveBeenCalled()
    })

    test('sends a user who is already signed in straight to the page they asked for', async () => {
      const { jar } = await signIn(server)
      oidc.login.mockClear()

      const response = await server.inject({
        method: 'GET',
        url: '/auth/sign-in?next=%2Fabout',
        headers: { cookie: cookieHeader(jar) }
      })
      const pageResponse = await server.inject({
        method: 'GET',
        url: '/about',
        headers: { cookie: cookieHeader(jar) }
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe('/about')
      expect(oidc.login).not.toHaveBeenCalled()
      expect(pageResponse.statusCode).toBe(statusCodes.ok)
    })

    test('clears a session that no longer works before signing in again', async () => {
      const saveSession = vi.spyOn(server.userSessionCache, 'set')
      const { jar } = await signIn(server)
      const [sessionId] = saveSession.mock.calls[0]
      await server.userSessionCache.drop(sessionId)

      const response = await server.inject({
        method: 'GET',
        url: '/auth/sign-in',
        headers: { cookie: cookieHeader(jar) }
      })

      expect(response.headers.location).toBe(fakeAuthorizeUrl)
      expect(clearedCookieNames(response)).toContain(sessionCookieName)
    })

    test('still starts sign in when the session store cannot be reached', async () => {
      const { jar } = await signIn(server)
      vi.spyOn(server.userSessionCache, 'get').mockRejectedValueOnce(
        new Error('connection lost')
      )

      const response = await server.inject({
        method: 'GET',
        url: '/auth/sign-in',
        headers: { cookie: cookieHeader(jar) }
      })

      expect(response.headers.location).toBe(fakeAuthorizeUrl)
      expect(clearedCookieNames(response)).toContain(sessionCookieName)
    })
  })

  describe('Completing sign in', () => {
    test('returns the user to the page they asked for', async () => {
      const { callbackResponse, signedInResponse } = await signIn(
        server,
        '/about?view=all'
      )

      expect(callbackResponse.statusCode).toBe(303)
      expect(callbackResponse.headers.location).toBe('/auth/signed-in')
      expect(signedInResponse.statusCode).toBe(302)
      expect(signedInResponse.headers.location).toBe('/about?view=all')
    })

    test.each([
      '//evil.example',
      'https://evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/auth/sign-out',
      '/%61uth/sign-out',
      '/%E0%A4%A',
      '/auth/callback'
    ])(
      'returns the user to the home page instead of the unsafe return path %j',
      async (returnPath) => {
        const { signedInResponse } = await signIn(server, returnPath)

        expect(signedInResponse.statusCode).toBe(302)
        expect(signedInResponse.headers.location).toBe('/')
      }
    )

    test('returns the user to the home page when no return path was given', async () => {
      const jar = storeCookies(
        await server.inject({ method: 'GET', url: '/auth/sign-in' }),
        {}
      )
      storeCookies(await postCallback(server), jar)

      const response = await server.inject({
        method: 'GET',
        url: '/auth/signed-in',
        headers: { cookie: cookieHeader(jar) }
      })

      expect(response.headers.location).toBe('/')
    })

    test('accepts the response Microsoft posts back without a CSRF token and sets an HttpOnly, SameSite=Lax session cookie', async () => {
      const response = await postCallback(server)
      const sessionCookie = parseSetCookies(response).find(
        ({ name }) => name === sessionCookieName
      )

      expect(response.statusCode).toBe(303)
      expect(sessionCookie.value).not.toBe('')
      expect(sessionCookie.header).toContain('HttpOnly')
      expect(sessionCookie.header).toContain('SameSite=Lax')
    })

    test('accepts the response Microsoft sends back in the query string', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/callback?code=fake-code&state=fake-state'
      })

      expect(response.statusCode).toBe(303)
      expect(response.headers.location).toBe('/auth/signed-in')
    })

    test('stores the signed-in user on the server under a new random session ID', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-01-01T09:00:00.000Z'))
      const saveSession = vi.spyOn(server.userSessionCache, 'set')

      try {
        await postCallback(server)
        await postCallback(server)
      } finally {
        vi.useRealTimers()
      }

      const [firstSessionId, savedSession] = saveSession.mock.calls[0]
      const [secondSessionId] = saveSession.mock.calls[1]
      expect(firstSessionId).toMatch(uuidPattern)
      expect(secondSessionId).toMatch(uuidPattern)
      expect(secondSessionId).not.toBe(firstSessionId)
      expect(savedSession).toEqual({
        id: fakeUserId,
        displayName: 'Test User',
        email: 'test.user@example.com',
        roles: ['DataSteward'],
        loginHint: 'fake-login-hint',
        accessToken: 'fake-access-token',
        refreshToken: 'fake-refresh-token',
        expiresAt: '2026-01-01T10:00:00.000Z'
      })
    })

    test('stores no roles when the user has none', async () => {
      oidc.callback.mockResolvedValue(fakeCredentials({ roles: undefined }))
      const saveSession = vi.spyOn(server.userSessionCache, 'set')

      await postCallback(server)

      expect(saveSession.mock.calls[0][1].roles).toEqual([])
    })

    test('starts a new session store after sign in so an earlier one cannot be reused', async () => {
      const { jarBeforeSignedIn } = await signIn(server, '/about')

      // Replaying the session store cookie from before sign in no longer finds the return path
      const replayResponse = await server.inject({
        method: 'GET',
        url: '/auth/signed-in',
        headers: { cookie: cookieHeader(jarBeforeSignedIn) }
      })

      expect(replayResponse.headers.location).toBe('/')
    })
  })

  describe('When sign in fails', () => {
    test('shows a generic error page without the failure details', async () => {
      oidc.callback.mockRejectedValue(
        Boom.unauthorized('state mismatch: expected abc123')
      )

      const response = await postCallback(server)

      expect(response.statusCode).toBe(statusCodes.unauthorized)
      expect(response.payload).toContain('Unauthorized')
      expect(response.payload).not.toContain('state mismatch')
      expect(response.payload).not.toContain('abc123')
      expect(setCookieNames(response)).not.toContain(sessionCookieName)
    })

    test('refuses a sign in that has no user identifier', async () => {
      oidc.callback.mockResolvedValue(fakeCredentials({ oid: undefined }))
      const saveSession = vi.spyOn(server.userSessionCache, 'set')

      const response = await postCallback(server)

      expect(response.statusCode).toBe(statusCodes.unauthorized)
      expect(saveSession).not.toHaveBeenCalled()
      expect(setCookieNames(response)).not.toContain(sessionCookieName)
    })

    test.each([
      ['an oversized value', `code=${'x'.repeat(9000)}&state=fake-state`],
      ['an unexpected parameter name', 'Code=fake-code&state=fake-state'],
      ['a nested parameter', 'code[value]=fake-code&state=fake-state'],
      [
        'too many parameters',
        [...'abcdefghijk'].map((name) => `${name}=1`).join('&')
      ]
    ])('refuses a sign-in response with %s', async (_scenario, payload) => {
      const response = await postCallback(server, payload)

      expect(response.statusCode).toBe(statusCodes.unauthorized)
      expect(oidc.callback).not.toHaveBeenCalled()
    })

    test('refuses a posted sign-in response that also has a query string', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/callback?code=fake-other-code',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'code=fake-code&state=fake-state'
      })

      expect(response.statusCode).toBe(statusCodes.unauthorized)
      expect(oidc.callback).not.toHaveBeenCalled()
    })

    test('refuses a sign-in response that is not a form post', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/callback',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ code: 'fake-code', state: 'fake-state' })
      })

      expect(response.statusCode).toBe(415)
      expect(oidc.callback).not.toHaveBeenCalled()
    })
  })

  describe('Signed-in users', () => {
    test('see the page they asked for with a Sign out link', async () => {
      const { jar } = await signIn(server)

      const response = await server.inject({
        method: 'GET',
        url: '/about',
        headers: { cookie: cookieHeader(jar) }
      })
      const $ = cheerio.load(response.payload)
      const signOutLink = $('.govuk-service-navigation a').filter(
        (_index, link) => $(link).text().trim() === 'Sign out'
      )

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(signOutLink.attr('href')).toBe('/auth/sign-out')
    })

    test('see a Sign out link on the cookies page', async () => {
      const { jar } = await signIn(server)

      const response = await server.inject({
        method: 'GET',
        url: '/cookies',
        headers: { cookie: cookieHeader(jar) }
      })

      expect(
        cheerio.load(response.payload)('.govuk-service-navigation').text()
      ).toContain('Sign out')
    })

    test('stay signed in with new tokens and roles when their access token is refreshed', async () => {
      const saveSession = vi.spyOn(server.userSessionCache, 'set')
      const { jar } = await signIn(server)
      const [sessionId] = saveSession.mock.calls[0]
      oidc.ensureValidToken.mockResolvedValueOnce({
        refreshed: true,
        token: {
          accessToken: 'fake-refreshed-access-token',
          refreshToken: 'fake-refreshed-refresh-token',
          expiresIn: 3600,
          claims: {
            oid: fakeUserId,
            name: 'Test User',
            preferred_username: 'test.user@example.com',
            roles: ['DataOwner']
          }
        }
      })

      const response = await server.inject({
        method: 'GET',
        url: '/about',
        headers: { cookie: cookieHeader(jar) }
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(await server.userSessionCache.get(sessionId)).toMatchObject({
        id: fakeUserId,
        roles: ['DataOwner'],
        accessToken: 'fake-refreshed-access-token',
        refreshToken: 'fake-refreshed-refresh-token',
        expiresAt: expect.any(String)
      })
    })

    test('keep their details and refresh token when a refresh returns only a new access token', async () => {
      const saveSession = vi.spyOn(server.userSessionCache, 'set')
      const { jar } = await signIn(server)
      const [sessionId] = saveSession.mock.calls[0]
      oidc.ensureValidToken.mockResolvedValueOnce({
        refreshed: true,
        token: { accessToken: 'fake-refreshed-access-token' }
      })

      const response = await server.inject({
        method: 'GET',
        url: '/about',
        headers: { cookie: cookieHeader(jar) }
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(await server.userSessionCache.get(sessionId)).toMatchObject({
        id: fakeUserId,
        displayName: 'Test User',
        roles: ['DataSteward'],
        accessToken: 'fake-refreshed-access-token',
        refreshToken: 'fake-refresh-token',
        expiresAt: null
      })
    })

    test('are signed out when their access token cannot be refreshed', async () => {
      const saveSession = vi.spyOn(server.userSessionCache, 'set')
      const { jar } = await signIn(server)
      const [sessionId] = saveSession.mock.calls[0]
      oidc.ensureValidToken.mockRejectedValueOnce(new Error('invalid_grant'))

      const response = await server.inject({
        method: 'GET',
        url: '/about',
        headers: { cookie: cookieHeader(jar) }
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe('/auth/sign-in?next=%2Fabout')
      expect(clearedCookieNames(response)).toContain(sessionCookieName)
      expect(await server.userSessionCache.get(sessionId)).toBeNull()
    })
  })

  describe('Signing out', () => {
    test('ends the session and sends the user to Microsoft to sign out', async () => {
      const { jar } = await signIn(server)

      const response = await server.inject({
        method: 'GET',
        url: '/auth/sign-out',
        headers: { cookie: cookieHeader(jar) }
      })
      const location = new URL(response.headers.location)

      expect(response.statusCode).toBe(302)
      expect(`${location.origin}${location.pathname}`).toBe(endSessionEndpoint)
      expect(location.searchParams.get('post_logout_redirect_uri')).toBe(
        'http://localhost:3000/auth/signed-out'
      )
      expect(location.searchParams.get('logout_hint')).toBe('fake-login-hint')
      expect(globalThis.fetch).toHaveBeenCalledWith(
        discoveryUri,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
      expect(clearedCookieNames(response)).toContain(sessionCookieName)
    })

    test('URL-encodes every parameter sent to Microsoft', async () => {
      oidc.callback.mockResolvedValue(
        fakeCredentials({ login_hint: 'fake hint&prompt=login' })
      )
      const { jar } = await signIn(server)

      const response = await server.inject({
        method: 'GET',
        url: '/auth/sign-out',
        headers: { cookie: cookieHeader(jar) }
      })

      expect(response.headers.location).toBe(
        `${endSessionEndpoint}?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fsigned-out&logout_hint=fake+hint%26prompt%3Dlogin`
      )
    })

    test('leaves out the logout hint when Microsoft did not send one', async () => {
      oidc.callback.mockResolvedValue(
        fakeCredentials({ login_hint: undefined })
      )
      const { jar } = await signIn(server)

      const response = await server.inject({
        method: 'GET',
        url: '/auth/sign-out',
        headers: { cookie: cookieHeader(jar) }
      })

      expect(
        new URL(response.headers.location).searchParams.has('logout_hint')
      ).toBe(false)
    })

    test('stops the old session cookie working', async () => {
      const { jar } = await signIn(server)
      await server.inject({
        method: 'GET',
        url: '/auth/sign-out',
        headers: { cookie: cookieHeader(jar) }
      })

      const response = await server.inject({
        method: 'GET',
        url: '/about',
        headers: { cookie: cookieHeader(jar) }
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe('/auth/sign-in?next=%2Fabout')
    })

    test('still clears the session cookie when the session store cannot be reached', async () => {
      const { jar } = await signIn(server)
      vi.spyOn(server.userSessionCache, 'drop').mockRejectedValueOnce(
        new Error('connection lost')
      )

      const response = await server.inject({
        method: 'GET',
        url: '/auth/sign-out',
        headers: { cookie: cookieHeader(jar) }
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toMatch(endSessionEndpoint)
      expect(clearedCookieNames(response)).toContain(sessionCookieName)
    })

    test.each([
      [
        'Microsoft cannot be reached',
        () => Promise.reject(new TypeError('fetch failed'))
      ],
      [
        'Microsoft returns an error',
        () => Promise.resolve(new Response('Unavailable', { status: 503 }))
      ],
      [
        'Microsoft returns no sign-out address',
        () => Promise.resolve(Response.json({}))
      ],
      [
        'the sign-out address is on another site',
        () =>
          Promise.resolve(
            Response.json({
              end_session_endpoint: 'https://evil.example/logout'
            })
          )
      ]
    ])(
      'still signs the user out of this service when %s',
      async (_scenario, discoveryResponse) => {
        const saveSession = vi.spyOn(server.userSessionCache, 'set')
        const { jar } = await signIn(server)
        const [sessionId] = saveSession.mock.calls[0]
        globalThis.fetch.mockImplementation(discoveryResponse)

        const response = await server.inject({
          method: 'GET',
          url: '/auth/sign-out',
          headers: { cookie: cookieHeader(jar) }
        })

        expect(response.statusCode).toBe(302)
        expect(response.headers.location).toBe('/auth/signed-out')
        expect(clearedCookieNames(response)).toContain(sessionCookieName)
        expect(await server.userSessionCache.get(sessionId)).toBeNull()
      }
    )

    test('sends a user whose session has already ended to Microsoft to sign out', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/sign-out'
      })
      const location = new URL(response.headers.location)

      expect(response.statusCode).toBe(302)
      expect(`${location.origin}${location.pathname}`).toBe(endSessionEndpoint)
      expect(location.searchParams.has('logout_hint')).toBe(false)
    })
  })

  describe('The signed out page', () => {
    test('tells the user they have signed out and lets them sign in again', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/signed-out'
      })
      const $ = cheerio.load(response.payload)

      expect(response.statusCode).toBe(statusCodes.ok)
      expect($('head > title').text().replace(/\s+/g, ' ').trim()).toBe(
        `You have signed out | ${config.get('serviceName')}`
      )
      expect($('h1.govuk-heading-l').text().trim()).toBe('You have signed out')
      expect($('main p.govuk-body').text().replace(/\s+/g, ' ').trim()).toBe(
        'Sign in to use the service again.'
      )
      expect($('main a.govuk-link').attr('href')).toBe('/auth/sign-in')
    })
  })
})
