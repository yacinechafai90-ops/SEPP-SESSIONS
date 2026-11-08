'use strict';

/* Correction limitée à l'affichage des photos des produits. */
(function () {
  photo = function (p, detail = false) {
    if (!p.image) return '';

    return `
      <span class="product-photo ${detail ? 'product-photo-detail' : ''}">
        <img
          src="${esc(p.image)}"
          alt="${esc(p.reference + ' — ' + p.name)}"
          loading="${detail ? 'eager' : 'lazy'}"
          decoding="async">
      </span>
    `;
  };

  bindImages = function () {
    document.querySelectorAll('.product-photo img').forEach(img => {
      img.onerror = () => {
        const parent = img.closest('.product-photo');

        if (parent) {
          parent.innerHTML = `
            <p class="photo-failure">
              ${L(
                'La photographie ne peut pas être chargée.',
                'تعذر تحميل الصورة.'
              )}
            </p>
          `;
        }
      };
    });
  };

  const style = document.createElement('style');
  style.id = 'catalogue-product-photo-fix';

  style.textContent = `
    .media > .product-photo,
    .detail-photo > .product-photo {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 100% !important;
      min-width: 0 !important;
      min-height: 0 !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }

    .media > .product-photo {
      height: 100% !important;
    }

    .detail-photo > .product-photo {
      height: 310px !important;
    }

    .product-photo > img {
      display: block !important;
      position: static !important;
      width: 100% !important;
      height: 100% !important;
      max-width: 100% !important;
      max-height: 100% !important;
      object-fit: contain !important;
      object-position: center !important;
      transform: none !important;
      left: auto !important;
      top: auto !important;
      margin: 0 !important;
    }
  `;

  document.head.appendChild(style);
})();

const iconPaths = {
  shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z M8 12l3 3 5-6',
  pin: 'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  phone: 'M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4c-10 3-20-7-16-16Z',
  mail: 'M3 5h18v14H3V5Z M3 6l9 7 9-7',
  arrow: 'm4 12 16-8-8 16-1-7-7-1Z',
  wallet: 'M3 6h17v14H3V6Z M3 6V3h14v3 M15 11h6v5h-6v-5Z',
  calendar: 'M4 5h16v16H4V5Z M8 2v6 M16 2v6 M4 10h16 M8 14h2 M14 14h2 M8 17h2',
  clipboard: 'M8 4H4v17h16V4h-4 M8 2h8v5H8V2Z M8 11h8 M8 15h8',
  person: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M4 21v-3c0-5 12-5 12 0 M17 13l2 2 3-4',
  package: 'm3 7 9-4 9 4v10l-9 4-9-4V7Z M3 7l9 5 9-5 M12 12v9 M7 5l9 5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 11v6 M12 7v1'
};

function ico(name) {
  return `
    <svg width="21" height="21" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">
      <path d="${iconPaths[name] || iconPaths.info}"/>
    </svg>
  `;
}

const refText = () => window.REFERENCE_CONTENT[lang];

navItems.push(['/smarthings', 'SmartThings', 'SmartThings']);

card = function (p) {
  return `
    <article class="card" data-ref="${p.reference}">
      <a class="card-link" href="#/produit/${p.reference}">
        ${
          p.image
            ? `<div class="media">${photo(p)}</div>`
            : `
              <div class="text-only">
                <div>
                  <strong>${p.reference}</strong>
                  <p>${L(
                    'Photographie non fournie',
                    'لم تُقدّم صورة للمنتج'
                  )}</p>
                </div>
              </div>
            `
        }

        <div class="card-body">
          <div class="tag-row">
            <span class="reference pill" dir="ltr">${p.reference}</span>
            <span class="category pill">${cat(p.category)}</span>
          </div>

          <h2>${esc(p.name)}</h2>

          <div class="price-inline">
            <s class="old-price" dir="ltr"
              aria-label="${L('Prix showroom', 'سعر المعرض')}">
              ${money(p.marketPrice)}
            </s>

            <strong class="price" dir="ltr"
              aria-label="${L('Prix remisé', 'السعر المخفض')}">
              ${money(p.offerPrice)}
            </strong>
          </div>

          <div class="tag-row bottom-tags">
            <span class="warranty-tag">
              ${ico('shield')}${L('24 mois', '24 شهراً')}
            </span>
            ${stock(p)}
          </div>
        </div>
      </a>
    </article>
  `;
};

finance = function (p) {
  return `
    <section class="finance">
      <h2>${L('Facilités de paiement', 'تسهيلات الدفع')}</h2>

      <div class="pay-cards">
        ${window.REFERENCE_CONTENT.payments.methods.map((m, i) => {
          const months = m.id === '6'
            ? 6
            : m.id === '12'
              ? 12
              : m.id === '18'
                ? 18
                : 0;

          const total = i
            ? p.financing[m.id === '6' ? '3/6' : m.id]
            : p.offerPrice;

          const amount = months ? Math.floor(total / months) : total;

          return `
            <article class="pay-card">
              <div class="pay-card-top">
                <span class="icon-tile">
                  ${ico(i ? 'calendar' : 'wallet')}
                </span>

                <strong dir="ltr">${money(amount)}</strong>

                ${
                  months
                    ? `<small class="fee-label">${L('par mois', 'شهرياً')}</small>`
                    : ''
                }
              </div>

              <h3>${esc(m['label' + (lang === 'fr' ? 'Fr' : 'Ar')])}</h3>
              <p>${esc(m['description' + (lang === 'fr' ? 'Fr' : 'Ar')])}</p>
            </article>
          `;
        }).join('')}
      </div>

      <p class="note total-caption">
        ${L(
          'Mensualité calculée sans décimales à partir du total de la formule.',
          'قسط شهري محسوب دون أرقام عشرية من إجمالي الصيغة.'
        )}
      </p>
    </section>
  `;
};

