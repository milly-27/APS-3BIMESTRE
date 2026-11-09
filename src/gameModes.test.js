import test from 'node:test'
import assert from 'node:assert/strict'

import { gameModeOptions } from './gameModes.js'

test('game modes should be distinct and not share the same route', () => {
  assert.equal(gameModeOptions.length, 2)
  const routes = gameModeOptions.map((mode) => mode.to)
  assert.deepEqual(new Set(routes).size, routes.length)
})
