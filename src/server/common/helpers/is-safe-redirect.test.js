import { describe, test, expect } from 'vitest'
import { isSafeRedirect } from './is-safe-redirect.js'

describe('isSafeRedirect', () => {
  test('returns true for a relative path', () => {
    expect(isSafeRedirect('/')).toBe(true)
  })

  test('returns true for a deeper relative path', () => {
    expect(isSafeRedirect('/search?q=test')).toBe(true)
  })

  test('returns false for an absolute URL', () => {
    expect(isSafeRedirect('https://evil.example.com')).toBe(false)
  })

  test('returns false for a protocol-relative URL', () => {
    expect(isSafeRedirect('//evil.example.com')).toBe(false)
  })

  test('returns false for a backslash URL that browsers treat as another site', () => {
    expect(isSafeRedirect('/\\evil.example.com')).toBe(false)
  })

  test('returns false for a URL that hides another site behind a tab', () => {
    expect(isSafeRedirect('/\t/evil.example.com')).toBe(false)
  })

  test('returns false for a path containing a line break', () => {
    expect(isSafeRedirect('/search\r\nSet-Cookie: x=y')).toBe(false)
  })

  test('returns false for a path a browser cannot read', () => {
    expect(isSafeRedirect('/\\[')).toBe(false)
  })

  test('returns false for null', () => {
    expect(isSafeRedirect(null)).toBe(false)
  })

  test('returns false for undefined', () => {
    expect(isSafeRedirect(undefined)).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(isSafeRedirect('')).toBe(false)
  })

  test('returns false for non-string', () => {
    expect(isSafeRedirect(123)).toBe(false)
  })
})
