/* Keep product identity and price before the lengthy specifications on narrow screens. */
(() => {
  const previousDetail = detail;
  detail = function (ref) {
    previousDetail(ref);
    const columns = document.querySelectorAll('#main .detail > div');
    const specs = columns[0]?.querySelector('.specs-panel');
    if (specs && columns[1] && matchMedia('(max-width: 850px)').matches) {
      columns[1].insertAdjacentElement('afterend', specs);
    }
  };
  if (location.hash.startsWith('#/produit/')) render(false);
})();
