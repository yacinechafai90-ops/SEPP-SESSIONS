'use strict';
(function () {
  const previousUpdateGrid = updateGrid;
  updateGrid = function () {
    document.querySelectorAll('.catalogue-pagination').forEach((element) => element.remove());
    previousUpdateGrid();
  };

  const previousDetail = detail;
  detail = function (reference) {
    previousDetail(reference);
    const product = products.find((item) => item.reference === reference);
    const target = document.querySelector('#main .detail strong.price');
    if (!product || !target || document.querySelector('#detail-add-to-bucket')) return;
    target.insertAdjacentHTML('afterend', `<button type="button" id="detail-add-to-bucket" class="button detail-bucket-button">${L('Ajouter au panier', 'إضافة إلى السلة')} +</button>`);
    document.querySelector('#detail-add-to-bucket').onclick = () => {
      const found = bucketItems.find((item) => item.p.reference === product.reference);
      if (found) found.qty++; else bucketItems.push({ p: product, qty: 1 });
      saveBucket();
      document.querySelector('#detail-add-to-bucket').textContent = L('Ajouté au panier ✓', 'تمت الإضافة ✓');
    };
  };
  render(false);
}());
