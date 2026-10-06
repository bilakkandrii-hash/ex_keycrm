(function () {
  const { imageUrl } = globalThis.Ex42;

  function el(tag, attributes, children) {
    const node = document.createElement(tag);
    Object.entries(attributes || {}).forEach(([name, value]) => node.setAttribute(name, value));
    node.append(...(children || []));
    return node;
  }

  function labeled(text, control, errorName) {
    const children = [text, control];
    if (errorName) children.push(el('span', { class: 'error', 'data-error': errorName }));
    return el('label', {}, children);
  }

  function buildActions(acknowledgeText, saveText) {
    const status = el('div', { class: 'status', role: 'status' });
    const acknowledge = el('button', { type: 'button', class: 'acknowledge', hidden: '' }, [acknowledgeText]);
    const save = el('button', { type: 'submit', class: 'save' }, [saveText]);
    const cancel = el('button', { type: 'button', class: 'cancel' });
    return { status, acknowledge, save, cancel, nodes: [status, acknowledge, el('div', { class: 'buttons' }, [save, cancel])] };
  }

  function flagImage(raw) {
    const src = imageUrl(raw);
    if (!src) return null;
    const image = el('img', { class: 'flag', src, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' });
    image.addEventListener('error', () => image.remove());
    return image;
  }

  const exported = { el, labeled, buildActions, flagImage };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
})();
