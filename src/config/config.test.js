import { vi } from 'vitest'

const fakeTenantId = '00000000-0000-0000-0000-00000000000a'
const fakeClientId = '00000000-0000-0000-0000-00000000000b'
const fakeCookiePassword = 'fake-cookie-password-that-is-32-characters-plus'

function stubProductionEnv(overrides = {}) {
  const env = {
    NODE_ENV: 'production',
    ENTRA_TENANT_ID: fakeTenantId,
    ENTRA_CLIENT_ID: fakeClientId,
    APP_BASE_URL: 'https://livestock-data-catalogue-ui.example',
    SESSION_COOKIE_PASSWORD: fakeCookiePassword,
    ...overrides
  }
  for (const [name, value] of Object.entries(env)) {
    vi.stubEnv(name, value)
  }
}

// The settings that allow local sign-in. Pass undefined to leave one unset.
function stubLocalSignInEnv(overrides = {}) {
  const env = {
    LOCAL_SIGN_IN: 'true',
    ENVIRONMENT: 'local',
    HOST: '127.0.0.1',
    ...overrides
  }
  for (const [name, value] of Object.entries(env)) {
    vi.stubEnv(name, value)
  }
}

async function loadConfig() {
  vi.resetModules()
  const { config } = await import('./config.js')
  return config
}

describe('#config local sign-in settings', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  test('is off by default, with the DataOwner role', async () => {
    const config = await loadConfig()

    expect(config.get('auth.localSignIn')).toBe(false)
    expect(config.get('auth.localSignInRole')).toBe('DataOwner')
    expect(config.get('cdpEnvironment')).toBeNull()
  })

  test('starts when it is on in the local CDP environment, listening on loopback', async () => {
    stubLocalSignInEnv({ LOCAL_SIGN_IN_ROLE: 'Administrator' })

    const config = await loadConfig()

    expect(config.get('auth.localSignIn')).toBe(true)
    expect(config.get('auth.localSignInRole')).toBe('Administrator')
  })

  test.each(['127.0.0.1', '::1'])(
    'starts when listening on %s',
    async (host) => {
      stubLocalSignInEnv({ HOST: host })

      const config = await loadConfig()

      expect(config.get('auth.localSignIn')).toBe(true)
    }
  )

  test('refuses HOST=localhost, because HOST must be an IP address', async () => {
    stubLocalSignInEnv({ HOST: 'localhost' })

    await expect(loadConfig()).rejects.toThrow('host: must be an IP address')
  })

  test.each(['0.0.0.0', '::', '192.168.1.20'])(
    'refuses to start when it is on and the service listens on %s',
    async (host) => {
      stubLocalSignInEnv({ HOST: host })

      await expect(loadConfig()).rejects.toThrow(
        'LOCAL_SIGN_IN needs HOST to be 127.0.0.1 or ::1'
      )
    }
  )

  test('refuses to start when it is on and HOST is not set, because the default listens on every address', async () => {
    stubLocalSignInEnv({ HOST: undefined })

    await expect(loadConfig()).rejects.toThrow(
      'LOCAL_SIGN_IN needs HOST to be 127.0.0.1 or ::1'
    )
  })

  test.each(['localhost', '127.0.0.1', '::1', 'redis'])(
    'starts when it is on and the session cache is Redis on %s',
    async (redisHost) => {
      stubLocalSignInEnv({
        SESSION_CACHE_ENGINE: 'redis',
        REDIS_HOST: redisHost
      })

      const config = await loadConfig()

      expect(config.get('auth.localSignIn')).toBe(true)
    }
  )

  test.each(['redis.example.internal', '10.0.0.5', 'LOCALHOST.evil.example'])(
    'refuses to start when it is on and the session cache is Redis on %s',
    async (redisHost) => {
      stubLocalSignInEnv({
        SESSION_CACHE_ENGINE: 'redis',
        REDIS_HOST: redisHost
      })

      await expect(loadConfig()).rejects.toThrow(
        'LOCAL_SIGN_IN needs the in-memory session cache or a local Redis'
      )
    }
  )

  test('starts when it is on with the in-memory session cache, whatever REDIS_HOST is', async () => {
    stubLocalSignInEnv({
      SESSION_CACHE_ENGINE: 'memory',
      REDIS_HOST: 'redis.example.internal'
    })

    const config = await loadConfig()

    expect(config.get('auth.localSignIn')).toBe(true)
  })

  test('refuses to start when it is on in production, even if ENVIRONMENT is local', async () => {
    stubProductionEnv({ LOCAL_SIGN_IN: 'true', ENVIRONMENT: 'local' })

    await expect(loadConfig()).rejects.toThrow(
      'LOCAL_SIGN_IN must not be true in production'
    )
  })

  test.each(['dev', 'test', 'perf-test', 'ext-test', 'prod', 'Local', ''])(
    'refuses to start when it is on and ENVIRONMENT is "%s"',
    async (environment) => {
      stubLocalSignInEnv({ ENVIRONMENT: environment })

      await expect(loadConfig()).rejects.toThrow(
        'LOCAL_SIGN_IN is only allowed when ENVIRONMENT is local'
      )
    }
  )

  test('refuses to start when it is on and ENVIRONMENT is not set', async () => {
    stubLocalSignInEnv({ ENVIRONMENT: undefined })

    await expect(loadConfig()).rejects.toThrow(
      'LOCAL_SIGN_IN is only allowed when ENVIRONMENT is local'
    )
  })

  test('refuses to start with a role that is not allowed', async () => {
    vi.stubEnv('LOCAL_SIGN_IN_ROLE', 'Owner')

    await expect(loadConfig()).rejects.toThrow('auth.localSignInRole')
  })

  test('refuses to start when LOCAL_SIGN_IN is not exactly true or false', async () => {
    stubLocalSignInEnv({ LOCAL_SIGN_IN: 'yes' })

    await expect(loadConfig()).rejects.toThrow('auth.localSignIn')
  })

  test('production starts when it is off', async () => {
    stubProductionEnv({ LOCAL_SIGN_IN: 'false' })

    const config = await loadConfig()

    expect(config.get('auth.localSignIn')).toBe(false)
  })
})

