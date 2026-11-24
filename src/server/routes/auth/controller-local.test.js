import { vi } from 'vitest'

import { createServer } from '#/server/server.js'
import { config } from '#/config/config.js'

const sessionCookieName = config.get('auth.sessionCookieName')

function cookieFrom(response) {
  const header = [response.headers['set-cookie'] ?? []]
    .flat()
    .find((value) => value.startsWith(`${sessionCookieName}=`))
  return header?.split(';')[0]
}

function turnOnLocalSignIn(role = 'DataOwner') {
  config.set('auth.localSignIn', true)
  config.set('auth.localSignInRole', role)
  config.set('cdpEnvironment', 'local')
  config.set('host', '127.0.0.1')
}

function turnOffLocalSignIn() {
  config.set('auth.localSignIn', false)
  config.set('auth.localSignInRole', 'DataOwner')
  config.set('assetPath', '/public')
  config.set('cdpEnvironment', null)
  config.reset('host')
}

async function signInLocally(server, next = '/about') {
  const signIn = await server.inject({
    method: 'GET',
    url: `/auth/sign-in?next=${encodeURIComponent(next)}`
  })
  const cookies = [signIn.headers['set-cookie'] ?? []]
    .flat()
    .map((header) => header.split(';')[0])
  const signedIn = await server.inject({
    method: 'GET',
    url: signIn.headers.location,
    headers: { cookie: cookies.join('; ') }
  })
  return { signIn, signedIn, cookie: cookieFrom(signIn) }
}

describe('Signing in locally, with no Entra ID', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  afterEach(() => {
    turnOffLocalSignIn()
    vi.restoreAllMocks()
  })

  test('is off by default, so visitors are still sent to sign in', async () => {
    const response = await server.inject({ method: 'GET', url: '/about' })

    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe('/auth/sign-in?next=%2Fabout')
  })

  test('is not used when the CDP environment is not local', async () => {
    config.set('auth.localSignIn', true)
    config.set('cdpEnvironment', 'dev')
    const login = vi
      .spyOn(server.plugins['hapi-auth-oidc'].oidc, 'login')
      .mockImplementation((_request, h) =>
        h.redirect('https://login.microsoftonline.com/fake').takeover()
      )

    const response = await server.inject({
      method: 'GET',
      url: '/auth/sign-in?next=%2Fabout'
    })

    expect(login).toHaveBeenCalled()
    expect(cookieFrom(response)).toBeUndefined()
    expect(response.headers.location).toBe(
      'https://login.microsoftonline.com/fake'
    )
  })

  test('signs the visitor in with the chosen role, with no network call', async () => {
    turnOnLocalSignIn('DataSteward')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { signIn, signedIn, cookie } = await signInLocally(server)

    expect(signIn.statusCode).toBe(303)
    expect(signIn.headers.location).toBe('/auth/signed-in')
    expect(signedIn.statusCode).toBe(302)
    expect(signedIn.headers.location).toBe('/about')
    expect(cookie).toBeDefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('stores the same session shape as a real sign-in, with no tokens', async () => {
    turnOnLocalSignIn('DataOwner')
    const setSession = vi.spyOn(server.userSessionCache, 'set')

    await signInLocally(server)

    expect(setSession).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        id: '00000000-0000-4000-8000-00000000de00',
        displayName: 'Local Developer',
        email: 'local.developer@example.invalid',
        roles: ['DataOwner'],
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        isLocalDeveloper: true
      })
    )
  })

  test('lets the signed-in visitor see pages', async () => {
    turnOnLocalSignIn()
    const { cookie } = await signInLocally(server)

    const response = await server.inject({
      method: 'GET',
      url: '/about',
      headers: { cookie }
    })

    expect(response.statusCode).toBe(200)
  })

  test.each([
    ['an asset', '/public/assets/app.css'],
    ['an asset with a query', '/public/assets/app.css?v=1'],
    ['an encoded asset path', '/%70ublic/assets/app.css'],
    ['a differently cased asset path', '/Public/assets/app.css'],
    ['the asset folder itself', '/public'],
    ['the asset folder with a trailing slash', '/public/']
  ])(
    'does not sign in for %s, so a signed-out page does not sign the user back in',
    async (_name, assetPath) => {
      turnOnLocalSignIn()

      const response = await server.inject({
        method: 'GET',
        url: `/auth/sign-in?next=${encodeURIComponent(assetPath)}`
      })

      expect(response.statusCode).toBe(401)
      expect(cookieFrom(response)).toBeUndefined()
    }
  )

  test.each(['/static', '/static/'])(
    'guards a custom ASSET_PATH of %s, and no longer guards /public',
    async (customAssetPath) => {
      turnOnLocalSignIn()
      config.set('assetPath', customAssetPath)

      const asset = await server.inject({
        method: 'GET',
        url: `/auth/sign-in?next=${encodeURIComponent('/%73tatic/app.css')}`
      })
      const page = await server.inject({
        method: 'GET',
        url: `/auth/sign-in?next=${encodeURIComponent('/public/app.css')}`
      })

      expect(asset.statusCode).toBe(401)
      expect(page.statusCode).toBe(303)
    }
  )

  test('signs in for a page whose name only starts like the asset path', async () => {
    turnOnLocalSignIn()

    const response = await server.inject({
      method: 'GET',
      url: `/auth/sign-in?next=${encodeURIComponent('/public-page')}`
    })

    expect(response.statusCode).toBe(303)
    expect(cookieFrom(response)).toBeDefined()
  })

  test('stops honouring the session once local sign-in is turned off', async () => {
    turnOnLocalSignIn()
    const { cookie } = await signInLocally(server)
    turnOffLocalSignIn()

    const response = await server.inject({
      method: 'GET',
      url: '/about',
      headers: { cookie }
    })

    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe('/auth/sign-in?next=%2Fabout')
  })

  test('signs out without calling Entra ID, and ends the session', async () => {
    turnOnLocalSignIn()
    const { cookie } = await signInLocally(server)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const signOut = await server.inject({
      method: 'GET',
      url: '/auth/sign-out',
      headers: { cookie }
    })
    const afterwards = await server.inject({
      method: 'GET',
      url: '/about',
      headers: { cookie }
    })

    expect(signOut.statusCode).toBe(302)
    expect(signOut.headers.location).toBe('/auth/signed-out')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(afterwards.statusCode).toBe(302)
    expect(afterwards.headers.location).toBe('/auth/sign-in?next=%2Fabout')
  })
})
