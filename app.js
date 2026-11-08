'use strict';

const {products,shops}=window.CATALOGUE;

const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let lang='fr';
try{
  lang=localStorage.getItem('catalogue-language')==='ar'?'ar':'fr';
}catch{}

const L=(fr,ar)=>lang==='ar'?ar:fr;

const catNames={
  'Téléviseurs':'تلفزيونات',
  'Climatiseurs':'مكيفات',
  'Réfrigérateurs':'ثلاجات',
  'Lave-linge':'غسالات',
  'Aspirateurs':'مكانس كهربائية',
  'Micro-ondes':'أفران ميكروويف'
};

const categories=Object.keys(catNames);
const cat=c=>lang==='ar'?catNames[c]||c:c;

const money=n=>new Intl.NumberFormat('fr-FR',{
  maximumFractionDigits:0
}).format(n)+' '+L('DA','دج');

const navItems=[
  ['/','Accueil','الرئيسية'],
  ['/comment-ca-marche','Comment ça marche','كيفية الشراء'],
  ['/catalogue','Catalogue','الكتالوج'],
  ['/paiement','Paiement','الدفع'],
  ['/brandshops','BrandShops','المتاجر'],
  ['/garantie','Garantie','الضمان']
];

const state={
  query:'',
  category:'all',
  sort:'source',
  stock:'all'
};

let currentRoute='';

function chrome(){
  document.documentElement.lang=lang;
  document.documentElement.dir=lang==='ar'?'rtl':'ltr';

  const links=navItems.map(([route,fr,ar])=>`
    <a href="#${route}"
      ${currentRoute===route?'aria-current="page" class="active"':''}>
      ${L(fr,ar)}
    </a>
  `).join('');

  $('#header').innerHTML=`
    <div class="wrap header-row">
      <a class="brand" href="#/" aria-label="Samsung">
        <img src="assets/logo.png" alt="Samsung">
        <span>${L('Offres employés','عروض الموظفين')}</span>
      </a>

      <nav class="nav" id="nav"
        aria-label="${L('Navigation principale','التنقل الرئيسي')}">
        ${links}
      </nav>

      <button class="language" id="language"
        aria-label="${L('Passer en arabe','التغيير إلى الفرنسية')}">
        ${lang==='fr'?'FR / العربية':'AR / Français'}
      </button>

      <button class="menu-toggle" id="menu"
        aria-controls="nav" aria-expanded="false">
        ${L('Menu','القائمة')} ☰
      </button>
    </div>
  `;

  $('#footer').innerHTML=`
    <div class="wrap">
      <div class="footer-row">
        <div>
          <img src="assets/logo.png" alt="Samsung">
          <p>${L(
            'Le catalogue Samsung pour les employés. Références, prix et facilités de paiement réunis au même endroit.',
            'كتالوج سامسونج للموظفين. المراجع والأسعار وتسهيلات الدفع في مكان واحد.'
          )}</p>
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

  $('#language').onclick=()=>{
    lang=lang==='fr'?'ar':'fr';

    try{
      localStorage.setItem('catalogue-language',lang);
    }catch{}

    render(false);
  };

  $('#menu').onclick=()=>{
    const open=$('#nav').classList.toggle('open');
    $('#menu').setAttribute('aria-expanded',String(open));
  };
}

function hero(
  title,
  subtitle,
  kicker=L('Catalogue','الكتالوج'),
  extra='',
  home=false
){
  return `
    <section class="hero ${home?'home-hero':''}">
      <div class="wrap">
        <span class="eyebrow">${kicker}</span>

        <div class="hero-top">
          <div>
            <h1>${title}</h1>
            <p>${subtitle}</p>
          </div>

          ${
            currentRoute==='/catalogue'
              ? `
                <div class="hero-stat">
                  <strong>${products.length}</strong>
                  <span>${L(
                    'références à découvrir',
                    'منتجاً للاكتشاف'
                  )}</span>
                </div>
              `
              : ''
          }
        </div>

        ${extra}
      </div>
    </section>
  `;
}

function stock(p){
  const kind=p.availability.includes('très')
    ?'low'
    :p.availability.includes('limit')
      ?'limited'
      :'';

  return `
    <span class="stock ${kind}">
      ${L(
        esc(p.availability),
        kind==='low'
          ?'كمية محدودة جداً'
          :kind==='limited'
            ?'كمية محدودة'
            :'متوفر'
      )}
    </span>
  `;
}

/* Affichage de l'image entière. */
function photo(p,detail=false){
  if(!p.image)return '';

  return `
    <span class="product-photo ${detail?'product-photo-detail':''}">
      <img
        src="${esc(p.image)}"
        alt="${esc(p.reference+' — '+p.name)}"
        loading="${detail?'eager':'lazy'}"
        decoding="async">
    </span>
  `;
}

function card(p){
  return `
    <article class="card" data-ref="${p.reference}">
      <a class="card-link" href="#/produit/${p.reference}">
        ${
          p.image
            ?`<div class="media">${photo(p)}</div>`
            :`
              <div class="text-only">
                <div>
                  <span class="category">${cat(p.category)}</span>
                  <strong>${esc(p.reference)}</strong>
                  <p>${L(
                    'Photographie non fournie',
                    'لم تُقدّم صورة للمنتج'
                  )}</p>
                </div>
              </div>
            `
        }

        <div class="card-body">
          <span class="category">${cat(p.category)}</span>
          <span class="reference" dir="ltr">${p.reference}</span>
          <h2>${esc(p.name)}</h2>

          <div class="prices">
            <span class="price-label">
              ${L('Prix showroom','سعر المعرض')}
              <s class="old-price" dir="ltr">${money(p.marketPrice)}</s>
            </span>

            <span class="price-label">
              ${L('Prix remisé','السعر المخفض')}
            </span>

            <span class="price" dir="ltr">${money(p.offerPrice)}</span>
          </div>

          <div class="card-foot">
            ${stock(p)}
            <span class="view">
              ${L('Voir le produit','عرض المنتج')} ↗
            </span>
          </div>
        </div>
      </a>
    </article>
  `;
}

function bindImages(){
  document.querySelectorAll('.product-photo img').forEach(img=>{
    img.onerror=()=>{
      const parent=img.closest('.product-photo');

      if(parent){
        parent.innerHTML=`
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
}

