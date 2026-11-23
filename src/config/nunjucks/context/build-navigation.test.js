import { buildNavigation } from './build-navigation.js'

function mockRequest(options) {
  return { ...options }
}

describe('#buildNavigation', () => {
  test('Should provide expected navigation details', () => {
    expect(
      buildNavigation(mockRequest({ path: '/non-existent-path' }))
    ).toEqual([
      {
        current: false,
        text: 'Home',
        href: '/'
      },
      {
        current: false,
        text: 'About',
        href: '/about'
      }
    ])
  })

  test('Should add a Sign out link for a signed-in user', () => {
    expect(
      buildNavigation(
        mockRequest({ path: '/about', auth: { isAuthenticated: true } })
      )
    ).toEqual([
      {
        current: false,
        text: 'Home',
        href: '/'
      },
      {
        current: true,
        text: 'About',
        href: '/about'
      },
      {
        text: 'Sign out',
        href: '/auth/sign-out'
      }
    ])
  })

  test('Should not add a Sign out link for a user who is not signed in', () => {
    const navigation = buildNavigation(
      mockRequest({ path: '/', auth: { isAuthenticated: false } })
    )

    expect(navigation.map(({ text }) => text)).toEqual(['Home', 'About'])
  })

  test('Should provide expected highlighted navigation details', () => {
    expect(buildNavigation(mockRequest({ path: '/' }))).toEqual([
      {
        current: true,
        text: 'Home',
        href: '/'
      },
      {
        current: false,
        text: 'About',
        href: '/about'
      }
    ])
  })
})
