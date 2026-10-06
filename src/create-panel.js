(function () {
  const {
    el, labeled, buildActions, CURRENCIES, OPERATIONS, MAX_LINES,
    normalizeAmount, normalizeRate, roundPrice, productsTotal, defaultCommunicateAt, validateCreateForm
  } = globalThis.Ex42;

  const CREATE_STYLE = `
    .create-form { display: flex; flex-direction: column; gap: 14px; }
    .create-form input, .create-form select, .create-form textarea { padding: 14px; font-size: 16px; width: 100%; }
    .create-form textarea { font-family: inherit; resize: vertical; }
    .create-form .row { display: flex; flex-wrap: wrap; gap: 12px; }
    .create-form .row > label { flex: 1 1 150px; min-width: 0; }
    .create-form .manual-contact, .create-form .lines { display: flex; flex-direction: column; gap: 14px; }
    .create-form .error { min-height: 0; font-size: 13px; font-weight: 400; }
    .create-form .line { display: flex; flex-direction: column; gap: 12px; padding: 12px; border: 1px solid #dde3ea; border-radius: 10px; background: #fff; }
    .create-form .line-head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
    .create-form .remove-line { padding: 8px 0; background: none; color: #c62828; font-size: 15px; }
    .create-form .add-line { padding: 12px 0; background: none; color: #1f6feb; font-size: 16px; text-align: left; }
    .create-form .hint { color: #777; font-size: 13px; }
    .create-form .total { display: flex; justify-content: space-between; gap: 8px; padding-top: 10px; border-top: 1px solid #e0e4ea; font-weight: 600; }
    .create-form .contact-results { display: flex; flex-direction: column; gap: 2px; max-height: 240px; overflow-y: auto; border: 1px solid #ddd; border-radius: 8px; background: #fff; }
    .create-form .contact-result { padding: 14px; background: none; text-align: left; font-size: 16px; color: #1a1a1a; }
    .create-form .contact-selected { display: flex; align-items: center; gap: 8px; padding: 12px; border: 1px solid #b7e1c1; border-radius: 8px; background: #f0fff4; }
    .create-form .contact-selected span { flex: 1; }
    .create-form .link { padding: 8px; font-size: 15px; }
    .create-form .buttons { display: flex; gap: 8px; }
    .create-form .buttons button { flex: 1; padding: 16px; font-size: 16px; background: #e8ecf2; color: #1a1a1a; }
    .create-form .buttons .save { background: #1f6feb; color: #fff; }
    .create-form .acknowledge { padding: 14px; font-size: 16px; background: #e8ecf2; color: #1a1a1a; }
  `;

  const CAPTION_TEXTS = {
    point: 'Точка',
    visitAt: 'Очікуваний час візиту',
    excludeMailing: 'Виключення розсилки',
    orderNote: 'Примітка до замовлення'
  };
  const FIELD_ERRORS = ['point', 'visitAt', 'communicateAt', 'excludeMailing', 'orderNote', 'lines'];

  function money(number) {
    return number.toFixed(2).replace('.', ',');
  }

  function optionsOf(entries) {
    return entries.map(([value, text]) => el('option', { value }, [text]));
  }

  function fieldEntries(field) {
    return (field.options || []).map(option => [String(option.id), option.value]);
  }

  function readLine(block) {
    return {
      amount: normalizeAmount(block.querySelector('[name="amount"]').value),
      rate: normalizeRate(block.querySelector('[name="rate"]').value)
    };
  }

  function buildLine(onRemove) {
    const remove = el('button', { type: 'button', class: 'remove-line' }, ['Видалити']);
    const block = el('div', { class: 'line' }, [
      el('div', { class: 'line-head' }, [el('span', { class: 'line-title' }), remove]),
      labeled('Валюта', el('select', { name: 'currency' }, optionsOf(CURRENCIES.map(code => [code, code])))),
      labeled('Операція', el('select', { name: 'operation' }, optionsOf(OPERATIONS.map(item => [item.code, item.label])))),
      el('div', { class: 'row' }, [
        labeled('Сума', el('input', { name: 'amount', inputmode: 'decimal', autocomplete: 'off' }), 'amount'),
        labeled('Курс (5 знаків)', el('input', { name: 'rate', inputmode: 'decimal', autocomplete: 'off' }), 'rate')
      ]),
      el('div', { class: 'hint' })
    ]);
    remove.addEventListener('click', () => onRemove(block));
    return block;
  }

  function createCreatePanel(onSearchContacts) {
    const captions = Object.fromEntries(Object.entries(CAPTION_TEXTS).map(([name, text]) => [name, el('span', {}, [text])]));
    const point = el('select', { name: 'point' });
    const visitAt = el('input', { name: 'visitAt', type: 'datetime-local' });
    const communicateAt = el('input', { name: 'communicateAt', type: 'datetime-local' });
    const manager = el('input', { name: 'manager', readonly: '' });
    const source = el('select', { name: 'sourceId' });    const managerNote = el('textarea', { name: 'managerNote', rows: '2' });
    const contactSearch = el('input', { autocomplete: 'off', placeholder: 'Пошук за іменем, email або телефоном' });
    const contactResults = el('div', { class: 'contact-results', hidden: '' });
    const contactChange = el('button', { type: 'button', class: 'link' }, ['Змінити']);
    const contactSelectedName = el('span', {});
    const contactSelected = el('div', { class: 'contact-selected', hidden: '' }, ['✓ ', contactSelectedName, contactChange]);
    const fullName = el('input', { name: 'fullName', autocomplete: 'off' });
    const phone = el('input', { name: 'phone', type: 'tel', autocomplete: 'off' });
    const email = el('input', { name: 'email', type: 'email', autocomplete: 'off' });
    const manualContact = el('div', { class: 'manual-contact' }, [
      labeled('Ім\'я та прізвище', fullName),
      labeled('Телефон', phone),
      labeled('E-mail', email)
    ]);
    const contactSearchLabel = labeled('Клієнт', contactSearch);
    const linesBox = el('div', { class: 'lines' });
    const addLine = el('button', { type: 'button', class: 'add-line' }, ['+ Додати рядок']);
    const excludeMailing = el('select', { name: 'excludeMailing' });
    const orderNote = el('input', { name: 'orderNote', autocomplete: 'off' });
    const total = el('div', { class: 'total' });
    const actions = buildActions('Я перевірив(ла) список заявок, продовжити', 'Створити заявку');
    const form = el('form', { class: 'create-form', novalidate: '' }, [
      labeled(captions.point, point, 'point'),
      labeled(captions.visitAt, visitAt, 'visitAt'),
      labeled('Час наступного контакту', communicateAt, 'communicateAt'),
      labeled('Менеджер', manager),
      labeled('Джерело', source),
      labeled('Замітка', managerNote),
      contactSearchLabel,
      contactResults,
      contactSelected,
      manualContact,
      linesBox,
      el('span', { class: 'error', 'data-error': 'lines' }),
      addLine,
      labeled(captions.excludeMailing, excludeMailing, 'excludeMailing'),
      labeled(captions.orderNote, orderNote, 'orderNote'),
      total,
      ...actions.nodes
    ]);
    let fields = null;
    let selectedContact = null;
    let searchToken = 0;
    let searchTimer = null;

    function renderContactMode() {
      const has = selectedContact !== null;
      contactSelected.hidden = !has;
      contactSearchLabel.hidden = has;
      manualContact.hidden = has;
      if (has) {
        contactSelectedName.textContent = selectedContact.phone
          ? `${selectedContact.fullName} (${selectedContact.phone})`
          : selectedContact.fullName;
      }
      contactResults.hidden = true;
      contactResults.replaceChildren();
    }

    function selectContact(contact) {
      selectedContact = contact;
      contactSearch.value = '';
      renderContactMode();
    }

    function clearContact() {
      selectedContact = null;
      renderContactMode();
    }

    function renderResults(list) {
      contactResults.replaceChildren(...list.map(contact => {
        const row = el('button', { type: 'button', class: 'contact-result' }, [
          contact.phone ? `${contact.fullName} (${contact.phone})` : contact.fullName
        ]);
        row.addEventListener('click', () => selectContact(contact));
        return row;
      }));
      contactResults.hidden = list.length === 0;
    }

    async function runSearch(query) {
      searchToken += 1;
      const token = searchToken;
      if (!onSearchContacts || query.trim() === '') {
        contactResults.hidden = true;
        contactResults.replaceChildren();
        return;
      }
      const results = await onSearchContacts(query).catch(() => []);
      if (token !== searchToken) return;
      renderResults(results);
    }

    function blocks() {
      return Array.from(linesBox.children);
    }

    function refreshLines() {
      const all = blocks();
      const priced = [];
      all.forEach((block, index) => {
        const parsed = readLine(block);
        const complete = parsed.amount.ok && parsed.rate.ok;
        block.querySelector('.line-title').textContent = `Рядок ${index + 1}`;
        block.querySelector('.remove-line').hidden = all.length === 1;
        block.querySelector('.hint').textContent = complete
          ? `У keyCRM у рядку буде ціна ${money(roundPrice(parsed.rate.value))}, у полі Курс ${index + 1} точний курс ${parsed.rate.value}`
          : '';
        if (complete) priced.push({ price: roundPrice(parsed.rate.value), amount: parsed.amount.value });
      });
      addLine.hidden = all.length >= MAX_LINES;
      total.textContent = `Сума в keyCRM (за округленими цінами): ${money(productsTotal(priced))} грн`;
    }

    function appendLine() {
      linesBox.append(buildLine(block => {
        block.remove();
        refreshLines();
      }));
      refreshLines();
    }

    function showErrors(result) {
      FIELD_ERRORS.forEach(name => {
        form.querySelector(`[data-error="${name}"]`).textContent = result.errors[name] || '';
      });
      blocks().forEach((block, index) => {
        const lineErrors = result.lineErrors[index] || {};
        block.querySelector('[data-error="amount"]').textContent = lineErrors.amount || '';
        block.querySelector('[data-error="rate"]').textContent = lineErrors.rate || '';
      });
    }

    function load(context, now) {
      clearTimeout(searchTimer);
      searchToken += 1;
      fields = context.fields;
      Object.entries(CAPTION_TEXTS).forEach(([name, text]) => {
        captions[name].textContent = fields[name].required ? `${text} *` : text;
      });
      point.replaceChildren(...optionsOf([['', '—'], ...fieldEntries(fields.point)]));
      excludeMailing.replaceChildren(...optionsOf([['', '—'], ...fieldEntries(fields.excludeMailing)]));
      source.replaceChildren(...optionsOf([['', '—'], ...context.sources.map(item => [String(item.id), item.name])]));
      form.reset();
      manager.value = context.manager.name;
      communicateAt.value = defaultCommunicateAt(now);
      linesBox.replaceChildren();
      appendLine();
      selectedContact = null;
      renderContactMode();
      showErrors({ errors: {}, lineErrors: [] });
    }

    function readRaw() {
      const contact = selectedContact
        ? { fullName: selectedContact.fullName, phone: selectedContact.phone, email: selectedContact.email }
        : { fullName: fullName.value, phone: phone.value, email: email.value };
      return {
        point: point.value,
        visitAt: visitAt.value,
        communicateAt: communicateAt.value,
        sourceId: source.value,
        managerNote: managerNote.value,
        client: selectedContact ? selectedContact.client : null,
        contact,
        lines: blocks().map(block => ({
          currency: block.querySelector('[name="currency"]').value,
          operation: block.querySelector('[name="operation"]').value,
          amount: block.querySelector('[name="amount"]').value,
          rate: block.querySelector('[name="rate"]').value
        })),
        excludeMailing: excludeMailing.value,
        orderNote: orderNote.value
      };
    }

    function validate() {
      const result = validateCreateForm(readRaw(), fields);
      showErrors(result);
      return result.ok ? result.value : null;
    }

    function setDisabled(flag) {
      form.querySelectorAll('select, input, textarea, .save, .add-line, .remove-line, .link, .contact-result').forEach(control => {
        control.disabled = flag;
      });
    }

    addLine.addEventListener('click', appendLine);
    form.addEventListener('input', refreshLines);
    contactChange.addEventListener('click', clearContact);
    contactSearch.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const query = contactSearch.value;
      searchTimer = setTimeout(() => runSearch(query), 300);
    });

    return {
      form,
      status: actions.status,
      acknowledge: actions.acknowledge,
      save: actions.save,
      cancel: actions.cancel,
      load,
      validate,
      setDisabled
    };
  }

  const exported = { CREATE_STYLE, createCreatePanel };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
})();
