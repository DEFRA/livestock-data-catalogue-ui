import { config, findLocalSignInProblems } from '#/config/config.js'

// Made-up values that are obviously not a real person. The .invalid domain can
// never receive email.
const localDeveloper = {
  oid: '00000000-0000-4000-8000-00000000de00',
  name: 'Local Developer',
  preferred_username: 'local.developer@example.invalid'
}

/**
 * Whether visitors are signed in as the fake local developer. Checked on every
 * use, not just at start-up, and fails closed: it is on only when the setting
 * is true and none of the start-up rules for local sign-in is broken (not
 * production, CDP environment local, loopback host, local session cache).
 * @param {import('convict').Config<*>} [appConfig]
 */
export function isLocalSignInEnabled(appConfig = config) {
  return (
    appConfig.get('auth.localSignIn') === true &&
    findLocalSignInProblems(appConfig).length === 0
  )
}

/**
 * The claims of the fake local developer, in the shape Entra ID returns them.
 * @param {string} role - one of the app roles
 */
export function localDeveloperClaims(role) {
  return { ...localDeveloper, roles: [role] }
}
