import { isAssetPath } from './return-path.js'

describe('#isAssetPath', () => {
  test.each([
    ['/public', '/public'],
    ['/public/', '/public'],
    ['/public/assets/app.css', '/public'],
    ['/public/assets/app.css?v=1', '/public'],
    ['/%70ublic/assets/app.css', '/public'],
    ['/Public/assets/app.css', '/public'],
    ['/PUBLIC/x', '/Public'],
    ['/static/app.css', '/static/'],
    ['/static/app.css', '/static//']
  ])('says %s is an asset path when ASSET_PATH is %s', (path, assetPath) => {
    expect(isAssetPath(path, assetPath)).toBe(true)
  })

  test.each([
    ['/', '/public'],
    ['/about', '/public'],
    ['/public-page', '/public'],
    ['/publicity/x', '/public'],
    ['/public/x', '/static'],
    ['/about?next=/public/x', '/public']
  ])(
    'says %s is not an asset path when ASSET_PATH is %s',
    (path, assetPath) => {
      expect(isAssetPath(path, assetPath)).toBe(false)
    }
  )

  test('fails closed, treating malformed encoding as an asset path', () => {
    expect(isAssetPath('/%E0%A4%A', '/public')).toBe(true)
  })
})
