import { authPaths } from '#/server/common/constants/auth-paths.js'

export function buildNavigation(request) {
  const navigation = [
    {
      text: 'Home',
      href: '/',
      current: request?.path === '/'
    },
    {
      text: 'About',
      href: '/about',
      current: request?.path === '/about'
    }
  ]

  if (request?.auth?.isAuthenticated) {
    navigation.push({
      text: 'Sign out',
      href: authPaths.signOut
    })
  }

  return navigation
}
