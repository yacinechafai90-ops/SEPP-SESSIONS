'use strict';
/* Cart, monthly payment and printable order form enhancement for the static Netlify catalogue. */
(function () {
  const monthOptions = [6, 12, 18];
  const cartCount = () => bucketItems.reduce((sum, item) => sum + item.qty, 0);
  const cashTotal = () => bucketItems.reduce((sum, item) => sum + item.p.offerPrice * item.qty, 0);
  const monthly = (months) => {
    const durationIndex = monthOptions.indexOf(months);
    return bucketItems.reduce((sum, item) => {
      const statedAmount = window.MONTHLY_PAYMENT_TABLE?.[item.p.reference]?.[durationIndex];
      const fallback = Math.round(item.p.financing[months === 6 ? '3/6' : String(months)] / months);
      return sum + (statedAmount ?? fallback) * item.qty;
    }, 0);
  };
  const escapeHtml = (value) => String(value || 'Non renseigné').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

  function addProduct(product) {
    const found = bucketItems.find((item) => item.p.reference === product.reference);
    if (found) found.qty += 1;
    else bucketItems.push({ p: product, qty: 1 });
    saveBucket();
  }

  const previousCard = card;
  card = function (product) {
    const html = previousCard(product);
    return html.replace('</article>', `<div class="catalogue-cart-action"><button type="button" class="cart-button" data-add-product="${escapeHtml(product.reference)}">${L('Ajouter au panier','إضافة إلى السلة')} +</button></div></article>`);
  };

  const previousGrid = updateGrid;
  updateGrid = function () {
    previousGrid();
    document.querySelectorAll('[data-add-product]').forEach((button) => {
      button.onclick = () => {
        const product = products.find((item) => item.reference === button.dataset.addProduct);
        if (!product) return;
        addProduct(product);
        button.textContent = L('Ajouté au panier ✓', 'تمت الإضافة ✓');
        button.classList.add('added');
        window.setTimeout(() => { button.textContent = L('Ajouter au panier', 'إضافة إلى السلة') + ' +'; button.classList.remove('added'); }, 1400);
      };
    });
  };

  function downloadOrder(form, duration) {
    if (!bucketItems.length) return;
    const shop = shops.find((item) => item.name === form.shop);
    const rows = bucketItems.map((item) => `<tr><td>${escapeHtml(item.p.reference)}</td><td>${escapeHtml(item.p.name)}</td><td>${item.qty}</td><td>${money(item.p.offerPrice)}</td><td>${money(item.p.offerPrice * item.qty)}</td></tr>`).join('');
    const logoUrl = new URL('assets/logo.png', window.location.href).href;
    const today = new Intl.DateTimeFormat('fr-FR').format(new Date());
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bon d'enlèvement Samsung</title><style>body{margin:0;background:#f5f6f9;color:#101726;font-family:Arial,sans-serif}.sheet{max-width:900px;margin:30px auto;background:#fff;padding:42px;box-shadow:0 10px 30px #1428a022}.head{background:#1428a0;color:#fff;border-radius:18px;padding:28px;position:relative}.logo{position:absolute;right:28px;top:24px;width:128px;background:#fff;border-radius:4px;padding:5px 9px}.date{margin-top:10px;font-size:13px}.head small{font-weight:bold;letter-spacing:1px}.head h1{font-size:32px;margin:8px 0 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:28px 0}.box{border:1px solid #e2e6ed;border-radius:12px;padding:16px;line-height:1.6}.box b{display:block;color:#1428a0;font-size:12px;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin-top:18px}th{background:#1428a0;color:#fff;text-align:left;padding:12px;font-size:12px}td{padding:12px;border-bottom:1px solid #e2e6ed;font-size:13px}.totals{text-align:right;margin-top:25px;font-size:18px;font-weight:bold}.monthly{color:#1428a0;font-size:22px;margin-top:8px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:55px;margin-top:88px;font-size:16px;font-weight:bold}.signatures div{border-top:1px solid #1428a0;padding:14px 8px;min-height:90px}.note{margin-top:32px;border:1px solid #1428a0;border-radius:10px;padding:15px;font-size:12px;line-height:1.5}@media print{body{background:#fff}.sheet{box-shadow:none;margin:0}}</style></head><body><main class="sheet"><header class="head"><img class="logo" src="${logoUrl}" alt="Samsung"><small>SAMSUNG · DOCUMENT DE RETRAIT</small><h1>Bon d'enlèvement</h1><div class="date">Date : ${today}</div></header><section class="grid"><div class="box"><b>Client</b>${escapeHtml(form.name)}<br>${escapeHtml(form.company)}<br>${escapeHtml(form.city)}</div><div class="box"><b>Retrait</b>${escapeHtml(shop?.name)}<br>${escapeHtml(shop?.city)}<br>${escapeHtml(form.phone)}</div></section><h2>Votre sélection</h2><table><thead><tr><th>Référence</th><th>Désignation</th><th>Qté</th><th>Prix unitaire</th><th>Montant</th></tr></thead><tbody>${rows}</tbody></table><div class="totals">Total : ${money(cashTotal())}<div class="monthly">Mensualité (${duration} mois) : ${money(monthly(duration))}</div></div><section class="signatures"><div>Signature du bénéficiaire</div><div>Accusé du showroom</div></section><p class="note">Ce bon est valable 7 jours. Veuillez le présenter au BrandShop sélectionné avec les documents demandés par votre organisme.</p></main></body></html>`;
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), download: 'bon-enlevement-samsung.html' });
    link.click(); window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function renderOrder() {
    const panel = document.querySelector('#bucket-panel');
    if (!panel) return;
    const duration = Number(panel.dataset.duration || 6);
    panel.innerHTML = `<section class="bucket-panel"><div class="bucket-head"><h2>${L('Votre sélection','اختيارك')}</h2><span>${cartCount()} ${L('article(s)','منتج')}</span></div>${bucketItems.length ? `<div class="bucket-list">${bucketItems.map((item, index) => `<div class="bucket-row"><div><strong>${escapeHtml(item.p.name)}</strong><small dir="ltr">${escapeHtml(item.p.reference)}</small></div><div class="bucket-actions"><button type="button" data-cart-change="${index}" data-change="-1">−</button><span>${item.qty}</span><button type="button" data-cart-change="${index}" data-change="1">+</button><button type="button" data-cart-remove="${index}">×</button></div></div>`).join('')}</div>` : `<p class="bucket-empty">${L('Votre panier est vide. Ajoutez une référence depuis le catalogue.','سلتك فارغة. أضف مرجعاً من الكتالوج.')}</p>`}<div class="bucket-total"><span>${L('Total comptant','الإجمالي نقداً')}</span><strong dir="ltr">${money(cashTotal())}</strong></div><div class="monthly-selector"><span>${L('Durée de paiement','مدة الدفع')}</span><div>${monthOptions.map((months) => `<button type="button" class="${duration === months ? 'active' : ''}" data-duration="${months}">${months} ${L('mois','شهراً')}</button>`).join('')}</div></div><div class="bucket-payments">${monthOptions.map((months) => `<article class="${duration === months ? 'selected' : ''}"><span>${months} ${L('mois','شهراً')}</span><strong dir="ltr">${money(monthly(months))}</strong><small>${L('par mois','شهرياً')}</small></article>`).join('')}</div><form id="order-form" class="order-form"><h2>${L('Vos informations de retrait','معلومات الاستلام')}</h2><div class="order-fields"><label>${L('Nom et prénom *','الاسم واللقب *')}<input required name="name" placeholder="Ex. Mohamed Benali"></label><label>${L("Nom de l'entreprise *",'اسم المؤسسة *')}<input required name="company" placeholder="Ex. Sonatrach / Ministère"></label><label>${L('Ville / Wilaya *','المدينة / الولاية *')}<input required name="city" placeholder="Ex. Alger"></label><label>${L('Numéro de téléphone *','رقم الهاتف *')}<input required name="phone" placeholder="06 XX XX XX XX"></label><label>${L('BrandShop de retrait *','متجر الاستلام *')}<select required name="shop"><option value="">${L('Choisissez votre BrandShop','اختر المتجر')}</option>${shops.map((shop) => `<option value="${escapeHtml(shop.name)}">${escapeHtml(shop.name)} — ${escapeHtml(shop.city)}</option>`).join('')}</select></label></div><button class="button order-download" ${bucketItems.length ? '' : 'disabled'}>${L('Télécharger mon bon','تحميل طلبي')} ↓</button><small>${L('Le fichier reprend votre sélection et peut être imprimé ou enregistré en PDF.','يتضمن الملف اختيارك ويمكن طباعته أو حفظه كملف PDF.')}</small></form></section>`;
    panel.querySelectorAll('[data-cart-change]').forEach((button) => button.onclick = () => { const item = bucketItems[Number(button.dataset.cartChange)]; item.qty += Number(button.dataset.change); if (item.qty < 1) bucketItems.splice(Number(button.dataset.cartChange), 1); saveBucket(); renderOrder(); });
    panel.querySelectorAll('[data-cart-remove]').forEach((button) => button.onclick = () => { bucketItems.splice(Number(button.dataset.cartRemove), 1); saveBucket(); renderOrder(); });
    panel.querySelectorAll('[data-duration]').forEach((button) => button.onclick = () => { panel.dataset.duration = button.dataset.duration; renderOrder(); });
    const form = panel.querySelector('#order-form'); if (form) form.onsubmit = (event) => { event.preventDefault(); downloadOrder(Object.fromEntries(new FormData(form)), Number(panel.dataset.duration || 6)); };
  }

  payments = function () {
    $('#main').innerHTML = hero(L('Solutions de paiement','حلول الدفع'), L('Ajoutez vos références, calculez vos mensualités et préparez votre bon de retrait.','أضف مراجعك، احسب أقساطك، وجهّز سند الاستلام.'), L('Paiement','الدفع')) + `<div class="wrap content"><div class="payment-intro"><div><label for="payment-product">${L('Choisir une référence','اختيار مرجع')}</label><select id="payment-product">${products.map((product) => `<option value="${product.reference}">${product.reference} — ${escapeHtml(product.name)}</option>`).join('')}</select><button type="button" id="add-to-bucket" class="button bucket-add">${L('Ajouter au panier','إضافة إلى السلة')} +</button></div><aside class="good-to-know"><h2>${ico('info')}${L('Facilités de paiement','معلومات الدفع')}</h2><ul><li>${L('Ajoutez plusieurs références pour obtenir un total groupé.','أضف عدة مراجع للحصول على إجمالي موحد.')}</li><li>${L('Chaque mensualité est égale au total de votre sélection divisé par la durée choisie.','كل قسط يساوي إجمالي اختيارك مقسوماً على المدة المختارة.')}</li></ul></aside></div><div id="bucket-panel" data-duration="6"></div></div>`;
    $('#add-to-bucket').onclick = () => { const product = products.find((item) => item.reference === $('#payment-product').value); addProduct(product); renderOrder(); };
    renderOrder();
  };
  render(false);
}());
