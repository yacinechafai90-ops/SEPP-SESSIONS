'use strict';
// Tableau de bord des ventes : calculé à partir des commandes déjà chargées par admin-commandes.js.
(function () {
  const DUREES = { cash: 'Comptant', '6': '6 mois', '12': '12 mois', '18': '18 mois', '24': '24 mois' };
  let donnees = [];

  const $ = (id) => document.getElementById(id);
  const echapper = (valeur) => String(valeur ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nombre = (valeur) => new Intl.NumberFormat('fr-FR').format(Math.round(Number(valeur) || 0));
  const dinars = (valeur) => nombre(valeur) + ' DA';
  const court = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' M' : v >= 1e3 ? Math.round(v / 1e3) + ' k' : String(Math.round(v)));
  const jour0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const aujourdhui = () => jour0(new Date());
  const cleJour = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const cleSemaine = (d) => { const x = jour0(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return cleJour(x); };
  const libelleCle = (k) => { const [, m, j] = k.split('-'); return `${j}/${m}`; };
  const dateTexte = (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Date réelle : champ ISO fourni par l'API, sinon date d'affichage dd/mm/yyyy HH:MM.
  function dateDe(c) {
    if (c.iso) return new Date(c.iso);
    const m = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?/.exec(c.date || '');
    return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) : new Date();
  }
  const joursDepuis = (c) => Math.round((aujourdhui() - jour0(dateDe(c))) / 86400000);
  const montantDe = (c) => Number(c.montant) || 0;
  const mensualiteDe = (c) => (c.duree === 'cash' ? 0 : Number(c.mensualite) || 0);
  const unitesDe = (c) => (c.lignes || []).reduce((a, l) => a + Number(l.qty || 0), 0);

  function debutPeriode() {
    const p = $('tb-periode').value;
    if (p === 'tout') {
      const dates = donnees.map(dateDe);
      return dates.length ? jour0(new Date(Math.min(...dates))) : aujourdhui();
    }
    const d = aujourdhui();
    d.setDate(d.getDate() - Number(p) + 1);
    return d;
  }
  function filtrees() {
    const debut = debutPeriode(), boutique = $('tb-boutique').value;
    return donnees.filter((c) => dateDe(c) >= debut && (!boutique || c.boutique === boutique));
  }
  // Découpage du temps : par jour, ou par semaine au-delà de 31 jours.
  function periodes() {
    const debut = debutPeriode(), fin = aujourdhui();
    const nbJours = Math.round((fin - debut) / 86400000) + 1;
    const semaine = $('tb-granularite').value === 'semaine' || nbJours > 31;
    const cle = semaine ? cleSemaine : cleJour;
    const cles = [];
    for (let d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) {
      const k = cle(d);
      if (!cles.includes(k)) cles.push(k);
    }
    return { cles, cle, semaine };
  }

  function remplirFiltres() {
    const boutique = $('tb-boutique'), actuelle = boutique.value;
    const noms = [...new Set(donnees.map((c) => c.boutique).filter(Boolean))].sort();
    boutique.innerHTML = '<option value="">Toutes</option>' + noms.map((n) => `<option value="${echapper(n)}">${echapper(n)}</option>`).join('');
    boutique.value = noms.includes(actuelle) ? actuelle : '';

    const entreprise = $('tb-entreprise'), choisie = entreprise.value;
    const entreprises = [...new Set(donnees.map((c) => c.entreprise).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    entreprise.innerHTML = entreprises.map((e) => `<option value="${echapper(e)}">${echapper(e)}</option>`).join('');
    if (entreprises.includes(choisie)) entreprise.value = choisie;
  }

  function kpis(L) {
    const total = L.reduce((a, c) => a + montantDe(c), 0);
    const qte = L.reduce((a, c) => a + unitesDe(c), 0);
    const mens = L.reduce((a, c) => a + mensualiteDe(c), 0);
    const recup = L.filter((c) => c.statut === 'recuperee').length;
    const vieux = L.filter((c) => c.statut === 'attente' && joursDepuis(c) > 7).length;
    const carte = (titre, valeur, detail, classe = '') => `<article><span>${titre}</span><strong class="${classe}">${valeur}</strong><small>${detail}</small></article>`;
    $('tb-kpis').innerHTML = [
      carte('Commandes', nombre(L.length), "bons d'enlèvement"),
      carte('Total comptant', dinars(total), 'total des ventes'),
      carte('Panier moyen', dinars(L.length ? total / L.length : 0), 'par commande'),
      carte('Unités vendues', nombre(qte), 'produits sortis'),
      carte('Mensualités cumulées', dinars(mens), 'financements, par mois'),
      carte('Taux de récupération', (L.length ? Math.round((recup / L.length) * 100) : 0) + ' %', recup + ' récupérées'),
      carte('En attente > 7 jours', nombre(vieux), 'à relancer', vieux ? 'alerte' : ''),
    ].join('');
  }

  function timeline(L) {
    const { cles, cle } = periodes();
    const montants = cles.map(() => 0), comptes = cles.map(() => 0);
    L.forEach((c) => { const i = cles.indexOf(cle(dateDe(c))); if (i >= 0) { montants[i] += montantDe(c); comptes[i]++; } });
    const W = 720, H = 260, pl = 58, pt = 12, pr = 10, pb = 30, iw = W - pl - pr, ih = H - pt - pb;
    const maxM = Math.max(1, ...montants), maxC = Math.max(1, ...comptes), n = cles.length;
    const X = (i) => pl + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
    const Y = (v) => pt + ih - (v / maxM) * ih;
    const bw = Math.max(3, (iw / n) * 0.55);
    const pts = montants.map((v, i) => [X(i), Y(v)]);
    const ligne = 'M' + pts.map((q) => q.join(',')).join(' L');
    const aire = `${ligne} L${X(n - 1)},${pt + ih} L${X(0)},${pt + ih} Z`;
    let svg = '';
    for (let k = 0; k <= 4; k++) {
      const y = pt + (ih * k) / 4;
      svg += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="#eef1f7"/><text x="${pl - 8}" y="${y + 4}" text-anchor="end">${court(maxM * (1 - k / 4))}</text>`;
    }
    comptes.forEach((c, i) => { if (c) svg += `<rect x="${X(i) - bw / 2}" y="${pt + ih - (c / maxC) * ih}" width="${bw}" height="${(c / maxC) * ih}" fill="#f5a524" opacity=".35" rx="2"><title>${libelleCle(cles[i])} : ${c} commande(s)</title></rect>`; });
    svg += `<path d="${aire}" fill="#1428a0" opacity=".08"/><path d="${ligne}" fill="none" stroke="#1428a0" stroke-width="2.2" stroke-linejoin="round"/>`;
    pts.forEach((q, i) => { svg += `<circle cx="${q[0]}" cy="${q[1]}" r="3" fill="#1428a0"><title>${libelleCle(cles[i])} : ${nombre(montants[i])} DA · ${comptes[i]} commande(s)</title></circle>`; });
    const pas = Math.ceil(n / 8);
    cles.forEach((k, i) => { if (i % pas === 0) svg += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${libelleCle(k)}</text>`; });
    $('tb-timeline').innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Évolution des ventes">${svg}</svg>`;
  }

  // Carte de chaleur : quels produits se vendent à quelle période.
  function carteChaleur(L) {
    const { cles, cle, semaine } = periodes();
    const m = {};
    L.forEach((c) => {
      const i = cles.indexOf(cle(dateDe(c)));
      if (i < 0) return;
      (c.lignes || []).forEach((l) => {
        m[l.nom] = m[l.nom] || { nom: l.nom, q: cles.map(() => 0), tot: 0 };
        m[l.nom].q[i] += Number(l.qty) || 0;
        m[l.nom].tot += Number(l.qty) || 0;
      });
    });
    const lignes = Object.values(m).sort((a, b) => b.tot - a.tot).slice(0, 10);
    const max = Math.max(1, ...lignes.flatMap((p) => p.q));
    let pic = { q: 0 };
    lignes.forEach((p) => p.q.forEach((q, i) => { if (q > pic.q) pic = { q, nom: p.nom, i }; }));
    $('tb-pic').textContent = pic.q
      ? `Pic de ventes : ${pic.nom}, ${pic.q} unité(s) ${semaine ? 'la semaine du' : 'le'} ${libelleCle(cles[pic.i])}.`
      : 'Aucune vente sur cette période.';
    if (!lignes.length) { $('tb-heatmap').innerHTML = '<p class="tb-vide">Aucune vente sur cette période.</p>'; return; }
    const w = cles.length > 31 ? 26 : 40;
    const entete = '<tr><th></th>' + cles.map((k) => `<th style="font-size:10px;width:${w}px">${libelleCle(k)}</th>`).join('') + '</tr>';
    const corps = lignes.map((p) => `<tr><td class="tb-nom">${echapper(p.nom)}</td>` + p.q.map((q, i) => {
      const f = q / max;
      return `<td><div class="tb-cellule" title="${echapper(p.nom)} · ${libelleCle(cles[i])} : ${q} unité(s)" style="width:${w}px;background:rgba(20,40,160,${q ? 0.12 + 0.88 * f : 0});color:${f > 0.55 ? '#fff' : '#071332'}">${q || ''}</div></td>`;
    }).join('') + '</tr>').join('');
    $('tb-heatmap').innerHTML = `<div class="tb-defile"><table class="tb-heat">${entete}${corps}</table></div>`;
  }

  function donut(L) {
    const r = 58, C = 2 * Math.PI * r, tot = L.length || 1;
    const rec = L.filter((c) => c.statut === 'recuperee').length, att = L.length - rec;
    let off = 0;
    const arcs = [[rec, '#137a3e'], [att, '#f5a524']].map(([v, couleur]) => {
      const len = (v / tot) * C;
      const s = `<circle r="${r}" cx="90" cy="90" fill="none" stroke="${couleur}" stroke-width="24" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"/>`;
      off += len;
      return s;
    }).join('');
    $('tb-donut').innerHTML = `<svg viewBox="0 0 180 180" width="180" height="180" class="tb-donut"><circle r="${r}" cx="90" cy="90" fill="none" stroke="#eef2fb" stroke-width="24"/>${arcs}<text x="90" y="88" text-anchor="middle" class="tb-gros">${nombre(L.length)}</text><text x="90" y="106" text-anchor="middle">commandes</text></svg>`;
    $('tb-legende-statut').innerHTML = `<span><i class="tb-pastille" style="background:#137a3e"></i>Récupérées ${rec} (${Math.round((rec / tot) * 100)} %)</span><span><i class="tb-pastille" style="background:#f5a524"></i>En attente ${att}</span>`;
  }

  function barres(items, valeurTexte) {
    const max = Math.max(1, ...items.map((i) => i.v));
    return items.map((i) => `<div class="tb-barre"><span class="tb-libelle" title="${echapper(i.l)}">${echapper(i.l)}</span><div class="tb-piste"><div class="tb-fill" style="width:${(i.v / max) * 100}%"></div></div><span class="tb-val">${valeurTexte(i)}</span></div>`).join('')
      || '<p class="tb-vide">Aucune donnée sur cette période.</p>';
  }

  function produits(L) {
    const m = {};
    L.forEach((c) => (c.lignes || []).forEach((l) => {
      m[l.nom] = m[l.nom] || { l: l.nom, v: 0, q: 0, n: 0 };
      m[l.nom].v += (Number(l.prix) || 0) * (Number(l.qty) || 0);
      m[l.nom].q += Number(l.qty) || 0;
      m[l.nom].n++;
    }));
    const liste = Object.values(m).sort((a, b) => b.v - a.v);
    const total = liste.reduce((a, p) => a + p.v, 0) || 1;
    $('tb-produits').innerHTML = barres(liste.slice(0, 8), (i) => court(i.v) + ' · ' + Math.round((i.v / total) * 100) + ' %');
    $('tb-tab-produits').innerHTML = '<tr><th>Produit</th><th class="n">Unités</th><th class="n">Lignes</th><th class="n">Montant</th><th class="n">Part</th></tr>'
      + liste.map((p) => `<tr><td>${echapper(p.l)}</td><td class="n">${nombre(p.q)}</td><td class="n">${p.n}</td><td class="n">${nombre(p.v)}</td><td class="n">${Math.round((p.v / total) * 100)} %</td></tr>`).join('');
  }

  function boutiques(L) {
    const m = {};
    L.forEach((c) => { const k = c.boutique || '—'; m[k] = m[k] || { l: k, v: 0, n: 0 }; m[k].v += montantDe(c); m[k].n++; });
    $('tb-boutiques').innerHTML = barres(Object.values(m).sort((a, b) => b.v - a.v), (i) => court(i.v) + ' · ' + i.n + ' cmd');
  }

  function durees(L) {
    const m = {};
    ['cash', '6', '12', '18', '24'].forEach((d) => { m[d] = { l: DUREES[d], v: 0, n: 0, mens: 0 }; });
    L.forEach((c) => { const g = m[c.duree]; if (!g) return; g.v++; g.n++; g.mens += mensualiteDe(c); });
    $('tb-durees').innerHTML = barres(Object.values(m), (i) => i.n + ' cmd' + (i.n && i.mens ? ' · ' + nombre(i.mens / i.n) + ' DA /mois' : ''));
  }

  function entreprises(L) {
    const m = {};
    L.forEach((c) => { const k = c.entreprise || '—'; m[k] = m[k] || { e: k, n: 0, v: 0 }; m[k].n++; m[k].v += montantDe(c); });
    const liste = Object.values(m).sort((a, b) => b.v - a.v).slice(0, 10);
    $('tb-tab-entreprises').innerHTML = '<tr><th>Entreprise</th><th class="n">Commandes</th><th class="n">Montant</th></tr>'
      + liste.map((e) => `<tr class="tb-cliquable" data-e="${echapper(e.e)}"><td>${echapper(e.e)}</td><td class="n">${e.n}</td><td class="n">${nombre(e.v)}</td></tr>`).join('')
      || '<tr><td colspan="3">Aucune commande.</td></tr>';
    if (!$('tb-entreprise').value && liste[0]) $('tb-entreprise').value = liste[0].e;
  }

  // Détail d'une entreprise : totaux, produits achetés, commandes.
  function detailEntreprise(L) {
    const choix = $('tb-entreprise').value;
    const cmds = L.filter((c) => c.entreprise === choix).sort((a, b) => dateDe(b) - dateDe(a));
    if (!cmds.length) { $('tb-detail').innerHTML = '<p class="tb-vide">Aucune commande pour cette entreprise sur la période choisie.</p>'; return; }
    const total = cmds.reduce((a, c) => a + montantDe(c), 0);
    const unites = cmds.reduce((a, c) => a + unitesDe(c), 0);
    const mens = cmds.reduce((a, c) => a + mensualiteDe(c), 0);
    const m = {};
    cmds.forEach((c) => (c.lignes || []).forEach((l) => {
      m[l.nom] = m[l.nom] || { nom: l.nom, q: 0, v: 0 };
      m[l.nom].q += Number(l.qty) || 0;
      m[l.nom].v += (Number(l.prix) || 0) * (Number(l.qty) || 0);
    }));
    const produits = Object.values(m).sort((a, b) => b.v - a.v);
    $('tb-detail').innerHTML = `
      <div class="tb-mini">
        <div><small>Commandes</small><b>${cmds.length}</b></div>
        <div><small>Total comptant</small><b>${nombre(total)} DA</b></div>
        <div><small>Unités</small><b>${nombre(unites)}</b></div>
        <div><small>Mensualités</small><b>${nombre(mens)} DA</b></div>
      </div>
      <div class="tb-defile"><table>
        <tr><th>Produit</th><th class="n">Unités</th><th class="n">Montant</th></tr>
        ${produits.map((p) => `<tr><td>${echapper(p.nom)}</td><td class="n">${nombre(p.q)}</td><td class="n">${nombre(p.v)}</td></tr>`).join('')}
      </table></div>
      <div class="tb-defile" style="margin-top:12px"><table>
        <tr><th>Date</th><th>Produits</th><th class="n">Montant</th><th>Statut</th></tr>
        ${cmds.map((c) => `<tr><td>${dateTexte(dateDe(c))}</td><td class="tb-petit">${(c.lignes || []).map((l) => `${Number(l.qty)} × ${echapper(l.nom)}`).join(' · ')}<br>${echapper(c.boutique)} · ${echapper(c.ville)} · ${echapper(DUREES[c.duree] || c.duree)}</td><td class="n">${nombre(montantDe(c))}</td><td><span class="tb-pill ${c.statut === 'recuperee' ? 'recuperee' : 'attente'}">${c.statut === 'recuperee' ? 'Récupérée' : 'En attente'}</span></td></tr>`).join('')}
      </table></div>`;
  }

  function attente(L) {
    const liste = L.filter((c) => c.statut === 'attente').sort((a, b) => dateDe(a) - dateDe(b)).slice(0, 15);
    $('tb-tab-attente').innerHTML = '<tr><th>Date</th><th>Client</th><th>Entreprise</th><th>Téléphone</th><th>BrandShop</th><th class="n">Montant</th><th class="n">Jours</th></tr>'
      + liste.map((c) => {
        const j = joursDepuis(c);
        return `<tr><td>${dateTexte(dateDe(c))}</td><td>${echapper(c.nom)}</td><td>${echapper(c.entreprise)}</td><td>${echapper(c.telephone)}</td><td>${echapper(c.boutique)}</td><td class="n">${nombre(montantDe(c))}</td><td class="n ${j > 7 ? 'alerte' : ''}">${j}</td></tr>`;
      }).join('')
      || '<tr><td colspan="7">Aucune commande en attente.</td></tr>';
  }

  function rendre() {
    const L = filtrees();
    kpis(L); timeline(L); donut(L); carteChaleur(L); produits(L); boutiques(L); durees(L); entreprises(L); detailEntreprise(L); attente(L);
  }

  function init() {
    ['tb-periode', 'tb-boutique', 'tb-granularite'].forEach((id) => $(id).addEventListener('change', rendre));
    $('tb-entreprise').addEventListener('change', () => detailEntreprise(filtrees()));
    $('tb-tab-entreprises').addEventListener('click', (e) => {
      const ligne = e.target.closest('tr[data-e]');
      if (!ligne) return;
      $('tb-entreprise').value = ligne.dataset.e;
      detailEntreprise(filtrees());
      $('tb-entreprise').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // Les commandes sont chargées (ou leur statut change) par admin-commandes.js.
    document.addEventListener('commandes-chargees', (e) => {
      donnees = e.detail || [];
      remplirFiltres();
      rendre();
    });
  }
  init();
}());
