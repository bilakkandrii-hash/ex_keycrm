(function () {
  function buildStatusMap(statuses) {
    const map = {};
    (statuses || []).forEach(status => {
      map[status.id] = { title: status.title, color: status.color, alias: status.alias };
    });
    return map;
  }

  const STATUS_ABBREVIATIONS = { 'замовлення в процесі організації': 'Заявка в процесі' };

  function shortStatusTitle(title) {
    const words = String(title || '')
      .split(/\s+/)
      .map(word => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
      .filter(Boolean);
    const abbreviation = STATUS_ABBREVIATIONS[words.join(' ').toLowerCase()];
    if (abbreviation) return abbreviation;
    const short = words.slice(0, 2);
    if (short.length > 1 && short[short.length - 1].length <= 2) short.pop();
    return short.join(' ');
  }

  function formatLeadRow(lead, statusMap) {
    const status = (statusMap || {})[lead.status_id] || null;
    return {
      id: lead.id,
      title: lead.title || `#${lead.id}`,
      contact: (lead.contact && lead.contact.full_name) || '',
      statusTitle: status ? shortStatusTitle(status.title) : '',
      statusFullTitle: status ? status.title : '',
      statusColor: status ? status.color : '#999',
      productsCount: lead.products_count || 0,
      updatedAt: lead.updated_at || ''
    };
  }

  function sortLeadsByRecent(leads) {
    return [...leads].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  }

  function pickPipelineId(leads) {
    const lead = (leads || []).find(item => item && item.pipeline_id);
    return lead ? lead.pipeline_id : null;
  }

  const exported = { buildStatusMap, shortStatusTitle, formatLeadRow, sortLeadsByRecent, pickPipelineId };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
  if (typeof module !== 'undefined') module.exports = exported;
})();
