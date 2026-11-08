/* Return from a product page to the same catalogue card and scroll position. */
(() => {
  const storageKey = 'samsung-catalogue-return';
  const filterKeys = ['query', 'category', 'subCategory', 'sort', 'stock', 'cataloguePage'];
  let departure = null;

  try {
    departure = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
  } catch {
    departure = null;
  }

  function remember(ref) {
    const card = [...document.querySelectorAll('#grid .card')]
      .find((item) => item.dataset.ref === ref);
    departure = {
      ref,
      y: window.scrollY,
      cardTop: card ? card.getBoundingClientRect().top : null,
      filters: Object.fromEntries(filterKeys.map((key) => [key, state[key]])),
    };
    try { sessionStorage.setItem(storageKey, JSON.stringify(departure)); } catch {}
  }

  // Capture before the hash navigation changes the document or its scroll offset.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#/produit/"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (currentRoute === '/catalogue') remember(decodeURIComponent(link.hash.slice('#/produit/'.length)));
    else {
      departure = null;
      try { sessionStorage.removeItem(storageKey); } catch {}
    }
  }, true);

  const previousRender = render;
  render = function (scroll = true) {
    const from = currentRoute;
    let to;
    try { to = decodeURIComponent(location.hash.slice(1) || '/catalogue'); }
    catch { to = '/catalogue'; }

    if (from === '/catalogue' && to.startsWith('/produit/') && !departure) {
      remember(to.slice('/produit/'.length));
    }

    const returning = to === '/catalogue' && from.startsWith('/produit/')
      && departure?.ref === from.slice('/produit/'.length);
    if (returning) Object.assign(state, departure.filters);

    previousRender(returning ? false : scroll);

    if (returning) {
      const saved = departure;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const card = [...document.querySelectorAll('#grid .card')]
          .find((item) => item.dataset.ref === saved.ref);
        const y = card && Number.isFinite(saved.cardTop)
          ? window.scrollY + card.getBoundingClientRect().top - saved.cardTop
          : saved.y;
        window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
      }));
    }
  };
})();