function catalogue(){
  const search=`
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
          'Rechercher un produit ou une référence',
          'البحث عن منتج أو مرجع'
        )}">
    </div>

    <div class="tabs" role="group"
      aria-label="${L('Catégories','الفئات')}">
      ${['all',...categories].map(c=>`
        <button data-category="${c}"
          class="${c===state.category?'active':''}"
          aria-pressed="${c===state.category}">
          ${c==='all'?L('Tout','الكل'):cat(c)}
        </button>
      `).join('')}
    </div>
  `;

  $('#main').innerHTML=
    hero(
      L('Le catalogue Samsung','كتالوج سامسونج'),
      L(
        'Découvrez votre prochain équipement. Retrouvez les références, les prix remisés et les facilités de paiement.',
        'اكتشف جهازك القادم. تصفّح المراجع والأسعار المخفضة وتسهيلات الدفع.'
      ),
      L('Offres employés · Algérie','عروض الموظفين · الجزائر'),
      search
    )+
    `
      <section class="wrap">
        <div class="toolbar">
          <div class="results" id="results"
            role="status" aria-live="polite">
          </div>

          <div class="controls">
            <label for="stock">${L('Disponibilité','التوفر')}</label>

            <select id="stock"
              aria-label="${L('Filtrer la disponibilité','تصفية حسب التوفر')}">
              <option value="all">
                ${L('Toutes disponibilités','جميع الحالات')}
              </option>
              <option value="available">
                ${L('Disponible','متوفر')}
              </option>
              <option value="limited">
                ${L('Quantités limitées','كميات محدودة')}
              </option>
            </select>

            <label for="sort">${L('Trier','ترتيب')}</label>

            <select id="sort"
              aria-label="${L('Trier les produits','ترتيب المنتجات')}">
              <option value="source">
                ${L('Ordre du catalogue','ترتيب الكتالوج')}
              </option>
              <option value="asc">
                ${L('Prix croissant','السعر تصاعدياً')}
              </option>
              <option value="desc">
                ${L('Prix décroissant','السعر تنازلياً')}
              </option>
              <option value="ref">
                ${L('Référence A–Z','المرجع A–Z')}
              </option>
            </select>
          </div>
        </div>

        <div class="grid" id="grid"></div>
      </section>
    `;

  $('#search').oninput=e=>{
    state.query=e.target.value;
    updateGrid();
  };

  $('#stock').value=state.stock;
  $('#sort').value=state.sort;

  $('#stock').onchange=e=>{
    state.stock=e.target.value;
    updateGrid();
  };

  $('#sort').onchange=e=>{
    state.sort=e.target.value;
    updateGrid();
  };

  document.querySelectorAll('[data-category]').forEach(b=>{
    b.onclick=()=>{
      state.category=b.dataset.category;

      document.querySelectorAll('[data-category]').forEach(t=>{
        const active=t.dataset.category===state.category;
        t.classList.toggle('active',active);
        t.setAttribute('aria-pressed',String(active));
      });

      updateGrid();
    };
  });

  updateGrid();
}