payments = function () {
  $('#main').innerHTML =
    hero(
      L('Solutions de paiement', 'حلول الدفع'),
      L(
        'Choisissez votre référence et découvrez les formules de paiement.',
        'اختر مرجعك واكتشف صيغ الدفع.'
      ),
      L('Paiement', 'الدفع')
    ) +
    `
      <div class="wrap content">
        <div class="payment-intro">
          <div>
            <label for="payment-product">
              ${L('Choisir une référence', 'اختيار مرجع')}
            </label>

            <select id="payment-product">
              ${products.map(p => `
                <option value="${p.reference}">
                  ${p.reference} — ${esc(p.name)}
                </option>
              `).join('')}
            </select>
          </div>

          <aside class="good-to-know">
            <h2>${ico('info')}${L('Bon à savoir', 'معلومات مفيدة')}</h2>

            <ul>
              <li>${L(
                'Les montants affichés correspondent au coût total de chaque formule de paiement.',
                'المبالغ المعروضة تمثل التكلفة الإجمالية لكل صيغة دفع.'
              )}</li>

              <li>${L(
                'Le paiement échelonné est prélevé directement sur le salaire de l’employé, sans démarche bancaire supplémentaire.',
                'يُخصم الدفع بالتقسيط مباشرة من راتب الموظف، دون إجراءات بنكية إضافية.'
              )}</li>
            </ul>
          </aside>
        </div>

        <div id="payment-result"></div>
      </div>
    `;

  function change() {
    const p = products.find(
      p => p.reference === $('#payment-product').value
    );

    $('#payment-result').innerHTML = finance(p);

    $('#payment-result').animate(
      [
        { opacity: .35, transform: 'translateY(5px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      {
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 0
          : 180
      }
    );
  }

  $('#payment-product').onchange = change;
  change();
};

brandshops = function () {
  $('#main').innerHTML =
    hero(
      L('Nos BrandShops', 'متاجرنا'),
      L(
        '16 points de vente à travers l’Algérie pour retirer votre produit et être accompagné par nos équipes.',
        '16 نقطة بيع عبر الجزائر لاستلام منتجك والحصول على مساعدة فرقنا.'
      ),
      L('Réseau', 'الشبكة')
    ) +
    `
      <div class="wrap content">
        <div class="shop-filter">
          <label for="city">
            ${L('Filtrer par ville', 'تصفية حسب المدينة')}
          </label>

          <select id="city">
            <option value="all">
              ${L('Toutes les villes', 'جميع المدن')}
            </option>

            ${[...new Set(shops.map(s => s.city))]
              .sort()
              .map(c => `<option>${esc(c)}</option>`)
              .join('')}
          </select>

          <span id="shop-count" role="status"></span>
        </div>

        <div class="shop-grid" id="shops"></div>
      </div>
    `;

  function list() {
    const list = shops.filter(
      s => $('#city').value === 'all' || s.city === $('#city').value
    );

    $('#shop-count').textContent = L(
      list.length + ' magasins',
      list.length + ' متاجر'
    );

    $('#shops').innerHTML = list.map(s => `
      <article class="info-card shop">
        <div class="shop-title">
          <h2>${esc(s.name)}</h2>
          <span class="pill">${esc(s.city)}</span>
        </div>

        <p class="address">
          ${ico('pin')}<span>${esc(s.address)}</span>
        </p>

        <div class="contact">
          <span class="contact-label">
            ${L('CONTACT', 'جهة الاتصال')}
          </span>

          <p>${esc(s.contactName)}</p>

          <p>
            <a href="tel:+213${s.phone.slice(1)}">
              ${ico('phone')}<span dir="ltr">${s.phone}</span>
            </a>
          </p>

          ${
            s.email
              ? `
                <p>
                  <a href="mailto:${esc(s.email)}">
                    ${ico('mail')}<span>${esc(s.email)}</span>
                  </a>
                </p>
              `
              : ''
          }
        </div>

        <a class="directions"
          href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            s.name + ' ' + s.address + ' Algérie'
          )}"
          target="_blank" rel="noopener noreferrer">
          ${ico('arrow')}${L('Itinéraire', 'الاتجاهات')}
        </a>
      </article>
    `).join('');
  }

  $('#city').onchange = list;
  list();
};

information = function (warranty) {
  const t = refText();

  if (!warranty) {
    $('#main').innerHTML =
      hero(
        esc(t.process.title),
        esc(t.process.subtitle),
        esc(t.process.kicker)
      ) +
      `
        <section class="wrap process-content">
          <ol class="timeline">
            ${t.process.steps.map((s, i) => `
              <li>
                <div class="step-marker">
                  <span>${s.num}</span>
                  <div>
                    ${ico(['clipboard', 'person', 'shield', 'package'][i])}
                  </div>
                </div>

                <div>
                  <h2>${esc(s.title)}</h2>
                  <p>${esc(s.desc)}</p>
                </div>
              </li>
            `).join('')}
          </ol>

          <a class="button" href="#/catalogue">
            ${L('Découvrir le catalogue', 'اكتشاف الكتالوج')} →
          </a>
        </section>
      `;

    return;
  }

  const w = t.warranty;

  $('#main').innerHTML =
    hero(esc(w.title), esc(w.subtitle), esc(w.kicker)) +
    `
      <section class="wrap content warranty-content">
        <div class="warranty-standard">
          ${ico('shield')}

          <div>
            <h2>${esc(w.standardTitle)}</h2>
            <p>${esc(w.standardDesc)}</p>
          </div>
        </div>

        <h2 class="section-title">${esc(w.extendedTitle)}</h2>
        <p class="warranty-intro">${esc(w.extendedIntro)}</p>

        <div class="info-grid">
          ${w.highlights.map(h => `
            <article class="info-card warranty-highlight">
              ${ico('shield')}
              <h3>${esc(h.title)}</h3>
              <p>${esc(h.text)}</p>
            </article>
          `).join('')}
        </div>

        <div class="warranty-table-scroll">
          <table class="warranty-table">
            <thead>
              <tr>
                <th>${esc(w.tableCategory)}</th>
                <th>${esc(w.tableStandard)}</th>
                <th>${esc(w.tableExtended)}</th>
              </tr>
            </thead>

            <tbody>
              ${categories.map(c => `
                <tr>
                  <td>${cat(c)}</td>
                  <td>${L(
                    'Garantie standard 24 mois',
                    'ضمان قياسي لمدة 24 شهراً'
                  )}</td>
                  <td>${
                    ['Climatiseurs', 'Réfrigérateurs'].includes(c)
                      ? L(
                          '10 ans sur le compresseur Digital Inverter',
                          '10 سنوات على ضاغط Digital Inverter'
                        )
                      : c === 'Lave-linge'
                        ? L(
                            '10 ans sur le moteur Digital Inverter',
                            '10 سنوات على محرك Digital Inverter'
                          )
                        : '—'
                  }</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="service-card">
          <span class="icon-tile">${ico('phone')}</span>

          <div>
            <span class="service-label">${esc(w.serviceTitle)}</span>
            <p>${esc(w.serviceDesc)}</p>
          </div>

          <a href="tel:0800100001">
            <span>${esc(w.servicePhoneLabel)}</span>
            <strong dir="ltr">0800 100 001</strong>
          </a>
        </div>
      </section>
    `;
};

const oldHome = home;

home = function () {
  if (window.samsungHomeCarouselTimer) {
    clearInterval(window.samsungHomeCarouselTimer);
  }

  oldHome();

  const section = $('#main .hero');
  section.classList.add('tv-home');

  const slides = [
    {
      src: 'assets/banners/1.png',
      alt: 'SmartThings : la maison connectée'
    },
    {
      src: 'assets/banners/2.jpeg',
      alt: 'Samsung, 20 ans numéro un mondial de la télévision'
    },
    {
      src: 'assets/banners/3.jpeg',
      alt: 'Réfrigérateur Samsung RT49 Black'
    },
    {
      src: 'assets/banners/4.png',
      alt: 'Samsung, marque la plus récompensée'
    },
    {
      src: 'assets/banners/5.jpeg',
      alt: 'La technologie Samsung au cœur du quotidien'
    }
  ];

  section.innerHTML = `
    <div class="tv-art" aria-label="Bannières Samsung">
      <img class="tv-carousel-image is-visible"
        src="${slides[0].src}" alt="${slides[0].alt}">

      <div class="tv-carousel-controls" role="tablist"
        aria-label="Choisir une bannière">
        ${slides.map((slide, i) => `
          <button type="button"
            data-tv-slide="${i}"
            aria-label="Bannière ${i + 1}"
            aria-current="${i === 0 ? 'true' : 'false'}">
          </button>
        `).join('')}
      </div>
    </div>

    <div class="wrap tv-home-caption">
      <span class="eyebrow">
        ${L('Offres employés · Algérie', 'عروض الموظفين · الجزائر')}
      </span>

      <h1>${L(
        'Samsung, pour votre quotidien.',
        'سامسونج، لحياتك اليومية.'
      )}</h1>

      <div class="hero-actions">
        <a class="button" href="#/catalogue">
          ${L('Découvrir le catalogue', 'اكتشاف الكتالوج')} →
        </a>

        <a class="button secondary" href="#/smarthings">
          ${L('Découvrir SmartThings', 'اكتشاف SmartThings')} ↗
        </a>
      </div>
    </div>
  `;

  const image = section.querySelector('.tv-carousel-image');
  const dots = [...section.querySelectorAll('[data-tv-slide]')];
  let active = 0;

  const show = i => {
    active = (i + slides.length) % slides.length;
    image.classList.remove('is-visible');

    setTimeout(() => {
      image.src = slides[active].src;
      image.alt = slides[active].alt;
      image.classList.add('is-visible');
    }, 180);

    dots.forEach((dot, n) => {
      dot.setAttribute('aria-current', n === active ? 'true' : 'false');
    });
  };

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      show(Number(dot.dataset.tvSlide));

      clearInterval(window.samsungHomeCarouselTimer);

      window.samsungHomeCarouselTimer = setInterval(
        () => show(active + 1),
        6000
      );
    });
  });

  window.samsungHomeCarouselTimer = setInterval(
    () => show(active + 1),
    6000
  );
};

function artCrop(source, x, y, w, h, iw = 499, ih = 881) {
  return `
    <div class="smart-art" style="aspect-ratio:${w}/${h}">
      <img src="${source}" alt="" loading="lazy"
        style="width:${iw / w * 100}%;height:${ih / h * 100}%;left:${-x / w * 100}%;top:${-y / h * 100}%">
    </div>
  `;
}

function smartthings() {
  const items = [
    [
      '1. Connectez-vous en toute simplicité',
      'Connectez vos appareils et gérez votre consommation.',
      13, 465, 228, 152
    ],
    [
      'Votre famille vs vos familles',
      'Pour toute la famille.',
      249, 465, 228, 152
    ],
    [
      '3. Gérez votre domicile en 3D',
      'Gérez vos appareils depuis votre plan 3D.',
      13, 673, 228, 151
    ],
    [
      'Contrôlez vos appareils',
      'Votre télécommande, directement dans SmartThings.',
      249, 673, 228, 151
    ]
  ];

  $('#main').innerHTML = `
    <section class="wrap smart-page">
      <span class="eyebrow">SMARTTHINGS</span>

      <h1>${L(
        "SmartThings. Découvrez l'application",
        'SmartThings. اكتشف التطبيق'
      )}</h1>

      <p class="smart-subtitle">${L(
        'Simplifiez-vous la vie avec SmartThings',
        'بسّط حياتك مع SmartThings'
      )}</p>

      <nav class="smart-tabs" aria-label="SmartThings">
        ${[
          ['Home Insight', 'insight', 'info'],
          ['Easy Control', 'connected', 'wallet'],
          ['Les routines', 'connected', 'calendar'],
          ["L’écosystème", 'connected', 'package'],
          ['Sécurité', 'connected', 'shield']
        ].map(([name, id, icon]) => `
          <a href="#${id}" data-scroll="${id}">
            <span>${ico(icon)}</span>${name}
          </a>
        `).join('')}
      </nav>

      <section id="insight">
        <h2>${L(
          'Conseils pour améliorer votre quotidien',
          'نصائح لتحسين حياتك اليومية'
        )}</h2>

        <p>${L(
          'Home Insight vous donne des recommandations, gère les appareils 24 heures sur 24 et 7 jours sur 7¹.',
          'يقدم Home Insight توصيات ويدير الأجهزة على مدار الساعة.'
        )}</p>

        ${artCrop('assets/smart-insight.png', 33, 370, 962, 426, 1029, 818)}
      </section>

      <section id="connected">
        <h2>${L('Connectez-vous facilement', 'اتصل بسهولة')}</h2>

        <div class="smart-grid">
          ${items.map(([title, desc, x, y, w, h], i) => `
            <article>
              ${artCrop('assets/smart-reference.png', x, y, w, h)}
              <h3>${esc(title)}</h3>
              <p>${esc(desc)}</p>

              <button class="smart-expand" data-smart="${i}">
                ${L('Agrandir le visuel', 'تكبير الصورة')} ↗
              </button>
            </article>
          `).join('')}
        </div>
      </section>

      <dialog id="smart-dialog">
        <button class="dialog-close"
          aria-label="${L('Fermer', 'إغلاق')}">×</button>
        <div id="smart-dialog-content"></div>
      </dialog>
    </section>
  `;

  document.querySelectorAll('[data-scroll]').forEach(a => {
    a.onclick = e => {
      e.preventDefault();

      document.getElementById(a.dataset.scroll).scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth'
      });
    };
  });

  document.querySelectorAll('[data-smart]').forEach(b => {
    b.onclick = () => {
      const [title, desc, x, y, w, h] = items[Number(b.dataset.smart)];

      $('#smart-dialog-content').innerHTML =
        artCrop('assets/smart-reference.png', x, y, w, h) +
        `<h2>${esc(title)}</h2>`;

      $('#smart-dialog').showModal();
    };
  });

  $('.dialog-close').onclick = () => $('#smart-dialog').close();

  $('#smart-dialog').onclick = e => {
    if (e.target === $('#smart-dialog')) {
      $('#smart-dialog').close();
    }
  };
}

/* Catalogue enhancements: subcategories, bucket totals, simulator and contact footer. */

function subCategory(p) {
  const n = String(p.name || '').toLowerCase();

  if (p.category === 'Téléviseurs') {
    if (/neo\s*qled/.test(n)) return 'Neo QLED';
    if (/\boled\b|\bo led\b|\bo\s*serie/.test(n)) return 'OLED';
    if (/\bqled\b/.test(n)) return 'QLED';
    if (/crystal/.test(n)) return 'Crystal LED';
  }

  if (p.category === 'Lave-linge') {
    return /top/i.test(n)
      ? 'Top Load'
      : /front/i.test(n)
        ? 'Front Load'
        : null;
  }

  if (p.category === 'Aspirateurs') {
    return /canister/i.test(n)
      ? 'Canister'
      : /stick|jet/i.test(n)
        ? 'Jet Stick'
        : null;
  }

  if (p.category === 'Climatiseurs') {
    return /wind\s*free/i.test(n) ? 'WindFree' : null;
  }

  if (p.category === 'Micro-ondes') {
    const m = n.match(/(\d{2})\s*l/);
    return m ? m[1] + ' L' : null;
  }

  if (p.category === 'Réfrigérateurs') {
    const m = n.match(/(\d{3,4})\s*l/);
    return m ? m[1] + ' L' : null;
  }

  return null;
}

function subCategoryOptions(category) {
  return [...new Set(
    products
      .filter(p => category === 'all' || p.category === category)
      .map(subCategory)
      .filter(Boolean)
  )];
}

const baseCard = card;

card = function (p) {
  const sub = subCategory(p);

  return `
    <article class="card" data-ref="${p.reference}">
      <a class="card-link" href="#/produit/${p.reference}">
        ${
          p.image
            ? `<div class="media">${photo(p)}</div>`
            : `
              <div class="text-only">
                <div>
                  <strong>${p.reference}</strong>
                  <p>${L(
                    'Photographie non fournie',
                    'لم تُقدّم صورة للمنتج'
                  )}</p>
                </div>
              </div>
            `
        }

        <div class="card-body">
          <div class="tag-row">
            <span class="reference pill" dir="ltr">${p.reference}</span>
            <span class="category pill">${cat(p.category)}</span>
            ${
              sub
                ? `<span class="subcategory pill">${esc(sub)}</span>`
                : ''
            }
          </div>

          <h2>${esc(p.name)}</h2>

          <div class="price-inline">
            <s class="old-price" dir="ltr"
              aria-label="${L('Prix showroom', 'سعر المعرض')}">
              ${money(p.marketPrice)}
            </s>

            <strong class="price" dir="ltr"
              aria-label="${L('Prix remisé', 'السعر المخفض')}">
              ${money(p.offerPrice)}
            </strong>
          </div>

          <div class="tag-row bottom-tags">
            <span class="warranty-tag">
              ${ico('shield')}${L('24 mois', '24 شهراً')}
            </span>
            ${stock(p)}
          </div>
        </div>
      </a>
    </article>
  `;
};

function renderSubcategoryTabs() {
  const box = $('#subcategories');
  if (!box) return;

  const options = subCategoryOptions(state.category);

  box.innerHTML = options.length
    ? `
      <div class="subcat-label">
        ${L('Sous-catégorie', 'الفئة الفرعية')}
      </div>

      <button data-subcategory="all"
        class="${state.subCategory === 'all' ? 'active' : ''}"
        aria-pressed="${state.subCategory === 'all'}">
        ${L('Toutes', 'الكل')}
      </button>

      ${options.map(x => `
        <button data-subcategory="${esc(x)}"
          class="${state.subCategory === x ? 'active' : ''}"
          aria-pressed="${state.subCategory === x}">
          ${esc(x)}
        </button>
      `).join('')}
    `
    : '';

  box.querySelectorAll('[data-subcategory]').forEach(b => {
    b.onclick = () => {
      state.subCategory = b.dataset.subcategory;
      renderSubcategoryTabs();
      updateGrid();
    };
  });
}

catalogue = function () {
  state.subCategory = state.subCategory || 'all';

  const search = `
    <div class="search">
      <svg width="18" height="18" viewBox="0 0 24 24"
        fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="6.5"
          stroke="currentColor" stroke-width="1.5"/>
        <path d="m15 15 5 5"
          stroke="currentColor" stroke-width="1.5"/>
      </svg>

      <input id="search" type="search"
        value="${esc(state.query)}"
        placeholder="${L(
          'Rechercher un produit ou une référence…',
          'ابحث عن منتج أو مرجع…'
        )}"
        aria-label="${L(
          'Rechercher un produit أو مرجع',
          'البحث عن منتج أو مرجع'
        )}">
    </div>

    <div class="tabs" role="group"
      aria-label="${L('Catégories', 'الفئات')}">
      ${['all', ...categories].map(c => `
        <button data-category="${c}"
          class="${c === state.category ? 'active' : ''}"
          aria-pressed="${c === state.category}">
          ${c === 'all' ? L('Tout', 'الكل') : cat(c)}
        </button>
      `).join('')}
    </div>

    <div class="subcategories" id="subcategories" role="group"
      aria-label="${L('Sous-catégories', 'الفئات الفرعية')}">
    </div>
  `;

  $('#main').innerHTML =
    hero(
      L('Le catalogue Samsung', 'كتالوج سامسونج'),
      L(
        'Découvrez votre prochain équipement. Retrouvez les références, les prix remisés et les facilités de paiement.',
        'اكتشف جهازك القادم. تصفّح المراجع والأسعار المخفضة وتسهيلات الدفع.'
      ),
      L('Offres employés · Algérie', 'عروض الموظفين · الجزائر'),
      search
    ) +
    `
      <section class="wrap">
        <div class="toolbar">
          <div class="results" id="results"
            role="status" aria-live="polite">
          </div>

          <div class="controls">
            <label for="stock">${L('Disponibilité', 'التوفر')}</label>

            <select id="stock">
              <option value="all">
                ${L('Toutes disponibilités', 'جميع الحالات')}
              </option>

              <option value="available">
                ${L('Disponible', 'متوفر')}
              </option>

              <option value="limited">
                ${L('Quantités limitées', 'كميات محدودة')}
              </option>
            </select>

            <label for="sort">${L('Trier', 'ترتيب')}</label>

            <select id="sort">
              <option value="source">
                ${L('Ordre du catalogue', 'ترتيب الكتالوج')}
              </option>

              <option value="asc">
                ${L('Prix croissant', 'السعر تصاعدياً')}
              </option>

              <option value="desc">
                ${L('Prix décroissant', 'السعر تنازلياً')}
              </option>

              <option value="ref">
                ${L('Référence A–Z', 'المرجع A–Z')}
              </option>
            </select>
          </div>
        </div>

        <div class="grid" id="grid"></div>
      </section>
    `;

  $('#search').oninput = e => {
    state.query = e.target.value;
    updateGrid();
  };

  $('#stock').value = state.stock;
  $('#sort').value = state.sort;

  $('#stock').onchange = e => {
    state.stock = e.target.value;
    updateGrid();
  };

  $('#sort').onchange = e => {
    state.sort = e.target.value;
    updateGrid();
  };

  document.querySelectorAll('[data-category]').forEach(b => {
    b.onclick = () => {
      state.category = b.dataset.category;
      state.subCategory = 'all';

      document.querySelectorAll('[data-category]').forEach(t => {
        const a = t.dataset.category === state.category;

        t.classList.toggle('active', a);
        t.setAttribute('aria-pressed', String(a));
      });

      renderSubcategoryTabs();
      updateGrid();
    };
  });

  renderSubcategoryTabs();
  updateGrid();
};

updateGrid = function () {
  const q = normalize((state.query || '').trim());

  let list = products.filter(p =>
    (state.category === 'all' || p.category === state.category) &&
    (state.subCategory === 'all' || subCategory(p) === state.subCategory) &&
    (
      !q ||
      normalize(
        p.reference + ' ' +
        p.name + ' ' +
        p.category + ' ' +
        (subCategory(p) || '')
      ).includes(q)
    ) &&
    (
      state.stock === 'all' ||
      (
        state.stock === 'available'
          ? p.availability === 'Disponible'
          : p.availability !== 'Disponible'
      )
    )
  );

  if (state.sort === 'asc') {
    list.sort((a, b) => a.offerPrice - b.offerPrice);
  }

  if (state.sort === 'desc') {
    list.sort((a, b) => b.offerPrice - a.offerPrice);
  }

  if (state.sort === 'ref') {
    list.sort((a, b) => a.reference.localeCompare(b.reference));
  }

  $('#results').textContent = L(
    `${list.length} produit${list.length === 1 ? '' : 's'} · ${
      state.subCategory === 'all'
        ? state.category === 'all'
          ? 'Toutes les catégories'
          : state.category
        : state.subCategory
    }`,
    `${list.length} منتج · ${
      state.subCategory === 'all'
        ? cat(state.category)
        : state.subCategory
    }`
  );

  $('#grid').innerHTML = list.length
    ? list.map(card).join('')
    : `
      <div class="empty">
        <h2>${L(
          'Aucun produit trouvé',
          'لم يتم العثور على منتجات'
        )}</h2>

        <p>${L(
          'Essayez une autre référence ou réinitialisez les filtres.',
          'جرّب مرجعاً آخر أو أعد ضبط الفلاتر.'
        )}</p>

        <button id="reset" class="button">
          ${L('Réinitialiser les filtres', 'إعادة ضبط الفلاتر')}
        </button>
      </div>
    `;

  if ($('#reset')) {
    $('#reset').onclick = () => {
      Object.assign(state, {
        query: '',
        category: 'all',
        subCategory: 'all',
        stock: 'all',
        sort: 'source'
      });

      catalogue();
    };
  }

  bindImages();
};

/* Mensualité d'un produit : tableau officiel si le produit y figure,
   sinon total de la formule / nombre de mois (produits ajoutés depuis l'admin). */
function monthlyFor(p, months) {
  const index = [6, 12, 18].indexOf(months);
  const officielle = window.MONTHLY_PAYMENT_TABLE?.[p.reference]?.[index];
  const total = p.financing[months === 6 ? '3/6' : String(months)];
  return officielle ?? Math.round(total / months);
}

function simulator(p) {
  return `
    <section class="simulator finance">
      <h2>${L('Facilités de paiement', 'تسهيلات الدفع')}</h2>

      <p>${L(
        'Choisissez une formule pour afficher la mensualité correspondante.',
        'اختر صيغة لعرض القسط الشهري.'
      )}</p>

      <div class="sim-tabs" role="tablist">
        ${[
          ['6', '6 mois', '6 أشهر'],
          ['12', '12 mois', '12 شهراً'],
          ['18', '18 mois', '18 شهراً']
        ].map(([id, fr, ar], i) => `
          <button type="button"
            class="sim-tab ${i === 0 ? 'active' : ''}"
            data-sim="${id}" role="tab">
            ${L(fr, ar)}
          </button>
        `).join('')}
      </div>

      <div class="sim-result sim-hero" id="sim-result">
        <div class="sim-monthly">
          <span id="sim-monthly-label">${L('Votre mensualité', 'قسطك الشهري')}</span>
          <div class="sim-monthly-line">
            <strong id="sim-monthly" dir="ltr"></strong>
            <em id="sim-monthly-unit"></em>
          </div>
          <small id="sim-duration"></small>
        </div>
      </div>
    </section>
  `;
}

function wireSimulator(p) {
  function choose(id) {
    const mois = Number(id);

    $('#sim-monthly-label').textContent = L('Votre mensualité', 'قسطك الشهري');
    $('#sim-monthly').textContent = money(monthlyFor(p, mois));
    $('#sim-monthly-unit').textContent = L('/ mois', '/ شهر');
    $('#sim-duration').textContent = L(
      'pendant ' + mois + ' mois',
      'لمدة ' + mois + ' شهراً'
    );

    document.querySelectorAll('[data-sim]').forEach(b => {
      b.classList.toggle('active', b.dataset.sim === id);
    });
  }

  document.querySelectorAll('[data-sim]').forEach(b => {
    b.onclick = () => choose(b.dataset.sim);
  });

  choose('6');
}

const oldDetail = detail;

detail = function (ref) {
  oldDetail(ref);

  const p = products.find(x => x.reference === ref);

  if (p && $('.simulator')) {
    wireSimulator(p);
  }
};

let bucketItems = [];

try {
  bucketItems = JSON.parse(
    localStorage.getItem('catalogue-bucket') || '[]'
  );
} catch {
  bucketItems = [];
}

function saveBucket() {
  try {
    localStorage.setItem(
      'catalogue-bucket',
      JSON.stringify(bucketItems)
    );
  } catch {}
}

function bucketTotals() {
  const count = bucketItems.reduce((n, x) => n + x.qty, 0);

  const total = key => bucketItems.reduce(
    (n, x) => n + (
      key === 'cash'
        ? x.p.offerPrice
        : x.p.financing[
            key === 'six'
              ? '3/6'
              : key === 'twelve'
                ? '12'
                : '18'
          ]
    ) * x.qty,
    0
  );

  const eligible = count >= 3;

  return {
    cash: total('cash'),
    six: Math.round(total('six') * (eligible ? 0.97 : 1)),
    twelve: Math.round(total('twelve') * (eligible ? 0.94 : 1)),
    eighteen: Math.round(total('eighteen') * (eligible ? 0.91 : 1))
  };
}

function renderBucket() {
  const box = $('#bucket-panel');
  if (!box) return;

  const totals = bucketTotals();

  box.innerHTML = `
    <div class="bucket-head">
      <h2>${L('Votre sélection', 'اختيارك')}</h2>

      <span>
        ${bucketItems.reduce((n, x) => n + x.qty, 0)}
        ${L('article(s)', 'منتج')}
      </span>
    </div>

    ${
      bucketItems.length
        ? `
          <div class="bucket-list">
            ${bucketItems.map((x, i) => `
              <div class="bucket-row">
                <div>
                  <strong>${esc(x.p.name)}</strong>
                  <small dir="ltr">${x.p.reference}</small>
                </div>

                <div class="bucket-actions">
                  <button type="button"
                    data-bucket-minus="${i}"
                    aria-label="${L('Retirer une unité', 'إزالة وحدة')}">
                    −
                  </button>

                  <span>${x.qty}</span>

                  <button type="button"
                    data-bucket-plus="${i}"
                    aria-label="${L('Ajouter une unité', 'إضافة وحدة')}">
                    +
                  </button>

                  <button type="button"
                    data-bucket-remove="${i}"
                    aria-label="${L('Supprimer', 'حذف')}">
                    ×
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `
        : `
          <p class="bucket-empty">
            ${L(
              'Votre panier est vide. Ajoutez une référence pour calculer le total.',
              'سلتك فارغة. أضف مرجعاً لحساب الإجمالي.'
            )}
          </p>
        `
    }

    <div class="bucket-total">
      <span>${L('Total comptant', 'الإجمالي نقداً')}</span>
      <strong dir="ltr">${money(totals.cash)}</strong>
    </div>

    <div class="bucket-payments">
      <article>
        <span>${L('Comptant', 'نقداً')}</span>
        <strong dir="ltr">${money(totals.cash)}</strong>
      </article>

      <article>
        <span>${L('6 mois', '6 أشهر')}</span>
        <strong dir="ltr">${money(totals.six)}</strong>
      </article>

      <article>
        <span>${L('12 mois', '12 شهراً')}</span>
        <strong dir="ltr">${money(totals.twelve)}</strong>
      </article>

      <article>
        <span>${L('18 mois', '18 شهراً')}</span>
        <strong dir="ltr">${money(totals.eighteen)}</strong>
      </article>
    </div>
  `;

  box.querySelectorAll('[data-bucket-plus]').forEach(b => {
    b.onclick = () => {
      bucketItems[+b.dataset.bucketPlus].qty++;
      saveBucket();
      renderBucket();
    };
  });

  box.querySelectorAll('[data-bucket-minus]').forEach(b => {
    b.onclick = () => {
      const i = +b.dataset.bucketMinus;
      bucketItems[i].qty--;

      if (bucketItems[i].qty < 1) {
        bucketItems.splice(i, 1);
      }

      saveBucket();
      renderBucket();
    };
  });

  box.querySelectorAll('[data-bucket-remove]').forEach(b => {
    b.onclick = () => {
      bucketItems.splice(+b.dataset.bucketRemove, 1);
      saveBucket();
      renderBucket();
    };
  });
}