describe('#config authentication settings', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  describe('In production', () => {
    test('starts with the Entra ID values set', async () => {
      stubProductionEnv()

      const config = await loadConfig()

      expect(config.get('auth')).toMatchObject({
        tenantId: fakeTenantId,
        clientId: fakeClientId,
        apiScope: 'access_as_user',
        externalBaseUrl: 'https://livestock-data-catalogue-ui.example',
        responseMode: 'form_post',
        tokenProvider: 'web-identity',
        federatedCredentialAudience: 'api://AzureADTokenExchange',
        stateCookie: { isSecure: true, isSameSite: 'None' }
      })
    })

    test.each([
      ['ENTRA_TENANT_ID', 'ENTRA_TENANT_ID is not set'],
      ['ENTRA_CLIENT_ID', 'ENTRA_CLIENT_ID is not set'],
      ['APP_BASE_URL', 'APP_BASE_URL is not set']
    ])(
      'refuses to start when %s is missing',
      async (variable, expectedProblem) => {
        stubProductionEnv({ [variable]: undefined })

        await expect(loadConfig()).rejects.toThrow(expectedProblem)
      }
    )

    test('refuses to start with the mock token provider', async () => {
      stubProductionEnv({ ENTRA_TOKEN_PROVIDER: 'mock' })

      await expect(loadConfig()).rejects.toThrow(
        'ENTRA_TOKEN_PROVIDER must not be mock'
      )
    })

    test('refuses to start without a cookie password of its own', async () => {
      stubProductionEnv({ SESSION_COOKIE_PASSWORD: undefined })

      await expect(loadConfig()).rejects.toThrow(
        'SESSION_COOKIE_PASSWORD is not set'
      )
    })

    test.each([
      ['SESSION_COOKIE_SECURE', 'SESSION_COOKIE_SECURE must be true'],
      ['ENTRA_STATE_COOKIE_SECURE', 'ENTRA_STATE_COOKIE_SECURE must be true']
    ])(
      'refuses to start when %s lets cookies go over HTTP',
      async (variable, expectedProblem) => {
        stubProductionEnv({ [variable]: 'false' })

        await expect(loadConfig()).rejects.toThrow(expectedProblem)
      }
    )

    test('refuses to start when the service address does not use HTTPS', async () => {
      stubProductionEnv({ APP_BASE_URL: 'http://livestock.example' })

      await expect(loadConfig()).rejects.toThrow(
        'APP_BASE_URL must start with https://'
      )
    })

    test('lists every problem without printing secret values', async () => {
      stubProductionEnv({
        ENTRA_TENANT_ID: undefined,
        ENTRA_CLIENT_ID: undefined,
        ENTRA_TOKEN_PROVIDER: 'mock'
      })

      const error = await loadConfig().catch((loadError) => loadError)

      expect(error.message).toBe(
        'Configuration is not valid for production: ENTRA_TENANT_ID is not set; ENTRA_CLIENT_ID is not set; ENTRA_TOKEN_PROVIDER must not be mock'
      )
      expect(error.message).not.toContain(fakeCookiePassword)
    })
  })

  describe('In any environment', () => {
    test('uses placeholder Entra ID values and local settings for local development', async () => {
      const config = await loadConfig()

      expect(config.get('auth')).toMatchObject({
        tenantId: '00000000-0000-0000-0000-000000000000',
        clientId: '00000000-0000-0000-0000-000000000000',
        externalBaseUrl: 'http://localhost:3000',
        responseMode: 'query',
        tokenProvider: 'mock',
        stateCookie: { isSecure: false, isSameSite: 'Lax' }
      })
    })

    test.each([
      ['ENTRA_TENANT_ID', 'contoso.example/../../evil', 'auth.tenantId'],
      ['ENTRA_CLIENT_ID', 'not-a-guid', 'auth.clientId'],
      ['ENTRA_API_SCOPE', 'access_as_user openid', 'auth.apiScope'],
      ['ENTRA_TOKEN_PROVIDER', 'client-secret', 'auth.tokenProvider'],
      ['APP_BASE_URL', 'not a url', 'auth.externalBaseUrl']
    ])(
      'refuses to start with %s in the wrong format',
      async (variable, value, configKey) => {
        vi.stubEnv(variable, value)

        await expect(loadConfig()).rejects.toThrow(configKey)
      }
    )

    test('rejects a session cookie password shorter than 32 characters without printing it', async () => {
      vi.stubEnv('SESSION_COOKIE_PASSWORD', 'too-short-fake-password')

      const error = await loadConfig().catch((loadError) => loadError)

      expect(error.message).toContain('session.cookie.password')
      expect(error.message).not.toContain('too-short-fake-password')
    })
  })
})