const normalize=s=>s
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .toLowerCase();

function updateGrid(){
  const q=normalize(state.query.trim());

  let list=products.filter(p=>
    (state.category==='all'||p.category===state.category)&&
    (
      !q||
      normalize(
        p.reference+' '+p.name+' '+p.category+' '+cat(p.category)
      ).includes(q)
    )&&
    (
      state.stock==='all'||
      (
        state.stock==='available'
          ?p.availability==='Disponible'
          :p.availability!=='Disponible'
      )
    )
  );

  if(state.sort==='asc')list.sort((a,b)=>a.offerPrice-b.offerPrice);
  if(state.sort==='desc')list.sort((a,b)=>b.offerPrice-a.offerPrice);
  if(state.sort==='ref')list.sort((a,b)=>a.reference.localeCompare(b.reference));

  $('#results').textContent=L(
    `${list.length} produit${list.length===1?'':'s'} · ${
      state.category==='all'?'Toutes les catégories':state.category
    }`,
    `${list.length} منتج · ${
      state.category==='all'?'جميع الفئات':cat(state.category)
    }`
  );

  $('#grid').innerHTML=list.length
    ?list.map(card).join('')
    :`
      <div class="empty">
        <h2>${L('Aucun produit trouvé','لم يتم العثور على منتجات')}</h2>

        <p>${L(
          'Essayez une autre référence ou réinitialisez les filtres.',
          'جرّب مرجعاً آخر أو أعد ضبط الفلاتر.'
        )}</p>

        <button id="reset" class="button">
          ${L('Réinitialiser les filtres','إعادة ضبط الفلاتر')}
        </button>
      </div>
    `;

  if($('#reset')){
    $('#reset').onclick=()=>{
      Object.assign(state,{
        query:'',
        category:'all',
        stock:'all',
        sort:'source'
      });

      catalogue();
    };
  }

  bindImages();
}

function finance(p){
  return `
    <section class="finance">
      <h2>${L('Facilités de paiement','تسهيلات الدفع')}</h2>
      <p>${L('Montant total par formule','المبلغ الإجمالي لكل صيغة')}</p>

      <table>
        <thead>
          <tr>
            <th scope="col">${L('Formule','الصيغة')}</th>
            <th scope="col">${L('Prix total','السعر الإجمالي')}</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>${L(
              'Comptant · prix remisé',
              'نقداً · السعر المخفض'
            )}</td>
            <td dir="ltr">${money(p.offerPrice)}</td>
          </tr>

          ${["3/6","12","18"]
            .map(m=>[m,p.financing[m]])
            .map(([m,total])=>`
              <tr>
                <td>${
                  m==='3/6'
                    ?L('3 ou 6 mois','3 أو 6 أشهر')
                    :m+' '+L('mois','شهراً')
                }</td>
                <td dir="ltr">${money(total)}</td>
              </tr>
            `).join('')}
        </tbody>
      </table>

      <p class="note">${L(
        'Les montants affichés sont les totaux des formules, et non des mensualités. Les conditions et l’échéancier sont à confirmer auprès du magasin.',
        'المبالغ المعروضة هي إجماليات الصيغ وليست أقساطاً شهرية. تُؤكّد الشروط وجدول الدفع مع المتجر.'
      )}</p>
    </section>
  `;
}

