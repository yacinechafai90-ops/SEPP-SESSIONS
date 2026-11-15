'use strict';
(function () {
  function afficherDeconnexion() {
    const entete = document.querySelector('#header .header-row');
    if (!entete || entete.querySelector('#deconnexion-form')) return;
    const formulaire = document.createElement('form');
    formulaire.id = 'deconnexion-form';
    formulaire.method = 'post';
    formulaire.action = '/deconnexion';
    formulaire.innerHTML = '<button type="submit" aria-label="Déconnexion">Déconnexion</button>';
    entete.appendChild(formulaire);
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
  function afficherBienvenue() {
    const entete = document.querySelector('#header .header-row');
    if (!entete || entete.querySelector('#bienvenue')) return;
    lireIdentifiant().then((nom) => {
      if (!nom || entete.querySelector('#bienvenue')) return;
      const message = document.createElement('span');
      message.id = 'bienvenue';
      message.textContent = document.documentElement.lang === 'ar' ? 'مرحباً، ' + nom : 'Bienvenue, ' + nom;
      entete.insertBefore(message, entete.querySelector('#deconnexion-form'));
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