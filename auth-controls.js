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
  function demarrer() {
    const entete = document.getElementById('header');
    if (!entete) return;
    afficherDeconnexion();
    new MutationObserver(afficherDeconnexion).observe(entete, {childList: true});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer, {once: true});
  } else {
    demarrer();
  }
})();