function detail(ref){
  const p=products.find(p=>p.reference===ref);

  if(!p){
    $('#main').innerHTML=`
      <div class="wrap content empty">
        <h1>${L('Produit introuvable','المنتج غير موجود')}</h1>

        <p>${L(
          'Cette ancienne adresse ne permet pas d’identifier un produit unique. Recherchez sa référence dans le catalogue.',
          'هذا العنوان لا يحدد منتجاً. ابحث عن مرجعه في الكتالوج.'
        )}</p>

        <a class="button" href="#/catalogue">
          ${L('Ouvrir le catalogue','فتح الكتالوج')}
        </a>
      </div>
    `;

    return;
  }

  document.title=p.reference+' — Samsung';

  $('#main').innerHTML=`
    <div class="wrap content">
      <a class="back" href="#/catalogue">
        ← ${L('Retour au catalogue','العودة إلى الكتالوج')}
      </a>

      <div class="detail">
        <div>
          ${
            p.image
              ?`<div class="detail-photo">${photo(p,true)}</div>`
              :`
                <div class="notice">
                  ${L(
                    'Photographie non fournie pour cette référence.',
                    'لم تُقدّم صورة لهذا المرجع.'
                  )}
                </div>
              `
          }

          ${
            (
              window.PRODUCT_SPECS&&
              window.PRODUCT_SPECS[p.reference]&&
              Object.keys(window.PRODUCT_SPECS[p.reference]).length
            )
              ?`
                <div class="specs-panel">
                  <h2>${L(
                    'Spécifications techniques',
                    'المواصفات التقنية'
                  )}</h2>

                  <table>
                    <tbody>
                      ${Object.entries(window.PRODUCT_SPECS[p.reference])
                        .map(([k,v])=>`
                          <tr>
                            <th>${esc(k)}</th>
                            <td>${esc(v)}</td>
                          </tr>
                        `).join('')}
                    </tbody>
                  </table>
                </div>
              `
              :''
          }
        </div>

        <div>
          <div class="details-meta">
            <span class="category">${cat(p.category)}</span>
            ${stock(p)}
          </div>

          <span class="reference" dir="ltr">${p.reference}</span>
          <h1>${esc(p.name)}</h1>

          <div class="price-label">
            ${L('Prix showroom','سعر المعرض')}
            <s class="old-price" dir="ltr">${money(p.marketPrice)}</s>
          </div>

          <span class="price-label">
            ${L('Prix remisé','السعر المخفض')}
          </span>

          <strong class="price" dir="ltr">${money(p.offerPrice)}</strong>

          ${typeof simulator==='function'?simulator(p):finance(p)}
        </div>
      </div>
    </div>
  `;

  bindImages();
}

function home(){
  const featured=[
    'QA55QN90FAU',
    'AR60F18C1TW2DZ',
    'WW80TA046AX',
    'RT59K6231S8'
  ].map(r=>products.find(p=>p.reference===r));

  $('#main').innerHTML=
    hero(
      L('Samsung, pour votre quotidien.','سامسونج، لحياتك اليومية.'),
      L(
        'Téléviseurs et électroménager : découvrez les offres employés et choisissez l’équipement qui vous correspond.',
        'تلفزيونات وأجهزة منزلية: اكتشف عروض الموظفين واختر الجهاز المناسب لك.'
      ),
      L('Offres employés · Algérie','عروض الموظفين · الجزائر'),
      `<a class="button" href="#/catalogue">${L(
        'Découvrir le catalogue',
        'اكتشاف الكتالوج'
      )} ↗</a>`,
      true
    )+
    `
      <section class="wrap content">
        <div class="info-grid">
          <div class="info-card">
            <span class="number">01</span>
            <h2>${L('Votre prix remisé','سعرك المخفض')}</h2>
            <p>${L(
              'Comparez le prix showroom au prix remisé pour chaque référence.',
              'قارن سعر المعرض بالسعر المخفض لكل مرجع.'
            )}</p>
          </div>

          <div class="info-card">
            <span class="number">02</span>
            <h2>${L('Vos facilités de paiement','تسهيلات الدفع')}</h2>
            <p>${L(
              'Consultez le total des formules 6, 12 et 18 mois.',
              'اطّلع على إجمالي صيغ 6 و12 و18 شهراً.'
            )}</p>
          </div>

          <div class="info-card">
            <span class="number">03</span>
            <h2>${L('Votre BrandShop','متجرك')}</h2>
            <p>${L(
              'Retrouvez les coordonnées des magasins du réseau communiqué.',
              'اعثر على بيانات الاتصال بمتاجر الشبكة المقدمة.'
            )}</p>
          </div>
        </div>

        <h2 class="section-title">${L(
          'À découvrir dans le catalogue',
          'للاكتشاف في الكتالوج'
        )}</h2>

        <div class="grid">${featured.map(card).join('')}</div>
      </section>
    `;

  bindImages();
}

