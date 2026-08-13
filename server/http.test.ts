import assert from 'node:assert/strict'
import test from 'node:test'
import http from './http.js'

test('HTTP server treats API trailing slashes canonically', async () => {
  for (const path of ['/api/v1', '/api/v1/']) {
    const response = await http.request(path)

    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  }
})