payments = function () {
  $('#main').innerHTML =
    hero(
      L('Solutions de paiement', 'حلول الدفع'),
      L(
        'Choisissez vos références et calculez le total de votre sélection.',
        'اختر مراجعك واحسب إجمالي اختيارك.'
      ),
      L('Paiement', 'الدفع')
    ) +
    `
      <div class="wrap content">
        <div class="payment-intro">
          <div>
            <label for="payment-product">
              ${L('Choisir une référence', 'اختيار مرجع')}
            </label>

            <select id="payment-product">
              ${products.map(p => `
                <option value="${p.reference}">
                  ${p.reference} — ${esc(p.name)}
                </option>
              `).join('')}
            </select>

            <button type="button" id="add-to-bucket"
              class="button bucket-add">
              ${L('Ajouter au panier', 'إضافة إلى السلة')} +
            </button>

            <a class="button secondary form-download"
              href="assets/Formed catalogue order form.xlsx"
              download>
              ${L(
                'Télécharger le bon d’enlèvement',
                'تحميل استمارة الطلب'
              )} ↓
            </a>
          </div>

          <aside class="good-to-know">
            <h2>
              ${ico('info')}${L('Facilités de paiement', 'تسهيلات الدفع')}
            </h2>

            <ul>
              <li>${L(
                'Ajoutez plusieurs références pour obtenir un total groupé.',
                'أضف عدة مراجع للحصول على إجمالي موحد.'
              )}</li>

              <li>${L(
                'Les montants affichés sont les totaux communiqués pour chaque formule.',
                'المبالغ المعروضة هي إجماليات الصيغ المقدمة.'
              )}</li>
            </ul>
          </aside>
        </div>

        <section id="bucket-panel" class="bucket-panel"></section>
      </div>
    `;

  $('#add-to-bucket').onclick = () => {
    const p = products.find(
      x => x.reference === $('#payment-product').value
    );

    const found = bucketItems.find(
      x => x.p.reference === p.reference
    );

    if (found) {
      found.qty++;
    } else {
      bucketItems.push({ p, qty: 1 });
    }

    saveBucket();
    renderBucket();
  };

  renderBucket();
};

