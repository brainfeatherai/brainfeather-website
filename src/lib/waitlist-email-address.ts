export function normalizeWaitlistEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return normalized;

  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.split('+', 1)[0];
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}
