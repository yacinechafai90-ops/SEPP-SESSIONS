'use strict';
/* Final catalogue, payments and PDF order-form update. */
(function () {
  const PAGE_SIZE = 12;
  const terms = [6, 12, 18];
  const cartQuantity = () => bucketItems.reduce((n, item) => n + item.qty, 0);
  const roundTo100 = (n) => Math.round(n / 100) * 100;
    const discountRate = (months) => cartQuantity() < 3 ? 0 : ((Number((window.CATALOGUE.discount || {})[months]) || 0) / 100);
  const rawFinancedTotal = (months) => bucketItems.reduce((sum, item) => {
    const termKey = months === 6 ? '3/6' : String(months);
    return sum + (Number(item.p.financing?.[termKey]) || 0) * item.qty;
  }, 0);
  const financedTotal = (months) => Math.round(rawFinancedTotal(months) * (1 - discountRate(months)));
  const paymentAmount = (months) => Math.round(financedTotal(months) / months);
  const cashAmount = () => bucketItems.reduce((sum, item) => sum + item.p.offerPrice * item.qty, 0);

  subCategory = function (product) {
    const name = String(product.name || '').toLowerCase();
    if (product.category === 'Téléviseurs') {
      if (/neo\s*qled/.test(name)) return 'Neo QLED';
      if (/\bqled\b/.test(name)) return 'QLED';
      if (/\boled\b|\bo led\b|\bo\s*serie/.test(name)) return 'OLED';
      if (/^UA/.test(product.reference)) return 'Crystal UHD';
    }
    if (product.category === 'Climatiseurs') return /wind\s*free/.test(name) ? 'WindFree' : null;
    if (product.category === 'Réfrigérateurs') { const m = name.match(/(\d{3,4})\s*l\b/); return m ? m[1] + ' L' : null; }
    if (product.category === 'Lave-linge') return /\btop\b/.test(name) ? 'Top' : /\bfront\b/.test(name) ? 'Frontale' : null;
    return null;
  };
  subCategoryOptions = (category) => [...new Set(products.filter((product) => category === 'all' || product.category === category).map(subCategory).filter(Boolean))];

  updateGrid = function () {
    const query = normalize((state.query || '').trim());
    let list = products.filter((product) => (state.category === 'all' || product.category === state.category) && (state.subCategory === 'all' || subCategory(product) === state.subCategory) && (!query || normalize(product.reference + ' ' + product.name + ' ' + product.category + ' ' + (subCategory(product) || '')).includes(query)) && (state.stock === 'all' || (state.stock === 'available' ? product.availability === 'Disponible' : product.availability !== 'Disponible')));
    if (state.sort === 'asc') list.sort((a, b) => a.offerPrice - b.offerPrice);
    if (state.sort === 'desc') list.sort((a, b) => b.offerPrice - a.offerPrice);
    if (state.sort === 'ref') list.sort((a, b) => a.reference.localeCompare(b.reference));
    state.cataloguePage = Math.min(state.cataloguePage || 1, Math.max(1, Math.ceil(list.length / PAGE_SIZE)));
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const visible = list.slice((state.cataloguePage - 1) * PAGE_SIZE, state.cataloguePage * PAGE_SIZE);
    $('#results').textContent = L(`${list.length} produits · page ${state.cataloguePage}/${totalPages}`, `${list.length} منتج · صفحة ${state.cataloguePage}/${totalPages}`);
    $('#grid').innerHTML = visible.map(card).join('') || `<div class="empty"><h2>${L('Aucun produit trouvé', 'لم يتم العثور على منتجات')}</h2></div>`;
    $('#grid').insertAdjacentHTML('afterend', totalPages > 1 ? `<nav class="catalogue-pagination" aria-label="Pagination"><button ${state.cataloguePage === 1 ? 'disabled' : ''} data-page="${state.cataloguePage - 1}">← ${L('Précédent', 'السابق')}</button>${Array.from({ length: totalPages }, (_, index) => `<button class="${index + 1 === state.cataloguePage ? 'active' : ''}" data-page="${index + 1}">${index + 1}</button>`).join('')}<button ${state.cataloguePage === totalPages ? 'disabled' : ''} data-page="${state.cataloguePage + 1}">${L('Suivant', 'التالي')} →</button></nav>` : '');
    document.querySelectorAll('[data-page]').forEach((button) => button.onclick = () => { state.cataloguePage = Number(button.dataset.page); updateGrid(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.querySelectorAll('[data-add-product]').forEach((button) => button.onclick = () => { const product = products.find((item) => item.reference === button.dataset.addProduct); const found = bucketItems.find((item) => item.p.reference === product.reference); if (found) found.qty++; else bucketItems.push({ p: product, qty: 1 }); saveBucket(); button.textContent = L('Ajouté au panier ✓', 'تمت الإضافة ✓'); });
    bindImages();
  };

  function renderPayment() {
    const panel = $('#bucket-panel');
    if (!panel) return;
    const rawDuration = panel.dataset.duration || '6';
    const duration = rawDuration === 'cash' ? 'cash' : Number(rawDuration);
    panel.innerHTML = `<section class="bucket-panel"><div class="bucket-head"><h2>${L('Votre sélection', 'اختيارك')}</h2><span>${cartQuantity()} ${L('article(s)', 'منتج')}</span></div>${bucketItems.length ? `<div class="bucket-list">${bucketItems.map((item, index) => `<div class="bucket-row"><div><strong>${esc(item.p.name)}</strong><small>${item.p.reference}</small><span class="item-price">${duration === 'cash' ? L('Prix comptant', 'السعر نقداً') : L('Prix sur ' + duration + ' mois', 'السعر على ' + duration + ' شهراً')} : ${money(duration === 'cash' ? item.p.offerPrice : item.p.financing[duration === 6 ? '3/6' : String(duration)])} ${L('l’unité', 'للوحدة')}</span></div><div class="bucket-actions"><button data-cart-change="${index}" data-change="-1">−</button><span>${item.qty}</span><button data-cart-change="${index}" data-change="1">+</button><button data-cart-remove="${index}">×</button></div></div>`).join('')}</div>` : `<p class="bucket-empty">${L('Votre panier est vide.', 'سلتك فارغة.')}</p>`}<div class="bucket-total"><span>${L('Total comptant', 'الإجمالي نقداً')}</span><strong>${money(cashAmount())}</strong></div><div class="monthly-selector"><span>${L('Durée de paiement', 'مدة الدفع')}</span><div><button class="${duration === 'cash' ? 'active' : ''}" data-duration="cash">${L('Comptant', 'نقداً')}</button>${terms.map((months) => `<button class="${duration === months ? 'active' : ''}" data-duration="${months}">${months} ${L('mois', 'شهراً')}</button>`).join('')}</div></div><div class="bucket-payments four-payments"><article class="${duration === 'cash' ? 'selected' : ''}"><span>${L('Comptant', 'نقداً')}</span><strong dir="ltr">${money(cashAmount())}</strong><small>${L('Paiement en une fois', 'الدفع دفعة واحدة')}</small></article>${terms.map((months) => { const discount = discountRate(months); return `<article class="${duration === months ? 'selected' : ''}"><span>${months} ${L('mois', 'شهراً')}</span><strong dir="ltr">${money(financedTotal(months))}</strong><small>${L('Total de la formule', 'إجمالي الصيغة')}</small><div class="card-monthly"><strong dir="ltr" class="monthly-amount">${money(paymentAmount(months))}</strong><small>${L('par mois', 'شهرياً')}</small></div>${discount ? `<b class="discount-label">−${discount * 100}% ${L('remise', 'خصم')}</b>` : ''}</article>`; }).join('')}</div><form id="order-form" class="order-form"><h2>${L('Vos informations de retrait', 'معلومات الاستلام')}</h2><div class="order-fields"><label>${L('Nom et prénom *', 'الاسم واللقب *')}<input required name="name"></label><label>${L("Nom de l'entreprise *", 'اسم المؤسسة *')}<input required name="company"></label><label>${L('Ville / Wilaya *', 'المدينة / الولاية *')}<input required name="city"></label><label>${L('Numéro de téléphone *', 'رقم الهاتف *')}<input required name="phone"></label><label>${L('BrandShop de retrait *', 'متجر الاستلام *')}<select required name="shop"><option value="">${L('Choisissez votre BrandShop', 'اختر المتجر')}</option>${shops.map((shop) => `<option value="${esc(shop.name)}">${esc(shop.name)} — ${esc(shop.city)}</option>`).join('')}</select></label></div><button class="button order-download" ${bucketItems.length ? '' : 'disabled'}>${L('Imprimer / Enregistrer en PDF', 'طباعة / حفظ كملف PDF')} ↓</button></form></section>`;
    panel.querySelectorAll('[data-cart-change]').forEach((button) => button.onclick = () => { const item = bucketItems[Number(button.dataset.cartChange)]; item.qty += Number(button.dataset.change); if (item.qty < 1) bucketItems.splice(Number(button.dataset.cartChange), 1); saveBucket(); renderPayment(); });
    panel.querySelectorAll('[data-cart-remove]').forEach((button) => button.onclick = () => { bucketItems.splice(Number(button.dataset.cartRemove)); saveBucket(); renderPayment(); });
    panel.querySelectorAll('[data-duration]').forEach((button) => button.onclick = () => { panel.dataset.duration = button.dataset.duration; renderPayment(); });
  }

  payments = function () {
    const familyOrder = ['Téléviseurs', 'Climatiseurs', 'Réfrigérateurs', 'Lave-linge', 'Aspirateurs', 'Micro-ondes'];
    const productOptions = familyOrder.map((familyName) => {
      const items = products.filter((product) => product.category === familyName);
      return items.length ? `<optgroup label="${esc(cat(familyName))}">${items.map((product) => `<option value="${product.reference}">${product.reference} — ${esc(product.name)}</option>`).join('')}</optgroup>` : '';
    }).join('');
    $('#main').innerHTML = hero(L('Solutions de paiement', 'حلول الدفع'), L('Ajoutez vos références, consultez les mensualités et imprimez votre bon (ou enregistrez-le en PDF).', 'أضف مراجعك، اعرض الأقساط واطبع سندك (أو احفظه كملف PDF).'), L('Paiement', 'الدفع')) + `<div class="wrap content"><section class="smartthings-banner"><span class="smartthings-banner__icon">${ico('info')}</span><div><h2>${L('Promotion SmartThings', 'عرض SmartThings')}</h2><p>${L('Profitez d’une remise exclusive sur vos mensualités en combinant plusieurs produits Samsung dans votre sélection. Le montant est calculé automatiquement selon votre panier.', 'استفد من خصم حصري على أقساطك الشهرية عند دمج عدة منتجات سامسونج في اختيارك. يُحتسب المبلغ تلقائياً حسب سلتك.')}</p></div></section><div class="payment-picker"><label for="payment-product">${L('Choisir une référence', 'اختيار مرجع')}</label><select id="payment-product">${productOptions}</select><button type="button" id="add-to-bucket" class="button bucket-add">${L('Ajouter au panier', 'إضافة إلى السلة')} +</button></div><div id="bucket-panel" data-duration="6"></div></div>`;
    $('#add-to-bucket').onclick = () => { const product = products.find((item) => item.reference === $('#payment-product').value); const found = bucketItems.find((item) => item.p.reference === product.reference); if (found) found.qty++; else bucketItems.push({ p: product, qty: 1 }); saveBucket(); renderPayment(); };
    renderPayment();
  };

  const baseChrome = chrome;
  chrome = function () {
    baseChrome();
    $('#footer').innerHTML = `<div class="wrap"><div class="footer-row"><div><img src="assets/logo.png" alt="Samsung"><p>${L('Le catalogue Samsung pour les employés. Références, prix et facilités de paiement réunis au même endroit.', 'كتالوج سامسونج للموظفين.')}</p></div><div class="footer-contact"><strong>${L('Contact', 'اتصال')}</strong><a href="mailto:mohamed.selmani@sinova.dz">mohamed.selmani@sinova.dz</a><a href="tel:+213770720436">0770 72 04 36</a><span>ZEA, section 324, ilot 27, Sétif</span></div><div class="footer-contact"><strong>${L('Contact', 'اتصال')}</strong><a href="mailto:Yacine.c@samsung.com">Yacine.c@samsung.com</a><a href="tel:+213770431269">0770 43 12 69</a><span>Tour CMA-CGM 8ème étage, Bab Ezzouar</span></div></div><div class="footer-bottom">${L('Prix en dinars algériens • Disponibilités à confirmer auprès du magasin.', 'الأسعار بالدينار الجزائري.')}</div></div>`;
  };
  render(false);
}());
