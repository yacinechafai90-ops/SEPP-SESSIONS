'use strict';

// Optional catalogue features for review: favorites, comparison, and stock contact.
(function () {
  const favoritesKey = 'catalogue-favorites-preview';
  const compareKey = 'catalogue-compare-preview';

  const readRefs = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');

      return Array.isArray(value)
        ? value.filter((ref) => products.some((p) => p.reference === ref))
        : [];
    } catch {
      return [];
    }
  };

  const favorites = new Set(readRefs(favoritesKey));
  let compared = readRefs(compareKey).slice(0, 3);

  const save = () => {
    try {
      localStorage.setItem(
        favoritesKey,
        JSON.stringify([...favorites])
      );

      localStorage.setItem(
        compareKey,
        JSON.stringify(compared)
      );
    } catch {
      /* The preview still works if browser storage is unavailable. */
    }
  };

  const product = (ref) =>
    products.find((item) => item.reference === ref);

  const label = (fr, ar) => L(fr, ar);

  function refreshControls() {
    document.querySelectorAll('[data-favorite-ref]').forEach((button) => {
      const active = favorites.has(button.dataset.favoriteRef);

      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));

      button.textContent = active
        ? label('♥ Favori', '♥ مفضل')
        : label('♡ Favoris', '♡ المفضلة');
    });

    document.querySelectorAll('[data-compare-ref]').forEach((button) => {
      const active = compared.includes(button.dataset.compareRef);

      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));

      button.textContent = active
        ? label('✓ Comparé', '✓ للمقارنة')
        : label('⇄ Comparer', '⇄ قارن');
    });

    const favoritesCount =
      document.querySelector('#extras-favorites-count');

    const compareCount =
      document.querySelector('#extras-compare-count');

    if (favoritesCount) {
      favoritesCount.textContent = String(favorites.size);
    }

    if (compareCount) {
      compareCount.textContent = `${compared.length}/3`;
    }
  }

  function toggleFavorite(ref) {
    if (favorites.has(ref)) {
      favorites.delete(ref);
    } else {
      favorites.add(ref);
    }

    save();
    refreshControls();
  }

  function toggleCompare(ref) {
    if (compared.includes(ref)) {
      compared = compared.filter((item) => item !== ref);
    } else if (compared.length < 3) {
      compared.push(ref);
    } else {
      const status = document.querySelector('#extras-status');

      if (status) {
        status.textContent = label(
          'Choisissez trois produits maximum.',
          'اختر ثلاثة منتجات كحد أقصى.'
        );
      }

      return;
    }

    const status = document.querySelector('#extras-status');

    if (status) {
      status.textContent = '';
    }

    save();
    refreshControls();
  }

  function openDialog(content) {
    document.querySelector('#extras-dialog')?.remove();

    const dialog = document.createElement('dialog');
    dialog.id = 'extras-dialog';
    dialog.className = 'extras-dialog';

    dialog.innerHTML = `
      <button type="button" class="extras-close"
        aria-label="${label('Fermer', 'إغلاق')}">×</button>
      ${content}
    `;

    document.body.append(dialog);

    dialog.querySelector('.extras-close').onclick = () => {
      dialog.close();
    };

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        dialog.close();
      }

      if (event.target.closest('a[href^="#/produit/"]')) {
        dialog.close();
      }
    });

    dialog.addEventListener(
      'close',
      () => dialog.remove(),
      { once: true }
    );

    dialog.showModal();
  }

  function showFavorites() {
    const items = [...favorites].map(product).filter(Boolean);

    const content = items.length
      ? `
        <div class="extras-list">
          ${items.map((p) => `
            <a href="#/produit/${esc(p.reference)}">
              <span>
                <strong>${esc(p.name)}</strong>
                <small>${esc(p.reference)}</small>
              </span>
              <b>${money(p.offerPrice)}</b>
              <span aria-hidden="true">↗</span>
            </a>
          `).join('')}
        </div>
      `
      : `
        <p class="extras-empty">
          ${label(
            'Enregistrez un produit avec le bouton Favoris pour le retrouver ici.',
            'احفظ منتجاً بزر المفضلة لتجده هنا.'
          )}
        </p>
      `;

    openDialog(`
      <span class="extras-kicker">
        ${label('Votre sélection', 'اختيارك')}
      </span>
      <h2>${label('Mes favoris', 'المفضلة')}</h2>
      ${content}
    `);
  }

  /* Comparatif : choix des produits par liste déroulante (jusqu'à trois),
     prix comptant puis mensualité de chaque formule, et spécifications. */
  const FORMULES_COMPARAISON = [6, 12, 18, 24];
  // Formule affichée pour chaque produit comparé (choisie par l'onglet de formule).
  const formuleChoisie = {};

  // Mensualité officielle (monthly-payment-table.js), sinon total de la formule / nombre de mois.
  function mensualite(p, mois) {
    const officielle = window.MONTHLY_PAYMENT_TABLE?.[p.reference]?.[FORMULES_COMPARAISON.indexOf(mois)];
    if (Number.isFinite(Number(officielle)) && Number(officielle) > 0) return Number(officielle);
    const total = p.financing?.[mois === 6 ? '3/6' : String(mois)];
    return Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total) / mois : null;
  }

  function montant(valeur) {
    return Number.isFinite(Number(valeur)) && Number(valeur) > 0
      ? money(Math.round(Number(valeur)))
      : '—';
  }

  function showComparison(note = '') {
    const items = compared.map(product).filter(Boolean);

    const options = (selection) => [
      `<option value="">${label('— Aucun produit —', '— لا يوجد منتج —')}</option>`,
      ...products
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((p) => `
          <option value="${esc(p.reference)}"${p.reference === selection ? ' selected' : ''}>
            ${esc(p.name)} (${esc(p.reference)})
          </option>
        `)
    ].join('');

    const choix = [0, 1, 2].map((i) => `
      <label class="cmp-choice">
        <span>${label('Produit', 'المنتج')} ${i + 1}</span>
        <select data-compare-slot="${i}">${options(compared[i] || '')}</select>
      </label>
    `).join('');

    // Seules les formules disponibles (non désactivées, avec un montant) sont proposées.
    const formulesDispo = (p) => FORMULES_COMPARAISON.filter((mois) => p.formules?.[String(mois)] !== false && Number.isFinite(mensualite(p, mois)));
    const formuleAffichee = (p, dispo) => (dispo.includes(formuleChoisie[p.reference]) ? formuleChoisie[p.reference] : dispo[0]);

    // Une ligne par produit : onglets des formules disponibles + mensualité mise en avant (pas le total).
    const ligneFormules = `
      <tr>
        <th scope="row">${label('Formule et mensualité', 'الصيغة والقسط الشهري')}</th>
        ${items.map((p) => {
          const dispo = formulesDispo(p);
          if (!dispo.length) return `<td>${label('Aucune formule disponible', 'لا توجد صيغة متاحة')}</td>`;
          const actuelle = formuleAffichee(p, dispo);
          const onglets = dispo.length > 1
            ? `<div class="cmp-offers" role="group" aria-label="${label('Formules disponibles', 'الصيغ المتاحة')}">${dispo.map((mois) => `<button type="button" class="cmp-chip" aria-pressed="${mois === actuelle}" data-cmp-ref="${esc(p.reference)}" data-cmp-mois="${mois}">${mois} ${label('mois', 'شهراً')}</button>`).join('')}</div>`
            : '';
          return `<td class="cmp-cell">${onglets}<div class="cmp-monthly"><strong dir="ltr">${montant(mensualite(p, actuelle))}</strong><small>${label('par mois', 'شهرياً')} · ${actuelle} ${label('mois', 'شهراً')}</small></div></td>`;
        }).join('')}
      </tr>
    `;

    const specifications = items.map(
      (p) => window.PRODUCT_SPECS?.[p.reference] || {}
    );

    const criteres = [
      ...new Set(
        specifications.flatMap((specs) => Object.keys(specs))
      )
    ];

    const lignesSpecs = criteres.length
      ? criteres.map((critere) => `
          <tr>
            <th scope="row">${esc(critere)}</th>
            ${specifications.map((specs) => {
              const valeur = specs[critere];
              return `<td>${valeur === null || valeur === undefined || valeur === '' ? '—' : esc(valeur)}</td>`;
            }).join('')}
          </tr>
        `).join('')
      : `
          <tr>
            <th scope="row">${label('Caractéristiques', 'المواصفات')}</th>
            ${items.map(() => `<td>${label('Non renseignées', 'غير متوفرة')}</td>`).join('')}
          </tr>
        `;

    const table = items.length ? `
      <div class="extras-table-scroll">
        <table class="cmp-table">
          <thead>
            <tr>
              <th scope="col">${label('Critère', 'المعيار')}</th>
              ${items.map((p) => `
                <th scope="col">
                  <a href="#/produit/${esc(p.reference)}">${esc(p.name)}</a>
                  <small>${esc(p.reference)}</small>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${ligneFormules}
            <tr>
              <th scope="row">${label('Disponibilité', 'التوفر')}</th>
              ${items.map((p) => `<td>${esc(p.availability)}</td>`).join('')}
            </tr>
            <tr>
              <th colspan="${items.length + 1}">${label('Spécifications techniques', 'المواصفات التقنية')}</th>
            </tr>
            ${lignesSpecs}
          </tbody>
        </table>
      </div>
    ` : `
      <p class="extras-empty">
        ${label(
          'Choisissez jusqu’à trois produits dans les listes ci-dessus.',
          'اختر حتى ثلاثة منتجات من القوائم أعلاه.'
        )}
      </p>
    `;

    openDialog(`
      <span class="extras-kicker">
        ${label('Aide au choix', 'المساعدة في الاختيار')}
      </span>

      <h2>${label('Comparer les produits', 'مقارنة المنتجات')}</h2>

      <p class="extras-intro">
        ${label(
          'Seules les formules proposées sont affichées. Le montant mis en avant est la mensualité à payer. Confirmez le stock auprès du magasin.',
          'تُعرض الصيغ المتاحة فقط. المبلغ المميز هو القسط الشهري المستحق. أكد المخزون لدى المتجر.'
        )}
      </p>

      <div class="cmp-choices">${choix}</div>
      ${note ? `<p class="cmp-note" role="status">${esc(note)}</p>` : ''}
      ${table}
    `);

    document.querySelectorAll('[data-cmp-mois]').forEach((bouton) => {
      bouton.onclick = () => {
        formuleChoisie[bouton.dataset.cmpRef] = Number(bouton.dataset.cmpMois);
        showComparison(note);
      };
    });

    document.querySelectorAll('[data-compare-slot]').forEach((select) => {
      select.onchange = () => {
        const choisis = [...document.querySelectorAll('[data-compare-slot]')]
          .map((s) => s.value)
          .filter(Boolean);
        const uniques = [...new Set(choisis)].slice(0, 3);
        const doublon = uniques.length !== choisis.length;

        compared = uniques;
        save();
        refreshControls();
        showComparison(doublon
          ? label('Un produit ne peut figurer qu’une fois dans le comparatif.', 'لا يمكن أن يظهر المنتج أكثر من مرة في المقارنة.')
          : '');
      };
    });
  }

  function addCardControls() {
    document.querySelectorAll(
      '#grid .card[data-ref]'
    ).forEach((card) => {
      if (card.querySelector('.extras-card-actions')) return;

      const ref = card.dataset.ref;
      const actions = document.createElement('div');

      actions.className = 'extras-card-actions';

      actions.innerHTML = `
        <button type="button" data-favorite-ref="${esc(ref)}"></button>
        <button type="button" data-compare-ref="${esc(ref)}"></button>
      `;

      const cartAction =
        card.querySelector('.catalogue-cart-action');

      if (cartAction) {
        cartAction.before(actions);
      } else {
        card.append(actions);
      }

      actions.querySelector('[data-favorite-ref]').onclick = () => {
        toggleFavorite(ref);
      };

      actions.querySelector('[data-compare-ref]').onclick = () => {
        toggleCompare(ref);
      };
    });

    refreshControls();
  }

  const previousGrid = updateGrid;

  updateGrid = function () {
    previousGrid();
    addCardControls();
  };

  const previousCatalogue = catalogue;

  catalogue = function () {
    previousCatalogue();

    const toolbar =
      document.querySelector('#main .toolbar');

    if (!toolbar) return;

    toolbar.insertAdjacentHTML(
      'afterend',
      `
        <div class="extras-toolbar">
          <div>
            <span class="extras-kicker">
              ${label('Vos outils', 'أدواتك')}
            </span>

            <strong>
              ${label(
                'Choisissez plus facilement',
                'اختر بسهولة أكبر'
              )}
            </strong>
          </div>

          <div class="extras-toolbar-actions">
            <button type="button" id="extras-open-favorites">
              ♡ ${label('Mes favoris', 'المفضلة')}
              <span id="extras-favorites-count">0</span>
            </button>

            <button type="button" id="extras-open-comparison">
              ⇄ ${label('Comparer', 'مقارنة')}
              <span id="extras-compare-count">0/3</span>
            </button>
          </div>

          <span id="extras-status" role="status"
            aria-live="polite"></span>
        </div>
      `
    );

    document.querySelector(
      '#extras-open-favorites'
    ).onclick = showFavorites;

    document.querySelector(
      '#extras-open-comparison'
    ).onclick = () => showComparison();

    refreshControls();
  };

  const previousDetail = detail;

  detail = function (ref) {
    previousDetail(ref);

    const p = product(ref);

    const column =
      document.querySelector('#main .detail > div:last-child');

    if (!p || !column) return;

    const actions = document.createElement('div');
    actions.className = 'extras-detail-actions';

    actions.innerHTML = `
      <button type="button" data-favorite-ref="${esc(ref)}"></button>
      <button type="button" data-compare-ref="${esc(ref)}"></button>
    `;

    const finance =
      column.querySelector('.simulator, .finance');

    if (finance) {
      finance.before(actions);
    } else {
      column.append(actions);
    }

    actions.querySelector('[data-favorite-ref]').onclick = () => {
      toggleFavorite(ref);
    };

    actions.querySelector('[data-compare-ref]').onclick = () => {
      toggleCompare(ref);
    };

    const contact = document.createElement('section');
    contact.className = 'extras-stock-contact';

    contact.innerHTML = `
      <div>
        <span class="extras-kicker">
          ${label(
            'Disponibilité en magasin',
            'التوفر في المتجر'
          )}
        </span>

        <h2>${label('Confirmer le stock', 'تأكيد المخزون')}</h2>

        <p>
          ${label(
            'Choisissez un BrandShop pour demander la disponibilité de',
            'اختر متجراً للسؤال عن توفر'
          )}
          <strong>${esc(p.reference)}</strong>.
        </p>
      </div>

      <label>
        ${label('BrandShop', 'المتجر')}

        <select>
          ${shops.map((shop, i) => `
            <option value="${i}">
              ${esc(shop.name)} — ${esc(shop.city)}
            </option>
          `).join('')}
        </select>
      </label>

      <div class="extras-stock-links">
        <a class="extras-call" href="#">
          ${label('Appeler le magasin', 'اتصل بالمتجر')} ↗
        </a>

        <a class="extras-email" href="#">
          ${label(
            'Envoyer un e-mail',
            'إرسال بريد إلكتروني'
          )} ↗
        </a>
      </div>
    `;

    column.append(contact);

    const select = contact.querySelector('select');

    const updateContact = () => {
      const shop = shops[Number(select.value)];

      contact.querySelector(
        '.extras-call'
      ).href = `tel:+213${shop.phone.slice(1)}`;

      const email = contact.querySelector('.extras-email');

      email.hidden = !shop.email;

      if (shop.email) {
        email.href =
          `mailto:${shop.email}` +
          `?subject=${encodeURIComponent(
            'Disponibilité Samsung ' + p.reference
          )}` +
          `&body=${encodeURIComponent(
            'Bonjour, je souhaite confirmer la disponibilité de la référence ' +
            p.reference +
            ' dans votre magasin.'
          )}`;
      }
    };

    select.onchange = updateContact;
    updateContact();
    refreshControls();
  };

  window.addEventListener('hashchange', () => {
    document.querySelector('#extras-dialog')?.close();
  });

  render(false);
})();