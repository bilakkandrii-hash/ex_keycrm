(function () {
  function buildLoginBody(username, password) {
    return { username, password };
  }

  function parseLoginResponse(json, now) {
    const accessToken = json && json.access_token;
    const expiresIn = json && json.expires_in;
    if (typeof accessToken !== 'string' || accessToken === '' || typeof expiresIn !== 'number') {
      return { ok: false, error: 'Сервер не повернув токен доступу' };
    }
    return { ok: true, session: { accessToken, expiresAt: now + expiresIn * 1000 } };
  }

  function isSessionValid(session, now) {
    return Boolean(session) && typeof session.accessToken === 'string' && session.accessToken !== ''
      && typeof session.expiresAt === 'number' && now < session.expiresAt;
  }

  function isValidTenant(tenant) {
    return typeof tenant === 'string' && /^[a-z0-9-]+$/.test(tenant);
  }

  function serializeSession(session) {
    return JSON.stringify(session);
  }

  function deserializeSession(text) {
    if (typeof text !== 'string' || text === '') return null;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  const exported = { buildLoginBody, parseLoginResponse, isSessionValid, isValidTenant, serializeSession, deserializeSession };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
  if (typeof module !== 'undefined') module.exports = exported;
})();
