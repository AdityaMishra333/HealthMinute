// Normalizes a stored phone number to strict E.164 for Twilio. Only ever
// reconstructs India-specific shapes (bare 10-digit mobile, 0-prefixed,
// 91-prefixed) — a number that already starts with "+" is trusted as-is
// (so non-Indian numbers already in E.164 aren't mangled) as long as it has
// a plausible digit count. Returns null rather than guessing when the input
// can't be confidently normalized: sending Twilio a malformed number costs
// a real API call and a 21211 error we can't specifically warn about.
function normalizePhoneE164(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    const rest = trimmed.slice(1).replace(/\D/g, '');
    return /^\d{10,15}$/.test(rest) ? `+${rest}` : null;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

module.exports = { normalizePhoneE164 };
