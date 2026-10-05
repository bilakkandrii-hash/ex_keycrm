(function () {
  const { isRateLocked } = typeof module !== 'undefined' ? require('./rate-rows') : globalThis.Ex42;

  const ALLOWED_STATUS_TITLES = [
    'новий',
    'потребує підтвердження менеджером',
    'замовлення в процесі організації',
    'замовлення готове чекаємо клієнта',
    'клієнт запізнюється'
  ];

  const REJECT_STATUS_TITLES = [
    'не домовились',
    'відмова клієнта',
    'не влаштував курс',
    'не влаштував час',
    'цікавився на потім',
    'хибний дзвінок'
  ];

  function normalizeTitle(title) {
    return String(title || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  }

  function selectableStatuses(statuses, currentId) {
    const allowed = statuses.filter(status => ALLOWED_STATUS_TITLES.includes(normalizeTitle(status.title)));
    if (allowed.length === 0) return statuses;
    return statuses.filter(status => allowed.includes(status) || status.id === currentId);
  }

  function rejectStatuses(statuses) {
    return statuses.filter(status => REJECT_STATUS_TITLES.includes(normalizeTitle(status.title)));
  }

  function rejectConfirmText(title) {
    return `Відхилити заявку з причиною «${title}»? Зміна статусу може запустити автоматичні повідомлення клієнту.`;
  }

  function buildStatusBody(leadId, statusId) {
    return { id: leadId, status_id: statusId };
  }

  function leadStatusId(lead) {
    return lead.status_id !== undefined ? lead.status_id : lead.status && lead.status.id;
  }

  function hasLeadStatus(lead, statusId) {
    return leadStatusId(lead) === statusId;
  }

  function lockChanged(fromStatus, toStatus) {
    return isRateLocked({ status: fromStatus }) !== isRateLocked({ status: toStatus });
  }

  function statusConfirmText(title) {
    return `Змінити статус на «${title}»? Зміна статусу може запустити автоматичні повідомлення клієнту.`;
  }

  function statusChangedText(title) {
    return `Статус змінено на «${title}»`;
  }

  const exported = { selectableStatuses, rejectStatuses, rejectConfirmText, buildStatusBody, leadStatusId, hasLeadStatus, lockChanged, statusConfirmText, statusChangedText };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
  if (typeof module !== 'undefined') module.exports = exported;
})();
