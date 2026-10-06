(function () {
  const { pickPicture } = typeof module !== 'undefined' ? require('./flags') : globalThis.Ex42;

  function buildProduct(offer, price, quantity) {
    return {
      offer_id: offer.id,
      offer,
      price,
      name: offer.product_name,
      quantity,
      picture: pickPicture(offer),
      unit_type: null,
      id: null
    };
  }

  function buildProductsBody(leadId, offer, price, quantity) {
    return { products: [buildProduct(offer, price, quantity)], id: leadId };
  }

  function buildFieldValue(field, value) {
    return { value, field: { id: field.id, uuid: field.uuid }, field_id: field.id };
  }

  function buildFieldsBody(leadId, entries) {
    return { id: leadId, custom_field_values: entries.map(({ field, value }) => buildFieldValue(field, value)) };
  }

  function buildRateFieldsBody(leadId, field, rate) {
    return buildFieldsBody(leadId, [{ field, value: rate }]);
  }

  function findNewProductSlot(previousIds, products) {
    const added = products
      .map((product, index) => ({ id: product.id, slot: index + 1 }))
      .filter(item => !previousIds.has(item.id));
    return added.length === 1 ? added[0].slot : null;
  }

  function findOfferBySku(items, sku) {
    return items.find(item => item.sku === sku) || null;
  }

  function findFieldByName(fields, name) {
    return fields.find(field => field.name === name && field.model === 'lead') || null;
  }

  function hasFieldValue(lead, fieldId, expected) {
    return (lead.custom_field_values || []).some(item => item.field_id === fieldId && String(item.value) === String(expected));
  }

  function hasSelectValue(lead, fieldId, option) {
    const accepted = [String(option.id), option.value];
    return (lead.custom_field_values || []).some(item => item.field_id === fieldId
      && [].concat(item.value).some(stored => accepted.includes(String(stored))));
  }

  function hasManagerComment(lead, expected) {
    return lead.manager_comment === expected;
  }

  function collapseSpaces(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function sameLeadTitle(leadTitle, dialogTitle) {
    const title = collapseSpaces(leadTitle);
    return title !== '' && title === collapseSpaces(dialogTitle);
  }

  const exported = {
    buildProduct, buildProductsBody, buildFieldValue, buildFieldsBody, buildRateFieldsBody,
    findNewProductSlot, findOfferBySku, findFieldByName, hasFieldValue, hasSelectValue, hasManagerComment, sameLeadTitle
  };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
  if (typeof module !== 'undefined') module.exports = exported;
})();
