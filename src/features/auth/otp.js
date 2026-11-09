export const OTP_CODE_LENGTH = 6

export function normalizeOtpCode(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, OTP_CODE_LENGTH)
}

export function isValidOtpCode(value) {
  return String(value ?? '').replace(/\D/g, '').length === OTP_CODE_LENGTH
}
