import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'
import Joi from 'joi'

import { config } from '#/config/config.js'
import { authPaths } from '#/server/common/constants/auth-paths.js'
import { entraDiscoveryUri } from '#/server/common/helpers/auth/entra.js'
import { safeReturnPath } from '#/server/common/helpers/auth/return-path.js'
import { signOutRedirectUrl } from '#/server/common/helpers/auth/sign-out-redirect.js'
import { createUserSession } from '#/server/common/helpers/auth/user-session.js'

const authConfig = config.get('auth')
const returnPathKey = 'authReturnPath'
const maxReturnPathLength = 2000

// Entra ID sends back a few short parameters: code, state and session_state,
// or error details. Allow only that shape, so nothing large or nested reaches
// the token exchange. The state and PKCE checks protect the rest.
const maxCallbackBytes = 16 * 1024
const callbackParameters = Joi.object()
  .pattern(/^[a-z_]{1,64}$/, Joi.string().max(4096))
  .max(10)

function rejectCallback(request) {
  request.logger.warn('Sign-in response rejected: unexpected parameters')
  throw Boom.unauthorized()
}

async function completeSignIn(request, h) {
  // Throws a 401 if the response fails the state, PKCE or token checks
  const credentials = await request.callback(h)
  if (!credentials?.claims?.oid) {
    request.logger.warn('Sign-in response had no user identifier')
    throw Boom.unauthorized()
  }

  const sessionId = randomUUID()
  await request.server.userSessionCache.set(
    sessionId,
    createUserSession(credentials)
  )
  request.sessionCookie.set({ sessionId })
  request.logger.info('User signed in')

  // Entra ID posts the sign-in response from its own site (form_post), so the
  // browser sends none of this service's SameSite=Lax cookies with it, and the
  // session store (yar) holding the return path can't be read here. A 303
  // turns it into a GET navigation to this service, which does carry them.
  return h.redirect(authPaths.signedIn).code(303)
}

async function dropUserSession(request, sessionId) {
  try {
    await request.server.userSessionCache.drop(sessionId)
  } catch (error) {
    // The cookie is already cleared, so the browser no longer uses this
    // session; the server copy expires on its own after its TTL
    request.logger.error(
      `Could not delete an ended server session: ${error.message}`
    )
  }
}

export const signInController = {
  // 'try', not false: a signed-in user is sent straight on, so a link from
  // another site can't end their session by starting a new sign-in
  options: {
    auth: { mode: 'try' },
    validate: {
      query: Joi.object({
        next: Joi.string().max(maxReturnPathLength)
      })
    }
  },
  async handler(request, h) {
    const returnPath = safeReturnPath(request.query.next)
    if (request.auth.isAuthenticated) {
      return h.redirect(returnPath)
    }

    // A cookie for a session that no longer works has already been cleared by
    // the session strategy (clearInvalid); any server copy has been dropped
    // by validation or expires after its TTL
    request.yar.set(returnPathKey, returnPath)
    return request.login(h)
  }
}

export const callbackQueryController = {
  options: {
    auth: false,
    validate: {
      query: callbackParameters,
      failAction: rejectCallback
    }
  },
  handler: completeSignIn
}

export const callbackFormPostController = {
  options: {
    auth: false,
    // Entra ID can't send a CSRF token; the state and PKCE checks do that job
    plugins: { crumb: false },
    payload: {
      parse: true,
      allow: 'application/x-www-form-urlencoded',
      maxBytes: maxCallbackBytes
    },
    validate: {
      // Entra ID's form post has no query string, and the library would
      // otherwise read one alongside the checked body
      query: Joi.object({}),
      payload: callbackParameters,
      failAction: rejectCallback
    }
  },
  handler: completeSignIn
}

export const signedInController = {
  // Needs sign-in (the server default): the session cookie set by the callback
  handler(request, h) {
    const returnPath = safeReturnPath(request.yar.get(returnPathKey))

    // Start a new session store after sign in, so a session ID set before it
    // (for example by an attacker) can't be carried into the signed-in session
    request.yar.reset()

    return h.redirect(returnPath)
  }
}

export const signOutController = {
  // 'try', not false: reads the signed-in session so it can be ended, and
  // never sends someone to sign in just so they can sign out
  options: {
    auth: { mode: 'try' }
  },
  async handler(request, h) {
    const sessionId = request.auth.artifacts?.sessionId
    const loginHint = request.auth.isAuthenticated
      ? request.auth.credentials.loginHint
      : undefined

    // Clear the browser's state first, so the user is signed out here even
    // if the session store can't be reached
    request.sessionCookie.clear()
    request.yar.reset()
    if (sessionId) {
      await dropUserSession(request, sessionId)
    }
    request.logger.info('User signed out')

    const redirectUrl = await signOutRedirectUrl({
      discoveryUri: entraDiscoveryUri(authConfig.tenantId),
      externalBaseUrl: authConfig.externalBaseUrl,
      loginHint,
      logger: request.logger
    })
    return h.redirect(redirectUrl)
  }
}

export const signedOutController = {
  options: {
    auth: false
  },
  handler(_request, h) {
    return h.view('auth/signed-out', {
      pageTitle: 'You have signed out',
      signInPath: authPaths.signIn
    })
  }
}