const originalChrome = chrome;

chrome = function () {
  originalChrome();

  const links = navItems.map(([route, fr, ar]) => `
    <a href="#${route}"
      ${currentRoute === route ? 'aria-current="page" class="active"' : ''}>
      ${L(fr, ar)}
    </a>
  `).join('');

  $('#footer').innerHTML = `
    <div class="wrap">
      <div class="footer-row">
        <div>
          <img src="assets/logo.png" alt="Samsung">

          <p>${L(
            'Le catalogue Samsung pour les employés. Références, prix et facilités de paiement réunis au même endroit.',
            'كتالوج سامسونج للموظفين. المراجع والأسعار وتسهيلات الدفع في مكان واحد.'
          )}</p>
        </div>

        <div class="footer-contact">
          <strong>${L('Contact', 'اتصال')}</strong>

          <a href="mailto:yacine.c@samsung.com">
            yacine.c@samsung.com
          </a>

          <a href="tel:+213770431269">0770 43 12 69</a>
          <span>Cartier des affaires Tour CMA-CGM 8eme etage</span>
        </div>

        <nav class="footer-nav">${links}</nav>
      </div>

      <div class="footer-bottom">
        ${L(
          'Prix en dinars algériens • Disponibilités selon le tarif communiqué, à confirmer auprès du magasin.',
          'الأسعار بالدينار الجزائري • التوفر حسب القائمة المقدمة، يرجى التأكيد مع المتجر.'
        )}
      </div>
    </div>
  `;
};

