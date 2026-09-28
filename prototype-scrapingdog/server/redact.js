// Keep the ScrapingDog key out of logs, audit rows and recorded fixtures.
export function stripApiKey(url) {
  const parsed = new URL(url);
  parsed.searchParams.delete('api_key');
  return parsed.toString();
}

export function redactSecret(text, secret) {
  if (!secret) return String(text);
  return String(text).split(secret).join('[REDACTED]');
}
