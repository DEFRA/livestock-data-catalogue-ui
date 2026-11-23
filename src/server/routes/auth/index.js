import { authPaths } from '#/server/common/constants/auth-paths.js'
import {
  callbackFormPostController,
  callbackQueryController,
  signedInController,
  signedOutController,
  signInController,
  signOutController
} from './controller.js'

/**
 * Sets up the routes for signing in and out with Microsoft Entra ID.
 * These routes are registered in src/server/plugins/router.js.
 */
export const auth = {
  plugin: {
    name: 'auth',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: authPaths.signIn,
          ...signInController
        },
        {
          method: 'GET',
          path: authPaths.callback,
          ...callbackQueryController
        },
        {
          method: 'POST',
          path: authPaths.callback,
          ...callbackFormPostController
        },
        {
          method: 'GET',
          path: authPaths.signedIn,
          ...signedInController
        },
        {
          method: 'GET',
          path: authPaths.signOut,
          ...signOutController
        },
        {
          method: 'GET',
          path: authPaths.signedOut,
          ...signedOutController
        }
      ])
    }
  }
}
