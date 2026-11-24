import { vi } from 'vitest'

import hapi from '@hapi/hapi'
import { statusCodes } from '../constants/status-codes.js'

describe('#startServer', () => {
  let createServerSpy
  let hapiServerSpy
  let startServerImport
  let createServerImport
  let config

  beforeAll(async () => {
    vi.stubEnv('PORT', '3097')

    // Imported after the port is set, so the config reads it
    ;({ config } = await import('#/config/config.js'))
    createServerImport = await import('../../server.js')
    startServerImport = await import('./start-server.js')

    createServerSpy = vi.spyOn(createServerImport, 'createServer')
    hapiServerSpy = vi.spyOn(hapi, 'server')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  describe('When server starts', () => {
    let server

    afterAll(async () => {
      await server.stop({ timeout: 0 })
    })

    test('Should start up server as expected', async () => {
      server = await startServerImport.startServer()

      expect(createServerSpy).toHaveBeenCalled()
      expect(hapiServerSpy).toHaveBeenCalled()

      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/health'
      })

      expect(result).toEqual({ message: 'success' })
      expect(statusCode).toBe(statusCodes.ok)
    })
  })

  describe('When local sign-in is on', () => {
    afterEach(() => {
      config.set('auth.localSignIn', false)
      config.set('cdpEnvironment', null)
    })

    function fakeServer() {
      return {
        start: vi.fn(),
        logger: { info: vi.fn(), warn: vi.fn() }
      }
    }

    test('Should log one warning, with no user details', async () => {
      config.set('auth.localSignIn', true)
      config.set('cdpEnvironment', 'local')
      const server = fakeServer()
      createServerSpy.mockResolvedValue(server)

      await startServerImport.startServer()

      expect(server.logger.warn).toHaveBeenCalledTimes(1)
      expect(server.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Local sign-in is on')
      )
      expect(server.logger.warn.mock.calls[0][0]).not.toMatch(
        /Local Developer|example\.invalid|token/i
      )
    })

    test('Should not log the warning when it is off', async () => {
      const server = fakeServer()
      createServerSpy.mockResolvedValue(server)

      await startServerImport.startServer()

      expect(server.logger.warn).not.toHaveBeenCalled()
    })
  })

  describe('When server start fails', () => {
    test('Should log failed startup message', async () => {
      createServerSpy.mockRejectedValue(new Error('Server failed to start'))

      await expect(startServerImport.startServer()).rejects.toThrow(
        'Server failed to start'
      )
    })
  })
})
