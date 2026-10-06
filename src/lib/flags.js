(function () {
  const { CURRENCIES } = typeof module !== 'undefined' ? require('./lines') : globalThis.Ex42;

  function imageUrl(raw) {
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    if (value === '') return null;
    if (/^https?:\/\//i.test(value)) return value;
    if (/^(javascript|data|vbscript|blob):/i.test(value)) return null;
    if (value.startsWith('//')) return `https:${value}`;
    if (value.startsWith('/')) return null;
    return `https://${value}`;
  }

  function isApiPath(path) {
    return typeof path === 'string' && /^\/(?![/\\])/.test(path);
  }

  function pickPicture(offer) {
    return (offer.product && offer.product.thumbnail_url) || offer.thumbnail_url || null;
  }

  function linePicture(line) {
    return line.picture || (line.offer && line.offer.product && line.offer.product.thumbnail_url) || null;
  }

  function buildFlagMap(items) {
    const map = {};
    items.forEach(item => {
      const name = String(item.product_name || (item.product && item.product.name) || '').trim();
      const picture = pickPicture(item);
      if (CURRENCIES.includes(name) && picture && !map[name]) map[name] = picture;
    });
    return map;
  }

  function toApiPath(nextUrl, baseUrl) {
    if (typeof nextUrl !== 'string') return null;
    const value = nextUrl.trim();
    if (isApiPath(value)) return value;
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return null;
    }
    if (parsed.origin !== new URL(baseUrl).origin) return null;
    const path = parsed.pathname + parsed.search;
    return isApiPath(path) ? path : null;
  }

  const exported = { imageUrl, isApiPath, pickPicture, linePicture, buildFlagMap, toApiPath };
  globalThis.Ex42 = Object.assign(globalThis.Ex42 || {}, exported);
  if (typeof module !== 'undefined') module.exports = exported;
})();
