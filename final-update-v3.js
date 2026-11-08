'use strict';
(function () {
  function clean(value) { return String(value || '').replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]); }
  function printOrder(form) {
    if (!bucketItems.length) return;
    const shop = shops.find((item) => item.name === form.shop) || {};
    const rows = bucketItems.map((item) => `<tr><td>${clean(item.p.reference)}</td><td>${clean(item.p.name)}</td><td>${item.qty}</td><td>${money(item.p.offerPrice)}</td><td>${money(item.p.offerPrice * item.qty)}</td></tr>`).join('');
    const rawDuration = document.querySelector('#bucket-panel')?.dataset.duration || '6';
    const isCash = rawDuration === 'cash';
    const months = [6, 12, 18].includes(Number(rawDuration)) ? Number(rawDuration) : 6;
    let totalLine, monthlyLine;
    if (isCash) {
      const cashText = money(bucketItems.reduce((sum, item) => sum + item.p.offerPrice * item.qty, 0));
      totalLine = `Total comptant : ${cashText}`;
      monthlyLine = '';
    } else {
      const cardIndex = [6, 12, 18].indexOf(months) + 2;
      const totalStrong = document.querySelector(`.bucket-payments article:nth-child(${cardIndex}) > strong`);
      const monthlyStrong = document.querySelector(`.bucket-payments article:nth-child(${cardIndex}) .monthly-amount`);
      totalLine = `Total ${months} mois : ${totalStrong ? totalStrong.textContent : ''}`;
      monthlyLine = `<div class="monthly">Mensualité (${months} mois) : ${monthlyStrong ? monthlyStrong.textContent : ''}</div>`;
    }
    const logoUrl = new URL('assets/logo.png', window.location.href).href;
    const mapsUrl = shop.name ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.name + ' ' + shop.address + ' Algérie')}` : '';
    const qrUrl = mapsUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(mapsUrl)}` : '';
    const printable = window.open('', '_blank');
    if (!printable) return;
    printable.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bon d'enlèvement Samsung</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:Arial,sans-serif;color:#071332;margin:0}.sheet{min-height:273mm;display:flex;flex-direction:column}.header{background:#1428a0;color:#fff;border-radius:13px;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px}.header-brand{display:flex;align-items:center;gap:16px}.header-brand img{height:40px;display:block;background:#fff;border-radius:8px;padding:7px 12px}.header-text small{font-weight:700;font-size:9px;letter-spacing:.7px;display:block}.header-text h1{font-size:24px;margin:4px 0 0}.date{background:#fff;color:#111;padding:8px 12px;border-radius:4px;font-weight:700;white-space:nowrap}.boxes{display:grid;grid-template-columns:1fr 1fr auto;gap:15px;margin:18px 0}.box{border:1px solid #d7ddea;border-radius:10px;padding:12px;line-height:1.5;font-size:12px}.box b{display:block;color:#1428a0;font-size:9px;margin-bottom:5px}.qr-box{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:10px 14px}.qr-box img{width:88px;height:88px}.qr-box span{font-size:9px;color:#1428a0;font-weight:700;text-align:center;max-width:100px}h2{font-size:16px;margin:4px 0 10px}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#1428a0;color:#fff;text-align:left;padding:9px 7px}td{padding:8px 7px;border-bottom:1px solid #dce1ea}.totals{text-align:right;margin-top:14px;font-weight:700;font-size:13px}.monthly{color:#1428a0;font-size:17px;margin-top:6px}.signature{margin-top:auto;border-top:1px solid #1428a0;padding-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:55px;font-size:12px;font-weight:700}.signature div{min-height:62px;border-bottom:1px dashed #c3cddd}.note{margin-top:18px;border:1px solid #1428a0;border-radius:8px;padding:10px;font-size:9px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{break-inside:avoid}}</style></head><body><main class="sheet"><header class="header"><div class="header-brand"><img src="${logoUrl}" alt="Samsung"><div class="header-text"><small>SAMSUNG · DOCUMENT DE RETRAIT</small><h1>Bon d'enlèvement</h1></div></div><span class="date">Date : ${new Intl.DateTimeFormat('fr-FR').format(new Date())}</span></header><section class="boxes"><div class="box"><b>CLIENT</b>${clean(form.name)}<br>${clean(form.company)}<br>${clean(form.city)}<br>${clean(form.phone)}</div><div class="box"><b>RETRAIT</b>${clean(shop.name)}<br>${clean(shop.city)}<br>${clean(shop.phone)}</div>${qrUrl ? `<div class="box qr-box"><img src="${qrUrl}" alt="QR code itinéraire"><span>Scannez pour l'itinéraire</span></div>` : ''}</section><h2>Votre sélection</h2><table><thead><tr><th>Référence</th><th>Désignation</th><th>Qté</th><th>Prix unitaire</th><th>Montant</th></tr></thead><tbody>${rows}</tbody></table><div class="totals">${totalLine}${monthlyLine}</div><section class="signature"><div>Signature du bénéficiaire</div><div>Accusé du showroom</div></section><p class="note">Ce bon est valable 7 jours. Veuillez le présenter au BrandShop sélectionné avec les documents demandés par votre organisme.</p></main><script>window.onload=()=>window.print();<\/script></body></html>`);
    printable.document.close();
  }
  document.addEventListener('submit', (event) => {
    if (!event.target.matches('#order-form')) return;
    event.preventDefault();
    printOrder(Object.fromEntries(new FormData(event.target)));
  }, true);
  const previousPayments = payments;
  payments = function () {
    previousPayments();
    const subtitle = document.querySelector('.hero p');
    if (subtitle) subtitle.textContent = L('Ajoutez vos références, consultez les mensualités et imprimez votre bon (ou enregistrez-le en PDF).', 'أضف مراجعك، اعرض الأقساط واطبع سندك (أو احفظه كملف PDF).');
    const button = document.querySelector('.order-download');
    if (button) button.textContent = L('Imprimer / Enregistrer en PDF', 'طباعة / حفظ كملف PDF');
  };
  render(false);
}());
