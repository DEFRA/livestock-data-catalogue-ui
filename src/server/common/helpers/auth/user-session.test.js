import { vi } from 'vitest'

import { validateUserSession } from './user-session.js'

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