function payments(){
  $('#main').innerHTML=
    hero(
      L('Solutions de paiement','حلول الدفع'),
      L(
        'Comparez les montants totaux pour une référence de votre choix.',
        'قارن المبالغ الإجمالية للمرجع الذي تختاره.'
      ),
      L('Paiement','الدفع')
    )+
    `
      <div class="wrap content">
        <label for="payment-product">
          ${L('Choisir une référence','اختيار مرجع')}
        </label>
        <br>

        <select id="payment-product"
          style="margin:14px 0;max-width:100%;width:540px">
          ${products.map(p=>`
            <option value="${p.reference}">
              ${p.reference} — ${esc(p.name)}
            </option>
          `).join('')}
        </select>

        <div id="payment-result" style="max-width:700px"></div>
      </div>
    `;

  function change(){
    const p=products.find(p=>p.reference===$('#payment-product').value);

    $('#payment-result').innerHTML=finance(p)+`
      <p>
        <a class="back" href="#/produit/${p.reference}">
          ${L('Voir la fiche produit','عرض تفاصيل المنتج')} ↗
        </a>
      </p>
    `;
  }

  $('#payment-product').onchange=change;
  change();
}

function brandshops(){
  $('#main').innerHTML=
    hero(
      L('Nos BrandShops','متاجرنا'),
      L(
        'Retrouvez les coordonnées des 16 points de vente du réseau communiqué.',
        'اعثر على بيانات الاتصال بنقاط البيع الـ16 في الشبكة المقدمة.'
      ),
      L('Le réseau','الشبكة')
    )+
    `
      <div class="wrap content">
        <label for="city">${L('Filtrer par ville','تصفية حسب المدينة')}</label>

        <select id="city">
          <option value="all">
            ${L('Toutes les villes','جميع المدن')}
          </option>

          ${[...new Set(shops.map(s=>s.city))]
            .sort()
            .map(c=>`<option>${esc(c)}</option>`)
            .join('')}
        </select>

        <p class="note">${L(
          'Contactez le magasin pour confirmer l’adresse et la disponibilité avant votre déplacement.',
          'تواصل مع المتجر لتأكيد العنوان والتوفر قبل التنقل.'
        )}</p>

        <div class="shop-grid" id="shops"></div>
      </div>
    `;

  function list(){
    const city=$('#city').value;

    $('#shops').innerHTML=shops
      .filter(s=>city==='all'||s.city===city)
      .map(s=>`
        <article class="info-card shop">
          <span class="city">${esc(s.city)}</span>
          <h2>${esc(s.name)}</h2>
          <p>${esc(s.address)}</p>

          <div class="contact">
            <p>
              <a href="tel:+213${s.phone.slice(1)}" dir="ltr">
                ${s.phone.match(/.{1,2}/g).join(' ')}
              </a>
            </p>

            ${
              s.email
                ?`
                  <p>
                    <a href="mailto:${esc(s.email)}">
                      ${esc(s.email)}
                    </a>
                  </p>
                `
                :''
            }

            <p>
              <a
                href="${esc(s.mapsUrl||('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.name+' '+s.address+' Algérie')))}"
                target="_blank"
                rel="noopener noreferrer">
                ${L('Voir sur la carte','عرض على الخريطة')} ↗
              </a>
            </p>
          </div>
        </article>
      `).join('');
  }

  $('#city').onchange=list;
  list();
}

