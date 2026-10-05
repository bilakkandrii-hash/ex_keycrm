(function () {
  const CURRENCIES = ['USD', 'USDnew', 'EUR', 'CZK', 'GBP', 'PLN', 'RON', 'MDL'];
  const OPERATIONS = [
    { code: 'BUY', label: 'Взяти у клієнта валюту' },
    { code: 'SELL', label: 'Видати валюту' }
  ];
  const MAX_LINES = 3;

  function buildSku(currency, operation) {
    return `${currency}-${operation}`;
  }

  function rateFieldName(slot) {
    return `Курс ${slot}`;
  }

  const exported = { CURRENCIES, OPERATIONS, MAX_LINES, buildSku, rateFieldName };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
  if (typeof module !== 'undefined') module.exports = exported;
})();