const baseRender = render;

render = function (scroll = true) {
  if (
    ['/smarthings', '/smartthings'].includes(location.hash.slice(1))
  ) {
    currentRoute = '/smarthings';

    chrome();
    smartthings();

    document.title = 'Samsung — SmartThings';

    if (scroll) {
      window.scrollTo(0, 0);
      $('#main').focus({ preventScroll: true });
    }
  } else {
    baseRender(scroll);
  }
};

render(false);

// Make the five-slide home carousel unmistakable and manually navigable.

const homeWithCarousel = home;

home = function () {
  homeWithCarousel();

  const art = $('#main .tv-art');

  if (!art || art.querySelector('.tv-carousel-arrow')) return;

  art.insertAdjacentHTML(
    'beforeend',
    `
      <button type="button"
        class="tv-carousel-arrow tv-carousel-prev"
        aria-label="Image précédente">‹</button>

      <button type="button"
        class="tv-carousel-arrow tv-carousel-next"
        aria-label="Image suivante">›</button>
    `
  );

  const dots = [...art.querySelectorAll('[data-tv-slide]')];

  art.querySelector('.tv-carousel-prev').onclick = () => {
    dots[
      (
        dots.findIndex(
          dot => dot.getAttribute('aria-current') === 'true'
        ) + dots.length - 1
      ) % dots.length
    ].click();
  };

  art.querySelector('.tv-carousel-next').onclick = () => {
    dots[
      (
        dots.findIndex(
          dot => dot.getAttribute('aria-current') === 'true'
        ) + 1
      ) % dots.length
    ].click();
  };
};

