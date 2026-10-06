(function () {
  const RATE_RULES = { label: 'Курс', integerDigits: 6, decimals: 5, example: '45,12345' };
  const AMOUNT_RULES = { label: 'Сума', integerDigits: 9, decimals: 3, example: '5000 або 100,5' };

  function failure(error) {
    return { ok: false, error };
  }

  function splitDecimal(input) {
    const match = String(input).trim().match(/^(\d+)(?:[.,](\d+))?$/);
    if (!match) return null;
    return { integer: match[1].replace(/^0+(?=\d)/, ''), fraction: match[2] || '' };
  }

  function parsePositive(input, { label, integerDigits, decimals, example }) {
    const parts = splitDecimal(input);
    if (!parts) return failure(`${label}: введіть додатне число, наприклад ${example}`);
    if (parts.integer.length > integerDigits) return failure(`${label}: ціла частина — не більше ${integerDigits} цифр`);
    if (parts.fraction.length > decimals) return failure(`${label}: не більше ${decimals} знаків після коми`);
    if (!/[1-9]/.test(parts.integer + parts.fraction)) return failure(`${label}: має бути більше нуля`);
    return { ok: true, parts };
  }

  function roundPrice(rate) {
    const { integer, fraction } = splitDecimal(rate);
    const padded = fraction.padEnd(3, '0');
    const roundUp = padded[2] >= '5' ? 1 : 0;
    const cents = Number(integer) * 100 + Number(padded.slice(0, 2)) + roundUp;
    const digits = String(cents).padStart(3, '0');
    return Number(`${digits.slice(0, -2)}.${digits.slice(-2)}`);
  }

  function normalizeRate(input) {
    const parsed = parsePositive(input, RATE_RULES);
    if (!parsed.ok) return parsed;
    const value = `${parsed.parts.integer}.${parsed.parts.fraction.padEnd(RATE_RULES.decimals, '0')}`;
    if (roundPrice(value) === 0) return failure('Курс: ціна в CRM округлюється до 0.00, мінімальний курс 0,005');
    return { ok: true, value };
  }

  function normalizeAmount(input) {
    const parsed = parsePositive(input, AMOUNT_RULES);
    if (!parsed.ok) return parsed;
    return { ok: true, value: Number(`${parsed.parts.integer}.${parsed.parts.fraction || '0'}`) };
  }

  const exported = { normalizeRate, normalizeAmount, roundPrice };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
  if (typeof module !== 'undefined') module.exports = exported;
})();
