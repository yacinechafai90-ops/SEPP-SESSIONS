'use strict';
/* Final catalogue, payments and PDF order-form update. */
(function () {
  const PAGE_SIZE = 12;
  const terms = [6, 12, 18, 24];
  const cartQuantity = () => bucketItems.reduce((n, item) => n + item.qty, 0);
  const roundTo100 = (n) => Math.round(n / 100) * 100;
    const remiseMinimum = Number(window.CATALOGUE.remise_minimum) || 3;
    const discountRate = (months) => cartQuantity() < remiseMinimum ? 0 :((Number((window.CATALOGUE.discount || {})[months]) || 0) / 100);
  const rawFinancedTotal = (months) => bucketItems.reduce((sum, item) => {
    const termKey = months === 6 ? '3/6' : String(months);
    return sum + (Number(item.p.financing?.[termKey]) || 0) * item.qty;
  }, 0);
  // Montants après remise arrondis à la centaine (total de la formule et mensualité).
  const financedTotal = (months) => Math.round(rawFinancedTotal(months) * (1 - discountRate(months)) / 100) * 100;
  const paymentAmount = (months) => Math.round(financedTotal(months) / months / 100) * 100;
  const cashAmount = () => bucketItems.reduce((sum, item) => sum + item.p.offerPrice * item.qty, 0);
  // Formules proposees : celles que l'administration n'a pas desactivees pour TOUS les produits du panier.
  // Une formule n'apparait que si l'administration l'a activee ET si le produit a un montant pour cette duree (sinon carte a 0,00).
  // Source unique : les formules cochées dans l'administration pour cette session (CATALOGUE.formules_autorisees, null = toutes).
  const formuleAutorisee = (cle) => {
    const liste = window.CATALOGUE?.formules_autorisees;
    return !Array.isArray(liste) || liste.includes(String(cle));
  };
  // Une durée n'apparait que si l'administration l'a cochée ET si le produit a une mensualité (0 ou vide = pas d'offre).
  const termsOf = (item) => terms.filter((months) => formuleAutorisee(months) && Number(item.p.financing?.[months === 6 ? '3/6' : String(months)]) > 0);
  const availableTerms = () => terms.filter((months) => bucketItems.every((item) => termsOf(item).includes(months)));
  const cashAllowed = () => formuleAutorisee('cash');

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
    // Le panier garde une copie du produit (localStorage) : on le remet à jour avec le catalogue actuel
    // pour que le paiement affiche les mêmes offres et mensualités que la page catalogue.
    bucketItems.forEach((item) => {
      const actuel = products.find((product) => product.reference === item.p.reference);
      if (actuel) item.p = actuel;
    });
    saveBucket();
    const allowed = availableTerms();
    const cashOk = cashAllowed();
    const rawDuration = panel.dataset.duration || '6';
    let duration = rawDuration === 'cash' ? 'cash' : Number(rawDuration);
    if ((duration === 'cash' && !cashOk) || (duration !== 'cash' && !allowed.includes(duration))) duration = allowed[0] ?? (cashOk ? 'cash' : 6);
    panel.dataset.duration = String(duration);
    panel.innerHTML = `<section class="bucket-panel"><div class="bucket-head"><h2>${L('Votre sélection', 'اختيارك')}</h2><span>${cartQuantity()} ${L('article(s)', 'منتج')}</span></div>${bucketItems.length ? `<div class="bucket-list">${bucketItems.map((item, index) => `<div class="bucket-row"><div><strong>${esc(item.p.name)}</strong><small>${item.p.reference}</small><span class="item-price">${duration === 'cash' ? L('Prix comptant', 'السعر نقداً') : L('Prix sur ' + duration + ' mois', 'السعر على ' + duration + ' شهراً')} : ${money(duration === 'cash' ? item.p.offerPrice : item.p.financing[duration === 6 ? '3/6' : String(duration)])} ${L('l’unité', 'للوحدة')}</span></div><div class="bucket-actions"><button data-cart-change="${index}" data-change="-1">−</button><span>${item.qty}</span><button data-cart-change="${index}" data-change="1">+</button><button data-cart-remove="${index}">×</button></div></div>`).join('')}</div>` : `<p class="bucket-empty">${L('Votre panier est vide.', 'سلتك فارغة.')}</p>`}${cashOk ? `<div class="bucket-total"><span>${L('Total comptant', 'الإجمالي نقداً')}</span><strong>${money(cashAmount())}</strong></div>` : ''}<div class="monthly-selector monthly-selector--titre"><span>${L('Durée de paiement', 'مدة الدفع')}</span></div><div class="bucket-payments four-payments" style="--cards:${allowed.length + (cashOk ? 1 : 0)}">${cashOk ? `<article class="${duration === 'cash' ? 'selected' : ''}" data-duration="cash" role="button" tabindex="0" aria-pressed="${duration === 'cash'}"><span class="pay-duree">${L('Comptant', 'نقداً')}</span><small class="pay-label">${L('Paiement en une fois', 'الدفع دفعة واحدة')}</small><strong dir="ltr">${money(cashAmount())}</strong></article>` : ''}${allowed.map((months) => { const discount = discountRate(months); return `<article class="${duration === months ? 'selected' : ''}" data-duration="${months}" role="button" tabindex="0" aria-pressed="${duration === months}"><span class="pay-duree">${months} ${L('mois', 'شهراً')}</span>${discount ? `<b class="discount-label">−${Math.round(discount * 10000) / 100}% ${L('remise', 'خصم')}</b>` : ''}<div class="card-monthly"><strong dir="ltr" class="monthly-amount">${money(paymentAmount(months))}</strong><small>${L('par mois', 'شهرياً')}</small></div><small class="pay-label">${L('Total de la formule', 'إجمالي الصيغة')}</small><strong dir="ltr">${money(financedTotal(months))}</strong></article>`; }).join('')}</div><form id="order-form" class="order-form"><h2>${L('Vos informations de retrait', 'معلومات الاستلام')}</h2><div class="order-fields"><label>${L('Nom et prénom *', 'الاسم واللقب *')}<input required name="name"></label><label>${L("Nom de l'entreprise *", 'اسم المؤسسة *')}<input required name="company"></label><label>${L('Ville / Wilaya *', 'المدينة / الولاية *')}<input required name="city"></label><label>${L('Numéro de téléphone *', 'رقم الهاتف *')}<input required name="phone"></label><label>${L('BrandShop de retrait *', 'متجر الاستلام *')}<select required name="shop"><option value="">${L('Choisissez votre BrandShop', 'اختر المتجر')}</option>${shops.map((shop) => `<option value="${esc(shop.name)}">${esc(shop.name)} — ${esc(shop.city)}</option>`).join('')}</select></label></div><button class="button order-download" ${bucketItems.length ? '' : 'disabled'}>${L('Imprimer / Enregistrer en PDF', 'طباعة / حفظ كملف PDF')} ↓</button></form></section>`;
    panel.querySelectorAll('[data-cart-change]').forEach((button) => button.onclick = () => { const item = bucketItems[Number(button.dataset.cartChange)]; item.qty += Number(button.dataset.change); if (item.qty < 1) bucketItems.splice(Number(button.dataset.cartChange), 1); saveBucket(); renderPayment(); });
    panel.querySelectorAll('[data-cart-remove]').forEach((button) => button.onclick = () => { bucketItems.splice(Number(button.dataset.cartRemove)); saveBucket(); renderPayment(); });
    // Chaque carte (comptant ou formule) est un bouton : le montant et la mensualité se choisissent d'un seul clic.
    panel.querySelectorAll('[data-duration]').forEach((card) => {
      const choisir = () => { panel.dataset.duration = card.dataset.duration; renderPayment(); };
      card.onclick = choisir;
      card.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choisir(); } };
    });
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
    $('#footer').innerHTML = `<div class="wrap"><div class="footer-row"><div><img src="assets/logo.png" alt="Samsung"><p>${L('Le catalogue Samsung pour les employés. Références, prix et facilités de paiement réunis au même endroit.', 'كتالوج سامسونج للموظفين.')}</p></div><div class="footer-contact"><strong>${L('Contact', 'اتصال')}</strong><span class="footer-role">${L('Gestionnaire de la convention', 'مسؤول الاتفاقية')}</span><a href="mailto:mohamed.selmani@sinova.dz">mohamed.selmani@sinova.dz</a><a href="tel:+213770720436">0770 72 04 36</a><span>ZEA, section 324, ilot 27, Sétif</span></div><div class="footer-contact"><strong>${L('Contact', 'اتصال')}</strong><span class="footer-role">B2B Manager</span><a href="mailto:Yacine.c@samsung.com">Yacine.c@samsung.com</a><a href="tel:+213770431269">0770 43 12 69</a><span>Tour CMA-CGM 8ème étage, Bab Ezzouar</span></div></div><div class="footer-bottom">${L('Prix en dinars algériens • Disponibilités à confirmer auprès du magasin.', 'الأسعار بالدينار الجزائري.')}</div></div>`;
  };
  render(false);
}());