render(false);
/* Fond blanc uniquement dans les zones des photos produits. */
(function () {
  const style = document.createElement('style');

  style.textContent = `
    .card .media,
    .detail-photo,
    .product-photo {
      background: #ffffff !important;
    }
  `;

  document.head.appendChild(style);
})();
/* Masquer les sous-catégories lorsque « Tout » est sélectionné. */
(function () {
  const affichageInitial = renderSubcategoryTabs;

  renderSubcategoryTabs = function () {
    const zone = document.getElementById('subcategories');

    if (!zone) return;

    if (state.category === 'all') {
      state.subCategory = 'all';
      zone.innerHTML = '';
      zone.style.display = 'none';
      return;
    }

    zone.style.removeProperty('display');
    affichageInitial();
  };

  renderSubcategoryTabs();
})();
/* Masquer uniquement la ligne « Total comptant » du panier. */
(function () {
  const style = document.createElement('style');

  style.textContent = `
    #bucket-panel .bucket-total {
      display: none !important;
    }
  `;

  document.head.appendChild(style);
})();
/* Logo blanc uniquement dans l'en-tête. */
(function () {
  let logoBlanc = null;

  function appliquerLogoBlanc() {
    if (!logoBlanc) return;

    const logo = document.querySelector('#header .brand img');

    if (logo) {
      logo.src = logoBlanc;
    }
  }

  const affichageInitial = chrome;

  chrome = function () {
    affichageInitial();
    appliquerLogoBlanc();
  };

  const image = new Image();

  image.onload = function () {
    /*
      Afficher les lettres du logo fourni sans ses grandes
      marges transparentes, en conservant leurs proportions.
    */
    const canvas = document.createElement('canvas');
    canvas.width = 616;
    canvas.height = 96;

    const contexte = canvas.getContext('2d');

    contexte.drawImage(
      image,
      716, 528, 616, 96,
      0, 0, 616, 96
    );

    logoBlanc = canvas.toDataURL('image/png');
    appliquerLogoBlanc();
  };

  image.src = 'assets/Front Tag_White Lettermark only_16x9.png';
})();
/* Forcer le blanc uniquement sur le logo de l'en-tête. */
(function () {
  const style = document.createElement('style');

  style.textContent = `
    #header .brand img {
      filter: brightness(0) invert(1) !important;
    }
  `;

  document.head.appendChild(style);
})();