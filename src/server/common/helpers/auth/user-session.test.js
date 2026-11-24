import { vi } from 'vitest'

import { config } from '#/config/config.js'
import { createLocalUserSession, validateUserSession } from './user-session.js'

describe('#createLocalUserSession', () => {
  test('has the same shape as a real session, with the role and no tokens', () => {
    expect(createLocalUserSession('DataSteward')).toEqual({
      id: '00000000-0000-4000-8000-00000000de00',
      displayName: 'Local Developer',
      email: 'local.developer@example.invalid',
      roles: ['DataSteward'],
      loginHint: undefined,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      isLocalDeveloper: true
    })
  })
})

describe('#validateUserSession for a local developer session', () => {
  afterEach(() => {
    config.set('auth.localSignIn', false)
    config.set('cdpEnvironment', null)
  })

  function requestWithSession(session) {
    const drop = vi.fn()
    const ensureValidToken = vi.fn()
    return {
      drop,
      ensureValidToken,
      request: {
        ensureValidToken,
        server: {
          userSessionCache: { get: vi.fn().mockResolvedValue(session), drop }
        }
      }
    }
  }

  test('is valid, with no token refresh, while local sign-in is enabled', async () => {
    config.set('auth.localSignIn', true)
    config.set('cdpEnvironment', 'local')
    const session = createLocalUserSession('Administrator')
    const { request, ensureValidToken } = requestWithSession(session)

    const result = await validateUserSession(request, { sessionId: 'fake' })

    expect(result).toEqual({ isValid: true, credentials: session })
    expect(ensureValidToken).not.toHaveBeenCalled()
  })

  test('is dropped and treated as signed out when local sign-in is off', async () => {
    const { request, drop } = requestWithSession(
      createLocalUserSession('Administrator')
    )

    const result = await validateUserSession(request, { sessionId: 'fake' })

    expect(result).toEqual({ isValid: false })
    expect(drop).toHaveBeenCalledWith('fake')
  })
})

describe('#validateUserSession', () => {
  test('treats a session cookie with no session ID as signed out', async () => {
    const getSession = vi.fn()
    const request = { server: { userSessionCache: { get: getSession } } }

    const result = await validateUserSession(request, {})

    expect(result).toEqual({ isValid: false })
    expect(getSession).not.toHaveBeenCalled()
  })

  test('treats the user as signed out, and logs it without the session ID, when the session store cannot be read', async () => {
    const logError = vi.fn()
    const request = {
      server: {
        userSessionCache: {
          get: vi.fn().mockRejectedValue(new Error('connection lost'))
        }
      },
      logger: { error: logError }
    }

    const result = await validateUserSession(request, {
      sessionId: 'fake-session-id'
    })

    expect(result).toEqual({ isValid: false })
    expect(logError).toHaveBeenCalledWith(
      'Could not read the session store, so the user is treated as signed out: connection lost'
    )
  })
})
