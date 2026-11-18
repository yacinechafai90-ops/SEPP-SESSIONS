'use strict';
(function () {
  // Déconnexion : rangée dans le menu Paramètres.
  function afficherDeconnexion() {
    const cible = document.getElementById('settings-logout');
    if (!cible || cible.querySelector('#deconnexion-form')) return;
    const formulaire = document.createElement('form');
    formulaire.id = 'deconnexion-form';
    formulaire.method = 'post';
    formulaire.action = '/deconnexion';
    formulaire.innerHTML = '<button type="submit" aria-label="Déconnexion">Déconnexion</button>';
    cible.appendChild(formulaire);
  }
  // Identifiant du client connecté (une seule requête, puis mémorisé).
  let identifiant = null;
  function lireIdentifiant() {
    if (identifiant !== null) return Promise.resolve(identifiant);
    return fetch('/api/moi', {credentials: 'same-origin'})
      .then((reponse) => (reponse.ok ? reponse.json() : {}))
      .then((donnees) => { identifiant = donnees.identifiant || ''; return identifiant; })
      .catch(() => '');
  }
  // Le titre « Offres employés » du bandeau devient « Bienvenue, <nom> ».
  function afficherBienvenue() {
    const marque = document.querySelector('#header .brand span');
    if (!marque || marque.classList.contains('welcome')) return;
    lireIdentifiant().then((nom) => {
      const cible = document.querySelector('#header .brand span');
      if (!nom || !cible || cible.classList.contains('welcome')) return;
      cible.textContent = document.documentElement.lang === 'ar' ? 'مرحباً، ' + nom : 'Bienvenue, ' + nom;
      cible.classList.add('welcome');
    });
  }
  function mettreAJour() {
    afficherDeconnexion();
    afficherBienvenue();
  }
  function demarrer() {
    const entete = document.getElementById('header');
    if (!entete) return;
    mettreAJour();
    new MutationObserver(mettreAJour).observe(entete, {childList: true});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer, {once: true});
  } else {
    demarrer();
  }
})();
