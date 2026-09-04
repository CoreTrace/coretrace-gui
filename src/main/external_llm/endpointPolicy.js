/**
 * @fileoverview Endpoint policy for external LLM providers.
 *
 * A provider endpoint is user-configurable and receives the user's API key in
 * an Authorization header. To keep that key from travelling in clear text (or
 * being pointed at an internal service), a keyed request may only go to an
 * https: URL, or to plain http: on the local machine.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * @param {string} endpoint - Full URL the provider will call
 * @param {boolean} carriesSecret - Whether an API key is attached to the request
 * @returns {{ valid: boolean, error?: string }}
 */
function validateEndpoint(endpoint, carriesSecret) {
  let url;
  try {
    url = new URL(String(endpoint || ''));
  } catch (_) {
    return { valid: false, error: 'Provider endpoint is not a valid URL' };
  }

  if (url.protocol === 'https:') return { valid: true };

  if (url.protocol === 'http:') {
    if (!carriesSecret || LOOPBACK_HOSTS.has(url.hostname)) return { valid: true };
    return { valid: false, error: 'API keys are only sent over https (or http on localhost)' };
  }

  return { valid: false, error: `Unsupported endpoint protocol: ${url.protocol}` };
}

module.exports = { validateEndpoint };
