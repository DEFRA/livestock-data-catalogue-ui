import { createServer } from '../../server.js'
import { config } from '#/config/config.js'
import { isLocalSignInEnabled } from './auth/local-sign-in.js'

async function startServer() {
  const server = await createServer()
  await server.start()

  server.logger.info('Server started successfully')
  if (isLocalSignInEnabled()) {
    server.logger.warn(
      'Local sign-in is on: every visitor is signed in as a fake developer, with no Entra ID. For local development only'
    )
  }
  server.logger.info(
    `Access your frontend on http://localhost:${config.get('port')}`
  )

  return server
}

export { startServer }
