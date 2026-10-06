(function () {
  const lib = typeof module !== 'undefined'
    ? Object.assign({}, require('./rate'), require('./lines'), require('./payload'))
    : globalThis.Ex42;
  const {
    normalizeAmount, normalizeRate, MAX_LINES, rateFieldName, findFieldByName, buildFieldValue, buildProduct
  } = lib;

  const NEW_LEAD_KEY = 'new';
  const CONTACT_DELAY_MS = 15 * 60 * 1000;
  const CREATE_FIELD_NAMES = {
    point: 'Точка',
    excludeMailing: 'Виключення розсилки',
    visitAt: 'Очікуваний час візиту',
    orderNote: 'Примітка до замовлення'
  };
  const RATE_FIELD_NAMES = Array.from({ length: MAX_LINES }, (_, index) => rateFieldName(index + 1));
  const USED_FIELD_NAMES = [...Object.values(CREATE_FIELD_NAMES), ...RATE_FIELD_NAMES];

  function isCreateButtonText(text) {
    return /^Зберегти (лід|заявку)$/.test(String(text).trim());
  }

  function pad(number) {
    return String(number).padStart(2, '0');
  }

  function formatLocalDateTime(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function defaultCommunicateAt(now) {
    return formatLocalDateTime(new Date(now.getTime() + CONTACT_DELAY_MS));
  }

  function parseLocalDateTime(text) {
    const trimmed = String(text || '').trim();
    if (trimmed === '') return { ok: true, value: null };
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) return { ok: false };
    const [year, month, day, hour, minute] = match.slice(1).map(Number);
    const date = new Date(year, month - 1, day, hour, minute);
    const same = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
      && date.getHours() === hour && date.getMinutes() === minute;
    return same ? { ok: true, value: date.toISOString() } : { ok: false };
  }

  function resolveCreateFields(fields) {
    const missing = USED_FIELD_NAMES.filter(name => !findFieldByName(fields, name));
    if (missing.length > 0) {
      return { ok: false, error: `У CRM немає полів: ${missing.join(', ')}. Створіть їх у Налаштування → Додатково → Користувацькі поля.` };
    }
    const unsupported = fields.filter(field => field.model === 'lead' && field.required === true && !USED_FIELD_NAMES.includes(field.name));
    if (unsupported.length > 0) {
      const names = unsupported.map(field => `"${field.name}"`).join(', ');
      return { ok: false, error: `У CRM обов'язкові поля, яких немає у формі: ${names}. Зніміть обов'язковість або створіть заявку у стандартному вікні.` };
    }
    const resolved = Object.fromEntries(
      Object.entries(CREATE_FIELD_NAMES).map(([key, name]) => [key, findFieldByName(fields, name)])
    );
    resolved.rates = RATE_FIELD_NAMES.map(name => findFieldByName(fields, name));
    return { ok: true, fields: resolved };
  }

  function parseContactResults(response) {
    const list = response && Array.isArray(response.data) ? response.data : [];
    return list
      .filter(item => item && Number.isInteger(item.id))
      .map(item => ({
        id: item.id,
        fullName: item.full_name || '',
        phone: item.phone || '',
        email: item.email || '',
        client: item
      }));
  }

  function managerName(profile) {
    return profile.full_name || profile.name || `Користувач #${profile.id}`;
  }

  function selectId(text) {
    return text === '' ? null : Number(text);
  }

  function validateCreateForm(raw, fields) {
    const errors = {};
    const pointId = selectId(raw.point);
    const excludeMailingId = selectId(raw.excludeMailing);
    const orderNote = raw.orderNote.trim();
    const visit = parseLocalDateTime(raw.visitAt);
    const contact = parseLocalDateTime(raw.communicateAt);
    if (fields.point.required && pointId === null) errors.point = 'Оберіть точку';
    if (!visit.ok) errors.visitAt = 'Некоректні дата й час';
    else if (fields.visitAt.required && visit.value === null) errors.visitAt = 'Вкажіть очікуваний час візиту';
    if (!contact.ok || contact.value === null) errors.communicateAt = 'Вкажіть час наступного контакту';
    if (fields.excludeMailing.required && excludeMailingId === null) errors.excludeMailing = 'Оберіть значення';
    if (fields.orderNote.required && orderNote === '') errors.orderNote = 'Заповніть примітку';
    if (raw.lines.length === 0) errors.lines = 'Додайте хоча б один рядок';
    if (raw.lines.length > MAX_LINES) errors.lines = `Не більше ${MAX_LINES} рядків`;
    const parsed = raw.lines.map(line => ({ amount: normalizeAmount(line.amount), rate: normalizeRate(line.rate) }));
    const lineErrors = parsed.map(item => ({ amount: item.amount.error, rate: item.rate.error }));
    const ok = Object.keys(errors).length === 0 && lineErrors.every(item => !item.amount && !item.rate);
    const value = ok ? {
      pointId,
      excludeMailingId,
      orderNote,
      visitAt: visit.value,
      communicateAt: contact.value,
      sourceId: selectId(raw.sourceId),
      managerComment: raw.managerNote.trim(),
      client: raw.client || null,
      contact: { full_name: raw.contact.fullName.trim(), email: raw.contact.email.trim(), phone: raw.contact.phone.trim() },
      lines: raw.lines.map((line, index) => ({
        currency: line.currency,
        operation: line.operation,
        amount: parsed[index].amount.value,
        rate: parsed[index].rate.value
      }))
    } : null;
    return { ok, errors, lineErrors, value };
  }

  function productsTotal(items) {
    const sum = items.reduce((total, item) => total + item.price * item.amount, 0);
    return Math.round(sum * 100) / 100;
  }

  function buildLeadBody({ status, pipelineId, managerId, value, items, fields }) {
    const fieldValues = [];
    if (value.pointId !== null) fieldValues.push(buildFieldValue(fields.point, value.pointId));
    if (value.excludeMailingId !== null) fieldValues.push(buildFieldValue(fields.excludeMailing, value.excludeMailingId));
    if (value.visitAt !== null) fieldValues.push(buildFieldValue(fields.visitAt, value.visitAt));
    if (value.orderNote !== '') fieldValues.push(buildFieldValue(fields.orderNote, value.orderNote));
    items.forEach((item, index) => fieldValues.push(buildFieldValue(fields.rates[index], item.rate)));
    return {
      id: null,
      status_id: status.id,
      pipeline_id: pipelineId,
      title: '',
      manager_id: managerId,
      manager_comment: value.managerComment,
      communicate_at: value.communicateAt,
      contact_id: null,
      contact: value.client
        ? { full_name: '', email: '', phone: '', client_id: value.client.id, client: value.client }
        : value.contact,
      utm_source: '',
      utm_medium: '',
      utm_campaign: '',
      utm_term: '',
      utm_content: '',
      custom_field_values: fieldValues,
      products: items.map(item => buildProduct(item.offer, item.price, item.amount)),
      attachments: [],
      payments: [],
      currency_code: 'UAH',
      is_finished: false,
      target_id: null,
      target_type: null,
      source_id: value.sourceId,
      payments_total: 0,
      products_total: productsTotal(items),
      status
    };
  }

  function matchProductOrder(items, products) {
    if (products.length !== items.length) return null;
    const used = new Set();
    const order = [];
    for (const product of products) {
      const index = items.findIndex((item, position) => !used.has(position)
        && item.offer.id === product.offer_id && item.amount === Number(product.quantity));
      if (index === -1) return null;
      used.add(index);
      order.push(index);
    }
    return order;
  }

  const exported = {
    NEW_LEAD_KEY, CREATE_FIELD_NAMES, isCreateButtonText, defaultCommunicateAt, parseLocalDateTime, resolveCreateFields, managerName,
    validateCreateForm, productsTotal, buildLeadBody, matchProductOrder, parseContactResults
  };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
  if (typeof module !== 'undefined') module.exports = exported;
})();
