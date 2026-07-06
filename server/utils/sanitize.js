const MAX_SERVER_NAME_LENGTH = 32;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

function sanitizeServerName(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'must_be_string' };
  const trimmed = raw.replace(CONTROL_CHARS, '').trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length > MAX_SERVER_NAME_LENGTH) return { ok: false, reason: 'too_long' };
  return { ok: true, value: trimmed };
}

module.exports = { sanitizeServerName, MAX_SERVER_NAME_LENGTH };
