(function () {
  const lib = typeof module !== 'undefined' ? require('./lib/session') : globalThis.Ex42;
  const { buildLoginBody, parseLoginResponse, isValidTenant, serializeSession, deserializeSession } = lib;

  async function login({ fetchFn, tenant, username, password }) {
    if (!isValidTenant(tenant)) {
      return { ok: false, error: 'Тенант може містити лише латинські літери, цифри й дефіс' };
    }
    const baseUrl = `https://${tenant}.api.keycrm.app`;
    let response;
    try {
      response = await fetchFn(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildLoginBody(username, password))
      });
    } catch (error) {
      return { ok: false, error: `Мережа: ${error.message}` };
    }
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const message = json && typeof json.message === 'string' && json.message !== '' ? json.message : `HTTP ${response.status}`;
      return { ok: false, error: `Не вдалося увійти: ${message}` };
    }
    const parsed = parseLoginResponse(json, Date.now());
    return parsed.ok ? { ok: true, session: parsed.session } : { ok: false, error: parsed.error };
  }

  const STORAGE_PREFIX = 'ex42_mobile_session_';

  function sessionKey(tenant) {
    return `${STORAGE_PREFIX}${tenant}`;
  }

  function saveSession(tenant, session) {
    localStorage.setItem(sessionKey(tenant), serializeSession(session));
  }

  function loadSession(tenant) {
    return deserializeSession(localStorage.getItem(sessionKey(tenant)));
  }

  function clearSession(tenant) {
    localStorage.removeItem(sessionKey(tenant));
  }

  const exported = { login, saveSession, loadSession, clearSession };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
  if (typeof module !== 'undefined') module.exports = exported;
})();
