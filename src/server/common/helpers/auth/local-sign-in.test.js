import { isLocalSignInEnabled, localDeveloperClaims } from './local-sign-in.js'

function fakeConfig(values) {
  return { get: (key) => values[key] }
}

const allowed = {
  'auth.localSignIn': true,
  isProduction: false,
  cdpEnvironment: 'local'
}

describe('#isLocalSignInEnabled', () => {
  test('is on only when the setting is true, it is not production and the CDP environment is local', () => {
    expect(isLocalSignInEnabled(fakeConfig(allowed))).toBe(true)
  })

  test.each([
    ['the setting is off', { 'auth.localSignIn': false }],
    ['the setting is not a boolean', { 'auth.localSignIn': 'true' }],
    ['it is production', { isProduction: true }],
    ['the CDP environment is dev', { cdpEnvironment: 'dev' }],
    ['the CDP environment is prod', { cdpEnvironment: 'prod' }],
    ['the CDP environment is not set', { cdpEnvironment: null }],
    ['the CDP environment is in capitals', { cdpEnvironment: 'LOCAL' }]
  ])('is off when %s', (_name, override) => {
    expect(isLocalSignInEnabled(fakeConfig({ ...allowed, ...override }))).toBe(
      false
    )
  })
})

describe('#localDeveloperClaims', () => {
  test('describes an obviously fake user with the given role', () => {
    expect(localDeveloperClaims('DataOwner')).toEqual({
      oid: '00000000-0000-4000-8000-00000000de00',
      name: 'Local Developer',
      preferred_username: 'local.developer@example.invalid',
      roles: ['DataOwner']
    })
  })
})