function information(warranty){
  $('#main').innerHTML=
    hero(
      warranty
        ?L('Garantie Samsung','ضمان سامسونج')
        :L('Comment ça marche','كيفية الشراء'),
      warranty
        ?L(
          'Les conditions applicables à votre référence.',
          'الشروط المطبّقة على مرجعك.'
        )
        :L(
          'Préparez votre sélection et contactez votre magasin.',
          'حضّر اختيارك وتواصل مع متجرك.'
        ),
      warranty
        ?L('Garantie','الضمان')
        :L('Votre parcours','خطواتك')
    )+
    `
      <div class="wrap content">
        ${
          warranty
            ?`
              <div class="notice">
                ${L(
                  'Les durées, extensions et conditions de garantie ne sont pas précisées dans le tarif communiqué. Demandez au BrandShop les conditions écrites applicables à votre référence avant l’achat.',
                  'لم تحدد قائمة الأسعار مدد الضمان أو تمديداته أو شروطه. اطلب من المتجر الشروط المكتوبة المطبقة على مرجعك قبل الشراء.'
                )}
              </div>
            `
            :`
              <div class="info-grid">
                ${[
                  [
                    L('Choisissez votre référence','اختر مرجعك'),
                    L(
                      'Comparez les produits, le prix remisé et les totaux des facilités de paiement.',
                      'قارن المنتجات والأسعار المخفضة وإجماليات تسهيلات الدفع.'
                    )
                  ],
                  [
                    L('Contactez le BrandShop','تواصل مع المتجر'),
                    L(
                      'Confirmez la disponibilité, la garantie et les modalités de l’offre employé.',
                      'أكّد التوفر والضمان وشروط عرض الموظفين.'
                    )
                  ],
                  [
                    L('Confirmez les conditions','أكّد الشروط'),
                    L(
                      'Faites préciser les justificatifs nécessaires, l’échéancier et les modalités de retrait avant votre achat.',
                      'اطلب توضيح المستندات المطلوبة وجدول الدفع وشروط الاستلام قبل الشراء.'
                    )
                  ]
                ].map(([title,desc],i)=>`
                  <div class="info-card">
                    <span class="number">0${i+1}</span>
                    <h2>${title}</h2>
                    <p>${desc}</p>
                  </div>
                `).join('')}
              </div>

              <p class="note">${L(
                'Les conditions d’éligibilité et de validation restent à confirmer auprès du magasin.',
                'تُؤكّد شروط الأهلية والموافقة مع المتجر.'
              )}</p>
            `
        }

        <p>
          <a class="button" href="#/brandshops">
            ${L('Contacter un BrandShop','التواصل مع متجر')}
          </a>
        </p>
      </div>
    `;
}

function render(scroll=true){
  try{
    currentRoute=decodeURIComponent(
      location.hash.slice(1)||'/catalogue'
    );
  }catch{
    currentRoute='/catalogue';
  }

  document.title='Samsung — '+L(
    'Catalogue employés',
    'كتالوج الموظفين'
  );

  chrome();

  if(currentRoute==='/catalogue'){
    catalogue();
  }else if(currentRoute==='/'){
    home();
  }else if(currentRoute.startsWith('/produit/')){
    detail(currentRoute.slice(9));
  }else if(currentRoute==='/paiement'){
    payments();
  }else if(currentRoute==='/brandshops'){
    brandshops();
  }else if(currentRoute==='/garantie'){
    information(true);
  }else if(currentRoute==='/comment-ca-marche'){
    information(false);
  }else{
    $('#main').innerHTML=`
      <div class="wrap content empty">
        <h1>${L('Page introuvable','الصفحة غير موجودة')}</h1>

        <a class="button" href="#/catalogue">
          ${L('Retour au catalogue','العودة إلى الكتالوج')}
        </a>
      </div>
    `;
  }

  if(scroll){
    window.scrollTo(0,0);
    $('#main').focus({preventScroll:true});
  }
}

window.addEventListener('hashchange',()=>render());
render(false);
