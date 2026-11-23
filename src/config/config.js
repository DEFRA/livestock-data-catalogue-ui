import convict from 'convict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import convictFormatWithValidator from 'convict-format-with-validator'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const fourHoursMs = 14400000
const oneWeekMs = 604800000
const minimumCookiePasswordLength = 32

// Lets the service start locally without an App Registration. Sign-in cannot
// complete with it, and production refuses to start without real values.
const placeholderEntraId = '00000000-0000-0000-0000-000000000000'
const guidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const scopeNamePattern = /^[A-Za-z0-9_.-]{1,64}$/

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const isDevelopment = process.env.NODE_ENV === 'development'

function guidFormat(value) {
  if (!guidPattern.test(value)) {
    throw new Error('must be a GUID, like 00000000-0000-0000-0000-000000000000')
  }
}

function scopeNameFormat(value) {
  if (!scopeNamePattern.test(value)) {
    throw new Error(
      'must be a single scope name of letters, numbers, dots, dashes or underscores'
    )
  }
}

function cookiePasswordFormat(value) {
  if (typeof value !== 'string' || value.length < minimumCookiePasswordLength) {
    throw new Error(
      `must be at least ${minimumCookiePasswordLength} characters long`
    )
  }
}

convict.addFormats(convictFormatWithValidator)

