(function () {
  const { el, buildActions, flagImage, normalizeRate, validateRateInputs, validateExtraInputs } = globalThis.Ex42;

  const RATE_STYLE = `
    .rate-form, .line-form { display: flex; flex-direction: column; gap: 8px; }
    .section-title { font-weight: 600; }
    .rate-rows { display: flex; flex-direction: column; gap: 8px; }
    .rate-row { display: flex; flex-direction: column; gap: 4px; padding: 8px; border: 1px solid #dde3ea; border-radius: 8px; background: #f8fafc; }
    .rate-head { display: flex; justify-content: space-between; gap: 8px; }
    .rate-label { display: flex; align-items: center; gap: 6px; font-weight: 600; }
    .rate-note { color: #555; }
    .point-row { display: flex; flex-direction: column; gap: 4px; }
    .rate-hint { color: #777; font-size: 12px; }
    .link { padding: 0; border: 0; background: none; color: #1d6fe8; cursor: pointer; text-align: left; }
  `;

  function buildRow(row) {
    const flag = flagImage(row.picture);
    return el('div', { class: 'rate-row' }, [
      el('div', { class: 'rate-head' }, [
        el('span', { class: 'rate-label' }, flag ? [flag, row.label] : [row.label]),
        el('span', {}, [`Сума ${row.quantity} · ціна ${Number(row.price).toFixed(2)}`])
      ]),
      el('input', { name: 'rate', inputmode: 'decimal', autocomplete: 'off', value: row.prefill }),
      el('span', { class: 'error' }),
      el('div', { class: 'rate-hint' })
    ]);
  }

  function createRatePanel() {
    const rowsBox = el('div', { class: 'rate-rows' });
    const note = el('div', { class: 'rate-note' });
    const pointSelect = el('select', { name: 'point' });
    const pointError = el('span', { class: 'error' });
    const pointBox = el('label', { class: 'point-row', hidden: '' }, ['Точка *', pointSelect, pointError]);
    const excludeCaption = el('span');
    const excludeSelect = el('select', { name: 'excludeMailing' });
    const excludeError = el('span', { class: 'error' });
    const excludeBox = el('label', { class: 'point-row', hidden: '' }, [excludeCaption, excludeSelect, excludeError]);
    const noteCaption = el('span');
    const noteInput = el('input', { name: 'orderNote', autocomplete: 'off' });
    const noteError = el('span', { class: 'error' });
    const noteBox = el('label', { class: 'point-row', hidden: '' }, [noteCaption, noteInput, noteError]);
    const managerNoteInput = el('input', { name: 'managerComment', autocomplete: 'off' });
    const managerNoteBox = el('label', { class: 'point-row', hidden: '' }, ['Замітка', managerNoteInput]);
    const actions = buildActions('Я перевірив(ла) картку, продовжити', 'Зберегти курс');
    const form = el('form', { class: 'rate-form', novalidate: '' }, [
      el('div', { class: 'section-title' }, ['Уточнення курсу']),
      rowsBox,
      pointBox,
      excludeBox,
      noteBox,
      managerNoteBox,
      note,
      ...actions.nodes
    ]);
    let rows = [];
    let extras = {};

    function blocks() {
      return Array.from(rowsBox.children);
    }

    function refreshHints() {
      blocks().forEach((block, index) => {
        const parsed = normalizeRate(block.querySelector('input').value);
        block.querySelector('.rate-hint').textContent = parsed.ok
          ? `У keyCRM ціна ${Number(rows[index].price).toFixed(2)}, у полі Курс ${rows[index].slot} буде ${parsed.value}`
          : '';
      });
    }

    function clear() {
      rows = [];
      rowsBox.replaceChildren();
      note.textContent = '';
      pointBox.hidden = true;
      pointSelect.replaceChildren();
      pointError.textContent = '';
      extras = {};
      excludeBox.hidden = true;
      excludeSelect.replaceChildren();
      excludeError.textContent = '';
      noteBox.hidden = true;
      noteInput.value = '';
      noteError.textContent = '';
      managerNoteBox.hidden = true;
      managerNoteInput.value = '';
      actions.save.hidden = true;
    }

    function load(data) {
      clear();
      if (data.locked) {
        note.textContent = `Заявка в статусі «${data.statusTitle}»: курс не змінюється`;
        return;
      }
      if (data.rows.length === 0) note.textContent = 'У заявці ще немає рядків з валютою';
      if (data.rows.length === 0 && !data.point && !data.excludeMailing && !data.orderNote && !data.managerNote) return;
      rows = data.rows;
      rowsBox.append(...rows.map(buildRow));
      if (data.point) {
        pointSelect.append(...[['', '—'], ...data.point.options].map(([value, text]) => el('option', { value }, [text])));
        pointBox.hidden = false;
      }
      if (data.excludeMailing) {
        extras.excludeMailing = data.excludeMailing;
        excludeCaption.textContent = data.excludeMailing.required ? 'Виключення розсилки *' : 'Виключення розсилки';
        excludeSelect.append(...[['', '—'], ...data.excludeMailing.options].map(([value, text]) => el('option', { value }, [text])));
        excludeBox.hidden = false;
      }
      if (data.orderNote) {
        extras.orderNote = data.orderNote;
        noteCaption.textContent = data.orderNote.required ? 'Примітка до замовлення *' : 'Примітка до замовлення';
        noteBox.hidden = false;
      }
      if (data.managerNote) managerNoteBox.hidden = false;
      actions.save.hidden = false;
      refreshHints();
    }

    function validate() {
      const result = validateRateInputs(rows, blocks().map(block => block.querySelector('input').value));
      blocks().forEach((block, index) => {
        block.querySelector('.error').textContent = result.errors[index] || '';
      });
      const pointMissing = !pointBox.hidden && pointSelect.value === '';
      pointError.textContent = pointMissing ? 'Оберіть точку' : '';
      const extraErrors = validateExtraInputs(extras, { excludeMailing: excludeSelect.value, orderNote: noteInput.value });
      excludeError.textContent = extraErrors.excludeMailing || '';
      noteError.textContent = extraErrors.orderNote || '';
      if (!result.ok || pointMissing || Object.keys(extraErrors).length > 0) return null;
      const pointId = pointBox.hidden ? null : Number(pointSelect.value);
      const excludeMailingId = excludeBox.hidden || excludeSelect.value === '' ? null : Number(excludeSelect.value);
      const orderNote = noteBox.hidden ? '' : noteInput.value.trim();
      const managerComment = managerNoteBox.hidden ? '' : managerNoteInput.value.trim();
      return { values: result.values, productIds: rows.map(row => row.productId), pointId, excludeMailingId, orderNote, managerComment };
    }

    function setDisabled(flag) {
      form.querySelectorAll('input, select, .save').forEach(control => {
        control.disabled = flag;
      });
    }

    form.addEventListener('input', refreshHints);

    return {
      form,
      status: actions.status,
      acknowledge: actions.acknowledge,
      save: actions.save,
      cancel: actions.cancel,
      clear,
      load,
      validate,
      setDisabled
    };
  }

  const exported = { RATE_STYLE, createRatePanel };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
})();
