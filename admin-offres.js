'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const state = {utilisateurs: [], produits: [], attributions: [], comptes: [], boutiques: [], affectations: []};
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const message = (text, error = false) => { $('offre-message').textContent = text; $('offre-message').className = error ? 'erreur' : 'ok'; };
  const selected = () => Number($('offre-utilisateur').value);
  async function api(path, method = 'GET', body) {
    const form = body instanceof FormData;
    const response = await fetch('/admin/api/' + path, {method, credentials:'same-origin',
      headers:{'X-Admin':'oui', ...(!form && body ? {'Content-Type':'application/json'} : {})},
      body:form ? body : body ? JSON.stringify(body) : undefined});
    if (response.redirected) throw Error('Session administrateur expirée : reconnectez-vous.');
    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) throw Error('Le serveur local ne répond pas avec l’API des sessions. Fermez l’ancienne fenêtre du serveur et relancez DEMARRER-SITE.cmd, puis actualisez cette page.');
    const data = await response.json();
    if (!response.ok) throw Error(data.erreur || 'Opération impossible.');
    return data;
  }
  async function charger(preferred) {
    const current = preferred ?? $('offre-utilisateur').value;
    const [offres, sessions] = await Promise.all([api('offres'), api('sessions')]);
    Object.assign(state, offres, sessions);
    $('offre-utilisateur').innerHTML = '<option value="">Choisir une session</option>' +
      state.comptes.map(u => `<option value="${u.id}">${escape(u.identifiant)}${u.actif ? '' : ' (désactivée)'}</option>`).join('');
    $('offre-utilisateur').value = String(current);
    $('offre-produit').innerHTML = '<option value="">Choisir un produit</option>' +
      state.produits.map(p => `<option value="${escape(p.reference)}">${escape(p.reference)} — ${escape(p.name)}</option>`).join('');
    afficher();
  }
  function afficher() {
    const user = selected();
    const compte = state.comptes.find(u => u.id === user);
    const lignes = state.attributions.filter(a => a.utilisateur_id === user);
    $('session-toggle').title = compte?.actif ? 'Désactiver la session' : 'Activer la session';
    $('session-toggle').setAttribute('aria-label', $('session-toggle').title);
    for (const id of ['session-edit','session-toggle','session-delete','save-brandshops']) $(id).disabled = !compte;
    $('table-offres').querySelector('tbody').innerHTML = lignes.length
      ? lignes.map(a => `<tr><td>${escape(a.reference)}</td><td>${a.prix_offre == null ? 'Prix général' : escape(a.prix_offre) + ' DA'}</td><td><button class="icon-action" type="button" data-edit="${escape(a.reference)}" title="Modifier" aria-label="Modifier ${escape(a.reference)}">✎</button> <button class="icon-action danger" type="button" data-remove="${escape(a.reference)}" title="Retirer" aria-label="Retirer ${escape(a.reference)}">🗑</button></td></tr>`).join('')
      : '<tr><td colspan="3">Aucun produit attribué à cette session.</td></tr>';
    const ids = new Set(state.affectations.filter(a => a.utilisateur_id === user).map(a => a.brandshop_id));
    $('brandshop-list').innerHTML = compte ? state.boutiques.map(b => `<label><input type="checkbox" value="${b.id}" ${compte.tous_brandshops || ids.has(b.id) ? 'checked' : ''}>${escape(b.name)} — ${escape(b.city)}</label>`).join('') : '<p>Choisissez une session.</p>';
  }
  $('offre-utilisateur').addEventListener('change', afficher);
  $('table-offres').addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit]'), remove = event.target.closest('[data-remove]');
    if (edit) {
      const row = state.attributions.find(a => a.utilisateur_id === selected() && a.reference === edit.dataset.edit);
      $('offre-produit').value = row.reference; $('offre-prix').value = row.prix_offre ?? ''; $('offre-prix').focus();
    }
    if (remove && confirm('Retirer ce produit de cette session ?')) {
      try { await api('offres','DELETE',{utilisateur_id:selected(),reference:remove.dataset.remove}); await charger(); message('Produit retiré.'); }
      catch(error) { message(error.message,true); }
    }
  });
  $('form-offre').addEventListener('submit', async event => {
    event.preventDefault();
    try { await api('offres','PUT',{utilisateur_id:selected(),reference:$('offre-produit').value,prix_offre:$('offre-prix').value}); await charger(); message('Offre enregistrée.'); }
    catch(error) { message(error.message,true); }
  });
  let editingId = null;
  function showSessionDialog(compte = null) {
    editingId = compte?.id ?? null;
    $('session-dialog-title').textContent = compte ? 'Modifier la session' : 'Ajouter une session';
    $('session-identifiant').value = compte?.identifiant ?? '';
    $('session-password').value = '';
    $('session-password').required = !compte;
    $('session-password-help').textContent = compte ? 'Laissez vide pour conserver le mot de passe.' : '12 caractères minimum.';
    $('session-error').textContent = '';
    $('session-dialog').showModal();
  }
  $('session-add').onclick = () => showSessionDialog();
  $('session-edit').onclick = () => {
    const compte = state.comptes.find(u => u.id === selected());
    if (compte) showSessionDialog(compte);
  };
  $('session-cancel').onclick = () => $('session-dialog').close();
  $('session-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const payload = {identifiant:$('session-identifiant').value.trim(), mot_de_passe:$('session-password').value};
      const result = editingId ? await api('sessions/'+editingId,'PUT',payload) : await api('sessions','POST',payload);
      const accountId = editingId ?? result.id;
      $('session-dialog').close();
      await charger(accountId);
      message(editingId ? 'Session modifiée.' : 'Session créée. Attribuez-lui des produits et des brandshops.');
    } catch(error) { $('session-error').textContent = error.message; }
  });
  $('session-toggle').onclick = async () => {
    const compte = state.comptes.find(u => u.id === selected()); if (!compte) return;
    try { await api('sessions/'+compte.id+'/statut','POST',{actif:!compte.actif}); await charger(compte.id); message(compte.actif ? 'Session désactivée.' : 'Session activée.'); }
    catch(error) { message(error.message,true); }
  };
  $('session-delete').onclick = async () => {
    const compte = state.comptes.find(u => u.id === selected()); if (!compte || !confirm('Supprimer définitivement cette session et toutes ses offres ?')) return;
    try { await api('sessions/'+compte.id,'DELETE'); await charger(''); message('Session supprimée.'); }
    catch(error) { message(error.message,true); }
  };
  $('save-brandshops').onclick = async () => {
    if (!selected()) return;
    const ids = [...$('brandshop-list').querySelectorAll('input:checked')].map(i => Number(i.value));
    try { await api('sessions/'+selected()+'/brandshops','PUT',{ids}); await charger(); message('Brandshops enregistrés.'); }
    catch(error) { message(error.message,true); }
  };
  $('form-import').addEventListener('submit', async event => {
    event.preventDefault(); if (!selected()) { message('Choisissez une session.',true); return; }
    const file = $('offre-excel').files[0]; if (!file) return;
    const form = new FormData(); form.append('fichier',file);
    try { const result=await api('sessions/'+selected()+'/import-excel','POST',form); await charger(); message(result.imported+' prix importés ou mis à jour.'); $('offre-excel').value=''; }
    catch(error) { message(error.message,true); }
  });
  charger().catch(error => message(error.message,true));
})();