export const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 3000,
    env: 'PORT'
  },
  staticCacheTimeout: {
    doc: 'Static cache timeout in milliseconds',
    format: Number,
    default: oneWeekMs,
    env: 'STATIC_CACHE_TIMEOUT'
  },
  serviceName: {
    doc: 'Applications Service Name',
    format: String,
    default: 'livestock-data-catalogue-ui'
  },
  root: {
    doc: 'Project root',
    format: String,
    default: path.resolve(dirname, '../..')
  },
  assetPath: {
    doc: 'Asset path',
    format: String,
    default: '/public',
    env: 'ASSET_PATH'
  },
  isProduction: {
    doc: 'If this application running in the production environment',
    format: Boolean,
    default: isProduction
  },
  isDevelopment: {
    doc: 'If this application running in the development environment',
    format: Boolean,
    default: isDevelopment
  },
  isTest: {
    doc: 'If this application running in the test environment',
    format: Boolean,
    default: isTest
  },
  log: {
    enabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: process.env.NODE_ENV !== 'test',
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in.',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : [],
      env: 'LOG_REDACT'
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  isSecureContextEnabled: {
    doc: 'Enable Secure Context',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_SECURE_CONTEXT'
  },
  session: {
    cache: {
      engine: {
        doc: 'backend cache is written to',
        format: ['redis', 'memory'],
        default: isProduction ? 'redis' : 'memory',
        env: 'SESSION_CACHE_ENGINE'
      },
      name: {
        doc: 'server side session cache name',
        format: String,
        default: 'session',
        env: 'SESSION_CACHE_NAME'
      },
      ttl: {
        doc: 'server side session cache ttl',
        format: Number,
        default: fourHoursMs,
        env: 'SESSION_CACHE_TTL'
      }
    },
    cookie: {
      ttl: {
        doc: 'Session cookie ttl',
        format: Number,
        default: fourHoursMs,
        env: 'SESSION_COOKIE_TTL'
      },
      password: {
        doc: 'Password used to encrypt the session, sign-in and sign-in state cookies. At least 32 characters. Required in production',
        format: cookiePasswordFormat,
        nullable: true,
        default: isProduction
          ? null
          : 'the-password-must-be-at-least-32-characters-long',
        env: 'SESSION_COOKIE_PASSWORD',
        sensitive: true
      },
      secure: {
        doc: 'set secure flag on cookie',
        format: Boolean,
        default: isProduction,
        env: 'SESSION_COOKIE_SECURE'
      }
    }
  },
  redis: {
    host: {
      doc: 'Redis cache host',
      format: String,
      default: '127.0.0.1',
      env: 'REDIS_HOST'
    },
    username: {
      doc: 'Redis cache username',
      format: String,
      default: '',
      env: 'REDIS_USERNAME'
    },
    password: {
      doc: 'Redis cache password',
      format: '*',
      default: '',
      sensitive: true,
      env: 'REDIS_PASSWORD'
    },
    keyPrefix: {
      doc: 'Redis cache key prefix name used to isolate the cached results across multiple clients',
      format: String,
      default: 'livestock-data-catalogue-ui:',
      env: 'REDIS_KEY_PREFIX'
    },
    useSingleInstanceCache: {
      doc: 'Connect to a single instance of redis instead of a cluster.',
      format: Boolean,
      default: !isProduction,
      env: 'USE_SINGLE_INSTANCE_CACHE'
    },
    useTLS: {
      doc: 'Connect to redis using TLS',
      format: Boolean,
      default: isProduction,
      env: 'REDIS_TLS'
    }
  },
  nunjucks: {
    watch: {
      doc: 'Reload templates when they are changed.',
      format: Boolean,
      default: isDevelopment
    },
    noCache: {
      doc: 'Use a cache and recompile templates each time',
      format: Boolean,
      default: isDevelopment
    }
  },
  tracing: {
    header: {
      doc: 'Which header to track',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  cookieConsent: {
    name: {
      doc: 'Name of cookie that stores the user consent preference',
      format: String,
      default: `${encodeURIComponent('livestock-data-catalogue-ui')}_policy`
    },
    policy: {
      clearInvalid: {
        doc: 'Clear the cookie if it fails validation (e.g. bad JSON)',
        format: Boolean,
        default: true
      },
      encoding: {
        doc: 'Hapi cookie encoding — base64json automatically serialises objects',
        format: String,
        default: 'base64json'
      },
      isSameSite: {
        doc: 'SameSite attribute — Lax allows the cookie on top-level navigations',
        format: String,
        default: 'Lax'
      },
      isSecure: {
        doc: 'Secure flag — only send cookie over HTTPS in production',
        format: Boolean,
        default: isProduction
      }
    },
    config: {
      ttl: {
        doc: 'Cookie time-to-live in milliseconds (1 year)',
        format: 'nat',
        default: 1000 * 60 * 60 * 24 * 365
      }
    }
  },
  googleAnalytics: {
    googleTagManagerKey: {
      doc: 'Google Tag Manager container ID (e.g. GTM-XXXXXXXX)',
      format: String,
      default: '',
      env: 'GOOGLE_TAG_MANAGER_KEY'
    }
  },
  auth: {
    tenantId: {
      doc: 'Microsoft Entra ID tenant (directory) ID. Required in production',
      format: guidFormat,
      nullable: true,
      default: isProduction ? null : placeholderEntraId,
      env: 'ENTRA_TENANT_ID'
    },
    clientId: {
      doc: 'Application (client) ID of the Entra ID App Registration shared with the backend. Required in production',
      format: guidFormat,
      nullable: true,
      default: isProduction ? null : placeholderEntraId,
      env: 'ENTRA_CLIENT_ID'
    },
    apiScope: {
      doc: 'Name of the API scope the App Registration exposes for the backend, requested as api://<client ID>/<scope>',
      format: scopeNameFormat,
      default: 'access_as_user',
      env: 'ENTRA_API_SCOPE'
    },
    externalBaseUrl: {
      doc: 'Public address of this service, used to build the sign-in callback and signed-out addresses. Required in production',
      format: 'url',
      nullable: true,
      default: isProduction ? null : 'http://localhost:3000',
      env: 'APP_BASE_URL'
    },
    responseMode: {
      doc: 'How Entra ID returns the sign-in response: form_post (a form POST, used when deployed) or query (in the query string, used locally)',
      format: ['form_post', 'query'],
      default: isProduction ? 'form_post' : 'query',
      env: 'ENTRA_RESPONSE_MODE'
    },
    tokenProvider: {
      doc: 'Where the federated credential token comes from: web-identity (AWS STS web identity) or mock (local development only, refused in production)',
      format: ['web-identity', 'mock'],
      default: isProduction ? 'web-identity' : 'mock',
      env: 'ENTRA_TOKEN_PROVIDER'
    },
    federatedCredentialAudience: {
      doc: 'Audience of the AWS STS web identity token. Must match the audience on the federated credential in the App Registration',
      format: String,
      default: 'api://AzureADTokenExchange',
      env: 'ENTRA_FEDERATED_CREDENTIAL_AUDIENCE'
    },
    stateCookie: {
      isSecure: {
        doc: 'Only send the sign-in state cookie over HTTPS',
        format: Boolean,
        default: isProduction,
        env: 'ENTRA_STATE_COOKIE_SECURE'
      },
      isSameSite: {
        doc: 'SameSite setting of the sign-in state cookie. None lets the browser send it with the form Entra ID posts back from its own site',
        format: ['None', 'Lax'],
        default: isProduction ? 'None' : 'Lax',
        env: 'ENTRA_STATE_COOKIE_SAME_SITE'
      }
    },
    sessionCookieName: {
      doc: 'Name of the cookie that keeps a user signed in',
      format: String,
      default: `${encodeURIComponent('livestock-data-catalogue-ui')}_auth`
    }
  }
})

config.validate({ allowed: 'strict' })

/**
 * Lists what stops the sign-in and session settings being used in production.
 * Names the variables only, never their values.
 * @param {import('convict').Config<*>} appConfig - the validated config
 * @returns {string[]} problems, empty when the settings are safe
 */
function findProductionProblems(appConfig) {
  const authConfig = appConfig.get('auth')
  const problems = []
  const requiredVariables = {
    ENTRA_TENANT_ID: authConfig.tenantId,
    ENTRA_CLIENT_ID: authConfig.clientId,
    APP_BASE_URL: authConfig.externalBaseUrl,
    SESSION_COOKIE_PASSWORD: appConfig.get('session.cookie.password')
  }

  for (const [variable, value] of Object.entries(requiredVariables)) {
    if (!value) {
      problems.push(`${variable} is not set`)
    }
  }

  if (
    authConfig.externalBaseUrl &&
    !authConfig.externalBaseUrl.startsWith('https://')
  ) {
    problems.push('APP_BASE_URL must start with https://')
  }

  if (authConfig.tokenProvider === 'mock') {
    problems.push('ENTRA_TOKEN_PROVIDER must not be mock')
  }

  if (!appConfig.get('session.cookie.secure')) {
    problems.push('SESSION_COOKIE_SECURE must be true')
  }

  if (!authConfig.stateCookie.isSecure) {
    problems.push('ENTRA_STATE_COOKIE_SECURE must be true')
  }

  return problems
}

if (config.get('isProduction')) {
  const problems = findProductionProblems(config)
  if (problems.length > 0) {
    throw new Error(
      `Configuration is not valid for production: ${problems.join('; ')}`
    )
  }
}
