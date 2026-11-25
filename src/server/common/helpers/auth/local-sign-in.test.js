import { vi } from 'vitest'

import { config } from '#/config/config.js'
import { isLocalSignInEnabled, localDeveloperClaims } from './local-sign-in.js'

function fakeConfig(values) {
  return { get: (key) => values[key] }
}

const allowed = {
  'auth.localSignIn': true,
  isProduction: false,
  cdpEnvironment: 'local',
  host: '127.0.0.1',
  'session.cache.engine': 'memory',
  'redis.host': '127.0.0.1'
}

describe('#isLocalSignInEnabled', () => {
  test('is on only when the setting is true, it is not production and the CDP environment is local', () => {
    expect(isLocalSignInEnabled(fakeConfig(allowed))).toBe(true)
  })

  test.each([
    ['the session cache is Redis on redis', 'redis', 'redis'],
    ['the session cache is Redis on localhost', 'redis', 'localhost'],
    ['the session cache is Redis on ::1', 'redis', '::1'],
    [
      'the session cache is in memory, with a foreign Redis host',
      'memory',
      'redis.example.internal'
    ]
  ])('is on when %s', (_name, engine, redisHost) => {
    expect(
      isLocalSignInEnabled(
        fakeConfig({
          ...allowed,
          'session.cache.engine': engine,
          'redis.host': redisHost
        })
      )
    ).toBe(true)
  })

  test('is off, and logs nothing, when reading the config throws', () => {
    const throwingConfig = {
      get: () => {
        throw new Error('config unavailable')
      }
    }
    const consoleSpy = vi.spyOn(console, 'error')

    expect(isLocalSignInEnabled(throwingConfig)).toBe(false)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  test.each([
    ['the setting is off', { 'auth.localSignIn': false }],
    ['the setting is not a boolean', { 'auth.localSignIn': 'true' }],
    ['it is production', { isProduction: true }],
    ['the CDP environment is dev', { cdpEnvironment: 'dev' }],
    ['the CDP environment is prod', { cdpEnvironment: 'prod' }],
    ['the CDP environment is not set', { cdpEnvironment: null }],
    ['the CDP environment is in capitals', { cdpEnvironment: 'LOCAL' }],
    ['the service listens on every address', { host: '0.0.0.0' }],
    ['the service listens on a network address', { host: '192.168.1.20' }],
    [
      'the session cache is a shared Redis',
      {
        'session.cache.engine': 'redis',
        'redis.host': 'redis.example.internal'
      }
    ]
  ])('is off when %s', (_name, override) => {
    expect(isLocalSignInEnabled(fakeConfig({ ...allowed, ...override }))).toBe(
      false
    )
  })
})

describe('#isLocalSignInEnabled with the real config', () => {
  afterEach(() => {
    config.set('auth.localSignIn', false)
    config.set('cdpEnvironment', null)
    config.reset('host')
    config.reset('session.cache.engine')
    config.reset('redis.host')
  })

  function turnOnLocally() {
    config.set('auth.localSignIn', true)
    config.set('cdpEnvironment', 'local')
    config.set('host', '127.0.0.1')
    config.set('session.cache.engine', 'memory')
  }

  test('is turned off when the session cache is changed to a foreign Redis after start-up', () => {
    turnOnLocally()
    expect(isLocalSignInEnabled()).toBe(true)

    config.set('session.cache.engine', 'redis')
    config.set('redis.host', 'redis.example.internal')

    expect(isLocalSignInEnabled()).toBe(false)
  })

  test('is turned off when the CDP environment is changed to dev after start-up', () => {
    turnOnLocally()
    expect(isLocalSignInEnabled()).toBe(true)

    config.set('cdpEnvironment', 'dev')

    expect(isLocalSignInEnabled()).toBe(false)
  })

  test('is turned off when the host is changed to every address after start-up', () => {
    config.set('auth.localSignIn', true)
    config.set('cdpEnvironment', 'local')
    config.set('host', '127.0.0.1')
    expect(isLocalSignInEnabled()).toBe(true)

    config.set('host', '0.0.0.0')

    expect(isLocalSignInEnabled()).toBe(false)
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
