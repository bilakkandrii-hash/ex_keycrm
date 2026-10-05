(function () {
  async function apiGet({ fetchFn, token, tenant, path }) {
    const baseUrl = `https://${tenant}.api.keycrm.app`;
    let response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', UserLocale: 'uk' }
      });
    } catch (error) {
      throw new Error(`Мережа: ${error.message}`);
    }
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      const message = json && typeof json.message === 'string' && json.message !== '' ? json.message : `HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function listLeads({ fetchFn, token, tenant, page, perPage }) {
    return apiGet({ fetchFn, token, tenant, path: `/leads?page=${page}&per_page=${perPage}` });
  }

  function listStatuses({ fetchFn, token, tenant, pipelineId }) {
    return apiGet({ fetchFn, token, tenant, path: `/leads/statuses/${pipelineId}` });
  }

  const exported = { listLeads, listStatuses };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
  if (typeof module !== 'undefined') module.exports = exported;
})();
