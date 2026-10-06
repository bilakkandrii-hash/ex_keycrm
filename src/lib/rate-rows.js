(function () {
  const lib = typeof module !== 'undefined'
    ? Object.assign({}, require('./rate'), require('./lines'), require('./payload'), require('./flags'), require('./create-lead'))
    : globalThis.Ex42;
  const { normalizeRate, MAX_LINES, rateFieldName, findFieldByName, buildFieldsBody, linePicture, CREATE_FIELD_NAMES } = lib;

  const RATE_LOCKED_STATUS_ALIASES = ['zamovlennya_gotove_cekajemo_klijenta'];
  const RATE_FIELD_NAMES = Array.from({ length: MAX_LINES }, (_, index) => rateFieldName(index + 1));

  function findRateFields(fields) {
    const missing = RATE_FIELD_NAMES.filter(name => !findFieldByName(fields, name));
    if (missing.length > 0) {
      return { ok: false, error: `У CRM немає полів: ${missing.join(', ')}. Створіть їх у Налаштування → Додатково → Користувацькі поля.` };
    }
    return { ok: true, fields: RATE_FIELD_NAMES.map(name => findFieldByName(fields, name)) };
  }

  function isRateLocked(lead) {
    return Boolean(lead.status) && RATE_LOCKED_STATUS_ALIASES.includes(lead.status.alias);
  }

  function storedValue(lead, field) {
    const item = (lead.custom_field_values || []).find(entry => entry.field_id === field.id);
    const parts = item ? [].concat(item.value).filter(part => part !== null && part !== undefined && part !== '') : [];
    return parts.length === 0 ? null : parts.join(',');
  }

  function paddedPrice(price) {
    const parsed = normalizeRate(String(price));
    return parsed.ok ? parsed.value : '';
  }

  function buildRateRows(lead, rateFields) {
    const count = lead.products.length;
    if (count > MAX_LINES) {
      return { ok: false, error: `Курс можна вказати не більше ніж для ${MAX_LINES} рядків; у заявці їх ${count}` };
    }
    const rows = lead.products.map((product, index) => {
      const stored = storedValue(lead, rateFields[index]);
      const storedRate = stored === null ? null : normalizeRate(stored);
      return {
        slot: index + 1,
        productId: product.id,
        label: product.offer && product.offer.sku ? product.offer.sku : product.name,
        quantity: product.quantity,
        price: product.price,
        picture: linePicture(product),
        stored,
        prefill: storedRate && storedRate.ok ? storedRate.value : paddedPrice(product.price)
      };
    });
    return { ok: true, rows, locked: isRateLocked(lead), statusTitle: lead.status ? lead.status.title : '' };
  }

  function buildTextChoice(lead, field) {
    if (!field || storedValue(lead, field) !== null) return null;
    return { required: field.required === true };
  }

  function buildSelectChoice(lead, field) {
    const choice = buildTextChoice(lead, field);
    return choice && { ...choice, options: (field.options || []).map(option => [String(option.id), option.value]) };
  }

  function buildManagerNoteChoice(lead) {
    return typeof lead.manager_comment === 'string' && lead.manager_comment.trim() !== '' ? null : { required: false };
  }

  function validateExtraInputs({ excludeMailing, orderNote }, raw) {
    const errors = {};
    if (excludeMailing && excludeMailing.required && raw.excludeMailing === '') errors.excludeMailing = 'Оберіть значення';
    if (orderNote && orderNote.required && raw.orderNote.trim() === '') errors.orderNote = 'Заповніть примітку';
    return errors;
  }

  function validateRateInputs(rows, rawValues) {
    const parsed = rows.map((row, index) => normalizeRate(rawValues[index]));
    return { ok: parsed.every(item => item.ok), errors: parsed.map(item => item.error), values: parsed.map(item => item.value) };
  }

  function sameProducts(rows, productIds) {
    return rows.length === productIds.length && rows.every((row, index) => row.productId === productIds[index]);
  }

  function changedRows(rows, values) {
    return rows
      .map((row, index) => ({ slot: row.slot, value: values[index], stored: row.stored }))
      .filter(item => item.value !== item.stored);
  }

  function buildRatesPut(leadId, changed, rateFields, extras = [], managerComment = '') {
    const entries = changed.map(item => ({ field: rateFields[item.slot - 1], value: item.value }));
    const fields = [...entries, ...extras];
    if (managerComment === '') return buildFieldsBody(leadId, fields);
    return { id: leadId, ...(fields.length > 0 && buildFieldsBody(leadId, fields)), manager_comment: managerComment };
  }

  const exported = {
    RATE_LOCKED_STATUS_ALIASES, findRateFields, isRateLocked, buildRateRows, buildTextChoice, buildSelectChoice, buildManagerNoteChoice, validateExtraInputs, validateRateInputs, sameProducts, changedRows, buildRatesPut
  };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
  if (typeof module !== 'undefined') module.exports = exported;
})();
