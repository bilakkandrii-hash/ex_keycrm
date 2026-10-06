(function () {
  const PIPELINE_ERROR = 'Не вдалося визначити воронку: оновіть список';
  const RETRY_DISABLED_TEXT = 'Повторне створення вимкнено, доки ви не підтвердите.';
  const CREATE_LOCK_TEXT = `Заявка могла вже бути створена: перевірте список заявок. ${RETRY_DISABLED_TEXT}`;

  function ratesText({ changed, point, excludeMailing, orderNote, managerComment }) {
    const parts = changed.map(item => `Курс ${item.slot} = ${item.value}`);
    const rateParts = parts.length;
    if (point) parts.push(`Точка = ${point}`);
    if (excludeMailing) parts.push(`Виключення розсилки = ${excludeMailing}`);
    if (orderNote) parts.push(`Примітка до замовлення = ${orderNote}`);
    if (managerComment) parts.push(`Замітка = ${managerComment}`);
    if (parts.length === 0) return 'Змін немає.';
    return `${parts.length > rateParts ? 'Збережено' : 'Курс збережено'}: ${parts.join(', ')}.`;
  }

  function createSuccessText(result) {
    return `Заявку створено: ${result.title}`;
  }

  function createErrorText(error) {
    if (!error.lineAdded) return error.message;
    if (error.createdId) {
      return `${error.message}. Заявку вже створено: перевірте заявку #${error.createdId}. ${RETRY_DISABLED_TEXT}`;
    }
    return `${error.message}. ${CREATE_LOCK_TEXT}`;
  }

  const exported = { PIPELINE_ERROR, CREATE_LOCK_TEXT, ratesText, createSuccessText, createErrorText };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
  if (typeof module !== 'undefined') module.exports = exported;
})();
