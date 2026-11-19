'use strict';
(function () {
  const API = '/admin/api/commandes';
  const CLE_RAPPELS = 'admin-commandes-rappels';
  const DUREES = { cash: 'Comptant', '6': '6 mois', '12': '12 mois', '18': '18 mois', '24': '24 mois' };
  const STATUTS = { attente: 'En attente', recuperee: 'Récupérée' };
  let commandes = [];
  let filtrees = [];

  const $ = (id) => document.getElementById(id);
  const echapper = (valeur) => String(valeur ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const dinars = (valeur) => new Intl.NumberFormat('fr-FR').format(Math.round(Number(valeur) || 0)) + ' DA';
  const nombre = (valeur) => new Intl.NumberFormat('fr-FR').format(Math.round(Number(valeur) || 0));

  // Date d'affichage (dd/mm/yyyy HH:MM) -> date ISO (yyyy-mm-dd) pour les filtres.
  function dateIso(texte) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texte || '');
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  }

  function lireRappels() {
    try { return JSON.parse(localStorage.getItem(CLE_RAPPELS) || '[]'); } catch (e) { return []; }
  }
  function ecrireRappels(liste) {
    try { localStorage.setItem(CLE_RAPPELS, JSON.stringify(liste)); } catch (e) { /* stockage indisponible */ }
  }

  function remplirBoutiques() {
    const select = $('f-boutique');
    const actuelle = select.value;
    const noms = [...new Set(commandes.map((c) => c.boutique).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Tous</option>' + noms.map((n) => `<option value="${echapper(n)}">${echapper(n)}</option>`).join('');
    select.value = noms.includes(actuelle) ? actuelle : '';
  }

  function appliquerFiltres() {
    const recherche = $('f-recherche').value.trim().toLowerCase();
    const statut = $('f-statut').value;
    const boutique = $('f-boutique').value;
    const duree = $('f-duree').value;
    const du = $('f-du').value;
    const au = $('f-au').value;
    filtrees = commandes.filter((c) => {
      if (statut && c.statut !== statut) return false;
      if (boutique && c.boutique !== boutique) return false;
      if (duree && String(c.duree) !== duree) return false;
      const jour = dateIso(c.date);
      if (du && jour < du) return false;
      if (au && jour > au) return false;
      if (recherche) {
        const texte = [c.nom, c.entreprise, c.ville, c.telephone, c.boutique, c.session, ...(c.lignes || []).map((l) => l.reference + ' ' + l.nom)].join(' ').toLowerCase();
        if (!texte.includes(recherche)) return false;
      }
      return true;
    });
    afficher();
  }

  function afficher() {
    const total = commandes.length;
    const attente = commandes.filter((c) => c.statut === 'attente').length;
    const recuperee = commandes.filter((c) => c.statut === 'recuperee').length;
    const montant = filtrees.reduce((somme, c) => somme + (Number(c.montant) || 0), 0);
    $('kpi-total').textContent = nombre(total);
    $('kpi-attente').textContent = nombre(attente);
    $('kpi-recuperee').textContent = nombre(recuperee);
    $('kpi-montant').textContent = dinars(montant);
    $('compte').textContent = `${nombre(filtrees.length)} commande(s) affichée(s) sur ${nombre(total)}`;
    $('vide').hidden = filtrees.length > 0;

    $('corps').innerHTML = filtrees.map((c) => {
      const produits = (c.lignes || []).map((l) => `${echapper(l.reference)} × ${l.qty}`).join('<br>');
      const mensualite = c.duree === 'cash' ? '—' : dinars(c.mensualite);
      return `<tr data-id="${c.id}">
        <td>${echapper(c.date)}</td>
        <td><strong>${echapper(c.nom)}</strong></td>
        <td>${echapper(c.entreprise)}</td>
        <td>${echapper(c.ville)}</td>
        <td>${echapper(c.telephone)}</td>
        <td>${echapper(c.boutique)}</td>
        <td>${echapper(DUREES[c.duree] || c.duree)}</td>
        <td class="num">${dinars(c.montant)}</td>
        <td class="num">${mensualite}</td>
        <td class="produits">${produits}</td>
        <td>${echapper(c.session)}</td>
        <td>
          <span class="badge ${echapper(c.statut)}">${echapper(STATUTS[c.statut] || c.statut)}</span>
          <div class="statut-boutons" style="margin-top:6px">
            <button type="button" data-statut="attente" aria-pressed="${c.statut === 'attente'}">En attente</button>
            <button type="button" data-statut="recuperee" aria-pressed="${c.statut === 'recuperee'}">Récupérée</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  async function charger() {
    $('compte').textContent = 'Chargement…';
    try {
      const reponse = await fetch(API, { credentials: 'same-origin' });
      if (!reponse.ok) throw new Error('HTTP ' + reponse.status);
      const donnees = await reponse.json();
      commandes = donnees.commandes || [];
      remplirBoutiques();
      appliquerFiltres();
    } catch (erreur) {
      $('compte').textContent = 'Impossible de charger les commandes (' + erreur.message + ').';
    }
  }

  async function changerStatut(id, statut, bouton) {
    const ligne = bouton.closest('tr');
    ligne.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      const reponse = await fetch(`${API}/${id}/statut`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      });
      if (!reponse.ok) throw new Error('HTTP ' + reponse.status);
      const commande = commandes.find((c) => c.id === id);
      if (commande) commande.statut = statut;
      appliquerFiltres();
    } catch (erreur) {
      window.alert('Changement de statut impossible : ' + erreur.message);
      ligne.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
  }

  // Export : lignes des commandes actuellement filtrées.
  function lignesExport() {
    const entete = ['Date', 'Client', 'Entreprise', 'Ville', 'Téléphone', 'BrandShop', 'Durée', 'Montant comptant (DA)', 'Mensualité (DA)', 'Produits', 'Session', 'Statut'];
    const corps = filtrees.map((c) => [
      c.date, c.nom, c.entreprise, c.ville, c.telephone, c.boutique, DUREES[c.duree] || c.duree,
      Math.round(c.montant), c.duree === 'cash' ? '' : Math.round(c.mensualite),
      (c.lignes || []).map((l) => `${l.reference} x${l.qty}`).join(' | '), c.session, STATUTS[c.statut] || c.statut,
    ]);
    return [entete, ...corps];
  }

  function nomFichier(extension) {
    const maintenant = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `commandes-${maintenant.getFullYear()}-${p(maintenant.getMonth() + 1)}-${p(maintenant.getDate())}.${extension}`;
  }

  function telecharger(contenu, type, nom) {
    const blob = new Blob([contenu], { type });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nom;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exporterCsv() {
    // Point-virgule et BOM : ouverture directe dans Excel en français.
    const texte = lignesExport().map((ligne) => ligne.map((cellule) => {
      const v = String(cellule ?? '');
      return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(';')).join('\r\n');
    telecharger('﻿' + texte, 'text/csv;charset=utf-8', nomFichier('csv'));
  }

  function exporterXls() {
    // Tableau HTML reconnu par Excel comme feuille de calcul (.xls).
    const lignes = lignesExport();
    const [entete, ...corps] = lignes;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">
      <tr>${entete.map((t) => `<th>${echapper(t)}</th>`).join('')}</tr>
      ${corps.map((l) => `<tr>${l.map((v) => `<td>${echapper(v)}</td>`).join('')}</tr>`).join('')}
    </table></body></html>`;
    telecharger(html, 'application/vnd.ms-excel;charset=utf-8', nomFichier('xls'));
  }

  // Rappels datés : affichés en bandeau le jour venu ou après.
  function afficherRappels() {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const rappels = lireRappels().sort((a, b) => a.date.localeCompare(b.date));
    const liste = $('liste-rappels');
    liste.innerHTML = rappels.length ? rappels.map((r) => `
      <li class="${r.date <= aujourdhui ? 'echu' : ''}">
        <span><strong>${echapper(r.date.split('-').reverse().join('/'))}</strong> — ${echapper(r.note || 'Extraction des commandes')}${r.date <= aujourdhui ? ' <em>(à faire)</em>' : ''}</span>
        <button type="button" class="supprimer" data-id="${echapper(r.id)}">Supprimer</button>
      </li>`).join('') : '<li>Aucun rappel programmé.</li>';

    const echus = rappels.filter((r) => r.date <= aujourdhui && !r.vu);
    const bandeau = $('rappel');
    bandeau.hidden = echus.length === 0;
    if (echus.length) {
      $('rappel-titre').textContent = 'Rappel : extraction à faire';
      $('rappel-texte').textContent = echus.map((r) => r.note || 'Extraction des commandes').join(' · ') + ' — exportez le tableau en CSV ou Excel.';
    }
  }

  function ajouterRappel(evenement) {
    evenement.preventDefault();
    const date = $('r-date').value;
    if (!date) return;
    const rappels = lireRappels();
    rappels.push({ id: String(Date.now()), date, note: $('r-note').value.trim(), vu: false });
    ecrireRappels(rappels);
    $('r-date').value = '';
    $('r-note').value = '';
    afficherRappels();
  }

  function init() {
    ['f-recherche', 'f-statut', 'f-boutique', 'f-duree', 'f-du', 'f-au'].forEach((id) => {
      $(id).addEventListener(id === 'f-recherche' ? 'input' : 'change', appliquerFiltres);
    });
    $('f-reset').addEventListener('click', () => {
      $('filtres').reset();
      appliquerFiltres();
    });
    $('actualiser').addEventListener('click', charger);
    $('exporter-csv').addEventListener('click', exporterCsv);
    $('exporter-xls').addEventListener('click', exporterXls);

    $('corps').addEventListener('click', (evenement) => {
      const bouton = evenement.target.closest('button[data-statut]');
      if (!bouton) return;
      const id = Number(bouton.closest('tr').dataset.id);
      changerStatut(id, bouton.dataset.statut, bouton);
    });

    $('rappel-form').addEventListener('submit', ajouterRappel);
    $('liste-rappels').addEventListener('click', (evenement) => {
      const bouton = evenement.target.closest('button.supprimer');
      if (!bouton) return;
      ecrireRappels(lireRappels().filter((r) => r.id !== bouton.dataset.id));
      afficherRappels();
    });
    $('rappel-ok').addEventListener('click', () => {
      const aujourdhui = new Date().toISOString().slice(0, 10);
      ecrireRappels(lireRappels().map((r) => (r.date <= aujourdhui ? { ...r, vu: true } : r)));
      afficherRappels();
    });

    afficherRappels();
    charger();
  }

  init();
}());
