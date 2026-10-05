(function () {
  const lib = typeof module !== 'undefined'
    ? Object.assign({}, require('./lib/rate'), require('./lib/lines'), require('./lib/payload'), require('./lib/create-lead'), require('./lib/rate-rows'), require('./lib/flags'), require('./lib/outcome-text'), require('./lib/status-change'))
    : globalThis.Ex42;
  const {
    roundPrice, buildSku, rateFieldName, MAX_LINES, CURRENCIES, buildFlagMap, toApiPath, isApiPath,
    buildProductsBody, buildFieldsBody, buildRateFieldsBody, findNewProductSlot, findOfferBySku, findFieldByName, hasFieldValue, hasSelectValue, hasManagerComment,
    resolveCreateFields, managerName, buildLeadBody, matchProductOrder, parseContactResults,
    findRateFields, isRateLocked, buildRateRows, buildTextChoice, buildSelectChoice, buildManagerNoteChoice, sameProducts, changedRows, buildRatesPut, CREATE_FIELD_NAMES, PIPELINE_ERROR, buildStatusBody, leadStatusId, hasLeadStatus
  } = lib;

  const RATE_FIELD_NAMES = Array.from({ length: MAX_LINES }, (_, index) => rateFieldName(index + 1));
  const POLL_ATTEMPTS = 10;
  const POLL_INTERVAL_MS = 1000;
  const FLAG_PAGES = 3;
  const FLAG_PATH = '/catalog/products?with=offers&per_page=50';

  const STEPS = {
    readLead: 'Читання заявки',
    checkLead: 'Перевірка заявки',
    checkLimit: 'Перевірка кількості рядків',
    findOffer: 'Пошук товару за SKU',
    addProduct: 'Додавання товарного рядка',
    rereadLead: 'Повторне читання заявки',
    findSlot: 'Визначення номера рядка',
    findField: 'Пошук поля курсу',
    writeRate: 'Запис курсу',
    verifyRate: 'Перевірка запису курсу',
    verifyPoint: 'Перевірка запису точки',
    verifyExcludeMailing: 'Перевірка запису виключення розсилки',
    verifyNote: 'Перевірка запису примітки',
    verifyManagerNote: 'Перевірка запису замітки',
    readProfile: 'Читання профілю',
    readSources: 'Читання джерел',
    readStatuses: 'Читання статусів',
    createLead: 'Створення заявки',
    matchLines: 'Звірка товарних рядків',
    checkStatus: 'Перевірка статусу',
    readCatalog: 'Читання каталогу',
    searchContacts: 'Пошук клієнта',
    writeStatus: 'Зміна статусу'
  };

  class StepError extends Error {
    constructor(step, status, detail) {
      super([step, status ? `HTTP ${status}` : null, detail].filter(Boolean).join(': '));
      this.name = 'StepError';
      this.step = step;
      this.status = status || null;
      this.lineAdded = false;
      this.createdId = null;
    }
  }

  function createClient({ fetchFn, getToken, getPipelineId, tenant, sleep }) {
    const baseUrl = `https://${tenant}.api.keycrm.app`;

    function buildHeaders(hasBody) {
      const token = getToken();
      if (!token) throw new StepError('Авторизація', null, 'немає токена сесії');
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', UserLocale: 'uk' };
      if (hasBody) headers['Content-Type'] = 'application/json';
      return headers;
    }

    async function serverMessage(response) {
      const payload = await response.json().catch(() => null);
      return payload && typeof payload.message === 'string' ? payload.message : undefined;
    }

    async function call(step, method, path, body, detailed = false) {
      if (!isApiPath(path)) throw new StepError(step, null, 'некоректний шлях запиту');
      const hasBody = body !== undefined;
      const options = { method, headers: buildHeaders(hasBody) };
      if (hasBody) options.body = JSON.stringify(body);
      let response;
      try {
        response = await fetchFn(`${baseUrl}${path}`, options);
      } catch (error) {
        throw new StepError(step, null, error.message);
      }
      if (!response.ok) throw new StepError(step, response.status, detailed ? await serverMessage(response) : undefined);
      return response;
    }

    async function getJson(step, path, detailed = false) {
      const response = await call(step, 'GET', path, undefined, detailed);
      try {
        return await response.json();
      } catch (error) {
        throw new StepError(step, null, error.message);
      }
    }

    async function waitForLead(leadPath, expected, step, matches) {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        await sleep(POLL_INTERVAL_MS);
        const lead = await getJson(step, leadPath);
        if (matches(lead)) return;
      }
      throw new StepError(step, null, `значення ${expected} не з'явилося в заявці за ${POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000} с`);
    }

    function waitForRate(leadPath, fieldId, rate, step, matches = hasFieldValue) {
      return waitForLead(leadPath, rate, step, lead => matches(lead, fieldId, rate));
    }

    async function recordRate({ leadId, leadPath, previousIds, fields, rate }, begin) {
      const after = await getJson(begin(STEPS.rereadLead), leadPath);
      const slot = findNewProductSlot(previousIds, after.products);
      if (!slot) throw new StepError(STEPS.findSlot, null, 'не вдалося визначити доданий товарний рядок');
      const field = findFieldByName(fields, rateFieldName(slot));
      await call(begin(STEPS.writeRate), 'PUT', leadPath, buildRateFieldsBody(leadId, field, rate));
      await waitForRate(leadPath, field.id, rate, begin(STEPS.verifyRate));
      return slot;
    }

    async function addProduct(leadId, leadPath, offer, price, amount, step) {
      try {
        await call(step, 'POST', `${leadPath}/products`, buildProductsBody(leadId, offer, price, amount));
      } catch (error) {
        error.lineAdded = error.status === null;
        throw error;
      }
    }

    function reporter(report) {
      return step => {
        report(step);
        return step;
      };
    }

    async function saveLine({ leadId, currency, operation, amount, rate }, report) {
      const begin = reporter(report);
      const sku = buildSku(currency, operation);
      const price = roundPrice(rate);
      const leadPath = `/leads/${leadId}`;

      const before = await getJson(begin(STEPS.readLead), leadPath);
      const count = before.products.length;
      if (count >= MAX_LINES) {
        throw new StepError(STEPS.checkLimit, null, `у заявці вже ${count} з ${MAX_LINES} можливих товарних рядків`);
      }
      const previousIds = new Set(before.products.map(product => product.id));

      const fields = await getJson(begin(STEPS.findField), '/config/custom-fields');
      const missing = RATE_FIELD_NAMES.filter(name => !findFieldByName(fields, name));
      if (missing.length > 0) {
        throw new StepError(STEPS.findField, null, `У CRM немає полів: ${missing.join(', ')}. Створіть їх у Налаштування → Додатково → Користувацькі поля.`);
      }

      const query = `/catalog/products?query=${encodeURIComponent(sku)}&with=offers&per_page=50`;
      const search = await getJson(begin(STEPS.findOffer), query);
      const offer = findOfferBySku(search.data, sku);
      if (!offer) throw new StepError(STEPS.findOffer, null, `у каталозі немає товару з SKU ${sku}`);

      await addProduct(leadId, leadPath, offer, price, amount, begin(STEPS.addProduct));

      try {
        const slot = await recordRate({ leadId, leadPath, previousIds, fields, rate }, begin);
        return { slot, rate, price };
      } catch (error) {
        error.lineAdded = true;
        throw error;
      }
    }

    async function readCreateContext(begin) {
      const rawFields = await getJson(begin(STEPS.findField), '/config/custom-fields');
      const resolved = resolveCreateFields(rawFields);
      if (!resolved.ok) throw new StepError(STEPS.findField, null, resolved.error);
      const profile = await getJson(begin(STEPS.readProfile), '/auth/profile');
      return { fields: resolved.fields, manager: { id: profile.id, name: managerName(profile) } };
    }

    async function loadCreateContext() {
      const begin = reporter(() => {});
      const context = await readCreateContext(begin);
      const sources = await getJson(begin(STEPS.readSources), '/sources');
      return { ...context, sources };
    }

    async function readNewStatus(begin) {
      const pipelineId = getPipelineId();
      if (!pipelineId) throw new StepError(STEPS.readStatuses, null, PIPELINE_ERROR);
      const statuses = await getJson(begin(STEPS.readStatuses), `/leads/statuses/${pipelineId}`);
      const status = statuses.find(item => item.alias === 'new');
      if (!status) throw new StepError(STEPS.readStatuses, null, 'у воронці немає статусу "Новий"');
      return { status, pipelineId: Number(pipelineId) };
    }

    async function buildItem(line, begin) {
      const sku = buildSku(line.currency, line.operation);
      const query = `/catalog/products?query=${encodeURIComponent(sku)}&with=offers&per_page=50`;
      const search = await getJson(begin(STEPS.findOffer), query);
      const offer = findOfferBySku(search.data, sku);
      if (!offer) throw new StepError(STEPS.findOffer, null, `у каталозі немає товару з SKU ${sku}`);
      return { ...line, offer, price: roundPrice(line.rate) };
    }

    async function postLead(body, step) {
      let response;
      try {
        response = await call(step, 'POST', '/leads', body, true);
      } catch (error) {
        error.lineAdded = error.status === null || error.status >= 502;
        throw error;
      }
      const created = await response.json().catch(() => null);
      if (!created || !created.id) {
        const error = new StepError(step, null, 'сервер не повернув номер заявки');
        error.lineAdded = true;
        throw error;
      }
      return created;
    }

    async function remapRates({ leadId, lead, items, fields }, begin) {
      const order = matchProductOrder(items, lead.products);
      if (!order) throw new StepError(STEPS.matchLines, null, 'не вдалося зіставити товарні рядки створеної заявки');
      const moved = order
        .map((itemIndex, slot) => ({ field: fields.rates[slot], value: items[itemIndex].rate, moved: itemIndex !== slot }))
        .filter(entry => entry.moved);
      if (moved.length === 0) return;
      const leadPath = `/leads/${leadId}`;
      await call(begin(STEPS.writeRate), 'PUT', leadPath, buildFieldsBody(leadId, moved));
      for (const entry of moved) {
        await waitForRate(leadPath, entry.field.id, entry.value, begin(STEPS.verifyRate));
      }
    }

    async function createLead({ value }, report) {
      const begin = reporter(report);
      const { fields, manager } = await readCreateContext(begin);
      const { status, pipelineId } = await readNewStatus(begin);
      const items = [];
      for (const line of value.lines) {
        items.push(await buildItem(line, begin));
      }
      const body = buildLeadBody({ status, pipelineId, managerId: manager.id, value, items, fields });
      const created = await postLead(body, begin(STEPS.createLead));
      try {
        const lead = await getJson(begin(STEPS.rereadLead), `/leads/${created.id}`);
        await remapRates({ leadId: created.id, lead, items, fields }, begin);
        return { id: created.id, title: lead.title || created.title || `#${created.id}` };
      } catch (error) {
        error.lineAdded = true;
        error.createdId = created.id;
        throw error;
      }
    }

    function requireRateRows(lead, fieldsList) {
      const resolved = findRateFields(fieldsList);
      if (!resolved.ok) throw new StepError(STEPS.findField, null, resolved.error);
      const built = buildRateRows(lead, resolved.fields);
      if (!built.ok) throw new StepError(STEPS.checkLimit, null, built.error);
      return { rateFields: resolved.fields, built };
    }

    async function loadRateRows({ leadId }) {
      const lead = await getJson(STEPS.readLead, `/leads/${leadId}`, true);
      const fieldsList = await getJson(STEPS.findField, '/config/custom-fields', true);
      const { built } = requireRateRows(lead, fieldsList);
      const point = buildSelectChoice(lead, findFieldByName(fieldsList, CREATE_FIELD_NAMES.point));
      const excludeMailing = buildSelectChoice(lead, findFieldByName(fieldsList, CREATE_FIELD_NAMES.excludeMailing));
      const orderNote = buildTextChoice(lead, findFieldByName(fieldsList, CREATE_FIELD_NAMES.orderNote));
      return { rows: built.rows, locked: built.locked, statusTitle: built.statusTitle, statusId: leadStatusId(lead), point, excludeMailing, orderNote, managerNote: buildManagerNoteChoice(lead) };
    }

    function resolveSelect(lead, field, optionId) {
      if (optionId === null || !buildSelectChoice(lead, field)) return null;
      const option = field.options.find(item => item.id === optionId);
      if (!option) throw new StepError(STEPS.findField, null, `Обране значення відсутнє в списку поля «${field.name}»`);
      return { field, option };
    }

    function resolveText(lead, field, text) {
      if (text === '' || !buildTextChoice(lead, field)) return null;
      return { field, value: text };
    }

    function resolveManagerNote(lead, text) {
      return text !== '' && buildManagerNoteChoice(lead) ? text : '';
    }

    async function saveRates({ leadId, productIds, values, pointId = null, excludeMailingId = null, orderNote = '', managerComment = '' }, report) {
      const begin = reporter(report);
      const leadPath = `/leads/${leadId}`;
      const lead = await getJson(begin(STEPS.readLead), leadPath, true);
      if (isRateLocked(lead)) {
        throw new StepError(STEPS.checkStatus, null, `Заявка в статусі «${lead.status.title}»: курс не змінюється`);
      }
      const fieldsList = await getJson(begin(STEPS.findField), '/config/custom-fields', true);
      const { rateFields, built } = requireRateRows(lead, fieldsList);
      if (!sameProducts(built.rows, productIds) || values.length !== built.rows.length) {
        throw new StepError(STEPS.checkLead, null, 'Склад рядків заявки змінився. Закрийте картку й відкрийте її знову.');
      }
      const changed = changedRows(built.rows, values);
      const pointField = findFieldByName(fieldsList, CREATE_FIELD_NAMES.point);
      const point = resolveSelect(lead, pointField, pointId);
      const excludeMailing = resolveSelect(lead, findFieldByName(fieldsList, CREATE_FIELD_NAMES.excludeMailing), excludeMailingId);
      const note = resolveText(lead, findFieldByName(fieldsList, CREATE_FIELD_NAMES.orderNote), orderNote);
      const managerNote = resolveManagerNote(lead, managerComment);
      if (changed.length === 0 && !point && !excludeMailing && !note && !managerNote) return { changed: [] };
      const extras = [
        point && { field: point.field, value: point.option.id },
        excludeMailing && { field: excludeMailing.field, value: excludeMailing.option.id },
        note && { field: note.field, value: note.value }
      ].filter(Boolean);
      await call(begin(STEPS.writeRate), 'PUT', leadPath, buildRatesPut(leadId, changed, rateFields, extras, managerNote), true);
      for (const item of changed) {
        await waitForRate(leadPath, rateFields[item.slot - 1].id, item.value, begin(STEPS.verifyRate));
      }
      if (point) {
        await waitForRate(leadPath, point.field.id, point.option.id, begin(STEPS.verifyPoint), (stored, fieldId) => hasSelectValue(stored, fieldId, point.option));
      }
      if (excludeMailing) {
        await waitForRate(leadPath, excludeMailing.field.id, excludeMailing.option.id, begin(STEPS.verifyExcludeMailing), (stored, fieldId) => hasSelectValue(stored, fieldId, excludeMailing.option));
      }
      if (note) {
        await waitForRate(leadPath, note.field.id, note.value, begin(STEPS.verifyNote));
      }
      if (managerNote) {
        await waitForLead(leadPath, managerNote, begin(STEPS.verifyManagerNote), stored => hasManagerComment(stored, managerNote));
      }
      return {
        changed: changed.map(item => ({ slot: item.slot, value: item.value })),
        ...(point && { point: point.option.value }),
        ...(excludeMailing && { excludeMailing: excludeMailing.option.value }),
        ...(note && { orderNote: note.value }),
        ...(managerNote && { managerComment: managerNote })
      };
    }

    async function searchContacts(query) {
      const trimmed = query.trim();
      if (trimmed === '') return [];
      const path = `/clients/search?query=${encodeURIComponent(trimmed)}&per_page=20`;
      const response = await getJson(STEPS.searchContacts, path, true);
      return parseContactResults(response);
    }

    async function changeStatus({ leadId, statusId }, report) {
      const begin = reporter(report);
      const leadPath = `/leads/${leadId}`;
      await call(begin(STEPS.writeStatus), 'PUT', leadPath, buildStatusBody(leadId, statusId), true);
      await waitForLead(leadPath, statusId, begin(STEPS.checkStatus), lead => hasLeadStatus(lead, statusId));
      return { statusId };
    }

    let flagMap = null;

    async function loadCurrencyFlags() {
      if (flagMap) return flagMap;
      const items = [];
      let map = {};
      let path = FLAG_PATH;
      for (let page = 0; page < FLAG_PAGES && path; page += 1) {
        const response = await getJson(STEPS.readCatalog, path);
        items.push(...response.data);
        map = buildFlagMap(items);
        const complete = Object.keys(map).length === CURRENCIES.length;
        path = complete || !response.next_page_url ? null : toApiPath(response.next_page_url, baseUrl);
      }
      flagMap = map;
      return map;
    }

    return { saveLine, loadCreateContext, createLead, loadRateRows, saveRates, loadCurrencyFlags, searchContacts, changeStatus };
  }

  const exported = { createClient, StepError };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
  if (typeof module !== 'undefined') module.exports = exported;
})();
