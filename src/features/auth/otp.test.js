import assert from 'node:assert/strict'
import test from 'node:test'
import { isValidOtpCode, normalizeOtpCode, OTP_CODE_LENGTH } from './otp.js'

test('email otp codes use the standard six-digit format and keep only numeric digits', () => {
  assert.equal(OTP_CODE_LENGTH, 6)
  assert.equal(normalizeOtpCode('ab12c34d56'), '123456')
  assert.equal(normalizeOtpCode('1234567'), '123456')
  assert.equal(isValidOtpCode('123456'), true)
  assert.equal(isValidOtpCode('12345'), false)
  assert.equal(isValidOtpCode('1234567'), false)
})
