import assert from 'node:assert/strict';
import test from 'node:test';
import { EXHIBIT_VERSION } from './version.js';

test('the exhibit version is a positive integer', () => {
  assert.equal(Number.isInteger(EXHIBIT_VERSION), true);
  assert.ok(EXHIBIT_VERSION >= 1);
});
