import authCookie from '@hapi/cookie'

import { config } from '#/config/config.js'
import { authPaths } from '#/server/common/constants/auth-paths.js'
import { validateUserSession } from '#/server/common/helpers/auth/user-session.js'

const sessionConfig = config.get('session')

/**
 * Keeps staff signed in. The cookie holds only a random session ID; the user's
 * details and tokens stay on the server in the session cache, in their own
 * segment. Every route needs a signed-in user unless it opts out with
 * `auth: false` (or `auth: { mode: 'try' }`). Anyone not signed in is sent to
 * sign in, with the page they asked for kept in the `next` query parameter.
 */
export const authSession = {
  plugin: {
    name: 'auth-session',
    dependencies: ['hapi-auth-oidc'],
    async register(server) {
      await server.register(authCookie)

      const userSessionCache = server.cache({
        cache: sessionConfig.cache.name,
        segment: 'user-session',
        expiresIn: sessionConfig.cache.ttl
      })
      server.decorate('server', 'userSessionCache', userSessionCache)

      server.auth.strategy('session', 'cookie', {
        cookie: {
          name: config.get('auth.sessionCookieName'),
          path: '/',
          password: sessionConfig.cookie.password,
          ttl: sessionConfig.cookie.ttl,
          isSecure: sessionConfig.cookie.secure,
          isHttpOnly: true,
          isSameSite: 'Lax',
          clearInvalid: true
        },
        keepAlive: true,
        redirectTo: authPaths.signIn,
        appendNext: 'next',
        requestDecoratorName: 'sessionCookie',
        validate: validateUserSession
      })

      server.auth.default({ strategy: 'session', mode: 'required' })
    }
  }
}
