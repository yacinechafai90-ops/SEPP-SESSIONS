'use strict';
(() => {
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=v=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const state={users:[],detail:null,tab:'products',editAccount:null,banners:[]};
const uid=()=>Number($('session-select').value);
const scope=()=>document.querySelector('input[name="change-scope"]:checked').value;
const scopeText=()=>scope()==='all'?'toutes les sessions existantes':'la session sélectionnée';
const confirmScope=action=>scope()!=='all'||confirm(`${action} pour toutes les sessions existantes ?`);
const notice=(text,error=false)=>{$('notice').textContent=text;$('notice').className=error?'error':'ok'};
// Routes par session qui reçoivent la portée (selected / all) côté serveur.
const ROUTES_PORTEE=/^sessions\/\d+\/(products|shops|specs|discounts|formules|import|remise-minimum)(\/|$)/;
async function api(path,method='GET',body){
 if(method!=='GET'&&ROUTES_PORTEE.test(path)){
  if(body instanceof FormData)body.set('scope',scope());
  else body={...(body||{}),scope:scope()};
 }
 const form=body instanceof FormData;
 const response=await fetch('/admin/api/'+path,{method,credentials:'same-origin',headers:{'X-Admin':'oui',...(!form&&body?{'Content-Type':'application/json'}:{})},body:form?body:body?JSON.stringify(body):undefined});
 if(response.redirected)throw Error('Session admin expirée. Reconnectez-vous.');
 if(!(response.headers.get('Content-Type')||'').includes('application/json'))throw Error('API indisponible. Redémarrez le serveur local puis actualisez cette page.');
 const data=await response.json();if(!response.ok)throw Error(data.erreur||'Opération impossible.');return data;
}
function icon(kind,label,id){const symbols={edit:'✎',delete:'🗑',toggle:'⏻'};return `<button class="icon ${kind==='delete'?'danger':''}" type="button" data-action="${kind}" data-id="${esc(id)}" title="${label}" aria-label="${label}">${symbols[kind]}</button>`}

async function users(preferred){
 const data=await api('sessions');state.users=data.comptes;
 const current=preferred??$('session-select').value;
 $('session-select').innerHTML='<option value="">Sélectionner une session</option>'+state.users.map(u=>`<option value="${u.id}">${esc(u.identifiant)}${u.actif?'':' (désactivée)'}</option>`).join('');
 $('session-select').value=String(current);
 await details();
}

async function details(){
 const id=uid();
 for(const key of ['edit-session','toggle-session','delete-session'])$(key).disabled=!id;
 $('workspace').hidden=!id;
 if(!id){state.detail=null;state.banners=[];$('session-state').textContent='Sélectionnez une session pour voir ses données.';chargerTableau();return}
 chargerTableau();
 state.detail=await api('sessions/'+id+'/details');
 $('session-state').textContent=state.detail.user.actif?'Session active':'Session désactivée';
 $('toggle-session').title=state.detail.user.actif?'Désactiver la session':'Activer la session';
 $('remise-min').value=state.detail.user.remise_minimum??3;
 render();
 await chargerBannieres().catch(e=>notice(e.message,true));
}

function render(){
 if(!state.detail)return;
 for(const tab of ['products','brandshops','specs','discounts','offers','banners'])$(tab).hidden=tab!==state.tab;
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  const d=state.detail;
 const assigned=Object.fromEntries(d.shops.map(s=>[s.brandshop_id,s]));const visible=d.user.tous_brandshops?d.all_shops:d.all_shops.filter(s=>assigned[s.id]);
 $('shop-rows').innerHTML=visible.length?visible.map(s=>{const a=assigned[s.id]||{},active=d.user.tous_brandshops||a.actif;return `<tr><td>${esc(a.nom_personnalise||s.name)}</td><td>${esc(a.ville_personnalisee||s.city)}</td><td>${esc(a.adresse_personnalisee||s.address)}</td><td>${s.mapsUrl?`<a href="${esc(s.mapsUrl)}" target="_blank" rel="noopener noreferrer">Ouvrir ↗</a>`:'—'}</td><td><span class="badge ${active?'':'off'}">${active?'Actif':'Inactif'}</span></td><td class="actions">${icon('edit','Modifier le brandshop',s.id)}${icon('toggle',active?'Désactiver':'Activer',s.id)}${icon('delete','Retirer le brandshop',s.id)}</td></tr>`}).join(''):'<tr><td colspan="6" class="empty">Aucun brandshop attribué.</td></tr>';
 $('spec-content').innerHTML=Object.keys(d.specs).length?Object.entries(d.specs).map(([ref,values])=>`<article class="spec-card"><div class="heading"><h3>${esc(ref)}</h3>${icon('edit','Modifier la fiche',ref)}</div>${Object.entries(values).map(([k,v])=>`<div><strong>${esc(k)} :</strong> ${esc(v)}</div>`).join('')}</article>`).join(''):'<p class="empty">Aucune fiche technique pour cette session.</p>';
 const autorisees=(d.user.formules_autorisees||'cash,6,12,18,24').split(',');
 document.querySelectorAll('input[name=formule]').forEach(c=>c.checked=autorisees.includes(c.value));
 for(const months of [6,12,18,24])$('discount-'+months).value=d.discount_rows?.rates?.[months+' Months']??d.discount?.[months]??'';
 $('discount-content').innerHTML='';
}

document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render()});
$('session-select').onchange=()=>details().catch(e=>notice(e.message,true));

/* --- Sessions : création, modification, activation, suppression --- */
function accountDialog(edit=false){
 state.editAccount=edit?state.detail.user.id:null;
 $('account-title').textContent=edit?'Modifier la session':'Ajouter une session';
 $('account-name').value=edit?state.detail.user.identifiant:'';
 $('account-password').value='';$('account-password').required=!edit;
 $('password-help').textContent=edit?'Laisser vide pour conserver le mot de passe':'12 caractères minimum';
 $('account-error').textContent='';$('account-dialog').showModal();
}
$('add-session').onclick=()=>accountDialog();$('edit-session').onclick=()=>accountDialog(true);
$('account-form').onsubmit=async e=>{e.preventDefault();try{
 const body={identifiant:$('account-name').value.trim(),mot_de_passe:$('account-password').value};
 const id=state.editAccount;
 const result=await api(id?'sessions/'+id:'sessions',id?'PUT':'POST',body);
 $('account-dialog').close();await users(id||result.id);notice('Session enregistrée.');
}catch(error){$('account-error').textContent=error.message}};
$('toggle-session').onclick=async()=>{try{
 const user=state.detail.user;
 await api('sessions/'+uid()+'/statut','POST',{actif:!user.actif});
 await users(uid());notice('État de la session modifié.');
}catch(e){notice(e.message,true)}};
$('delete-session').onclick=async()=>{
 if(!confirm('Supprimer définitivement cette session, ses produits, ses prix et ses bannières ?'))return;
 try{await api('sessions/'+uid(),'DELETE');await users('');notice('Session supprimée.')}catch(e){notice(e.message,true)}
};


/* --- Brandshops --- */
let editingShop=null;
function shopDialog(id=null){
 editingShop=id;const d=state.detail,shop=d.all_shops.find(s=>s.id===id)||{},row=d.shop_rows?.[String(id)]||{};
 $('shop-title').textContent=id?'Modifier le brandshop':'Ajouter un brandshop';
 const fallback={'ID':id||'','Nom du Showroom':shop.name||'','Ville':shop.city||'','Adresse':shop.address||'','Responsable local':shop.contactName||'','Mobile':shop.phone||'','Email':shop.email||'','Google Maps URL':shop.mapsUrl||''};
 document.querySelectorAll('#shop-form [data-shop]').forEach(input=>{input.value=row[input.dataset.shop]??fallback[input.dataset.shop]??''});
 const idInput=document.querySelector('#shop-form [data-shop="ID"]');idInput.readOnly=!!id;
 $('shop-error').textContent='';$('shop-dialog').showModal();
}
$('add-shop').onclick=()=>shopDialog();
$('shop-form').onsubmit=async e=>{e.preventDefault();try{
 if(!confirmScope('Enregistrer ce brandshop'))return;
 const row={};document.querySelectorAll('#shop-form [data-shop]').forEach(input=>{row[input.dataset.shop]=input.value});
 await api('sessions/'+uid()+'/shops/manual'+(editingShop?'/'+editingShop:''),editingShop?'PUT':'POST',row);
 $('shop-dialog').close();await details();notice('Brandshop enregistré pour '+scopeText()+'.');
}catch(error){$('shop-error').textContent=error.message;notice(error.message,true)}};
$('shop-rows').onclick=async e=>{
 const b=e.target.closest('[data-action]');if(!b)return;
 const id=Number(b.dataset.id),row=state.detail.shops.find(s=>s.brandshop_id===id),active=state.detail.user.tous_brandshops||row?.actif;
 try{
  if(b.dataset.action==='edit')return shopDialog(id);
  if(b.dataset.action==='delete'){
   if(!confirm('Retirer ce brandshop de '+scopeText()+' ?'))return;
   await api('sessions/'+uid()+'/shops/'+id,'DELETE',{});
  }else{
   if(!confirmScope(active?'Désactiver ce brandshop':'Activer ce brandshop'))return;
   await api('sessions/'+uid()+'/shops/'+id+'/statut','POST',{actif:!active});
  }
  await details();notice('Brandshop mis à jour pour '+scopeText()+'.');
 }catch(error){notice(error.message,true)}
};

/* --- Fiches techniques --- */
function addSpecField(label='',value=''){
 const row=document.createElement('div');row.className='spec-field';
 row.innerHTML=`<input class="spec-label" aria-label="Caractéristique" placeholder="Caractéristique" value="${esc(label)}" required><input class="spec-value" aria-label="Valeur" placeholder="Valeur" value="${esc(value)}" required><button type="button" class="icon danger" aria-label="Supprimer cette ligne">×</button>`;
 row.querySelector('button').onclick=()=>row.remove();$('spec-fields').append(row);
}
function fillSpecFields(){
 $('spec-fields').replaceChildren();const fields=state.detail.specs?.[$('spec-product').value]||{};
 for(const [key,value] of Object.entries(fields))addSpecField(key,value);
 if(!Object.keys(fields).length)addSpecField();
}
function specDialog(ref=null){
 const d=state.detail;$('spec-title').textContent=ref?'Modifier la fiche technique':'Ajouter une fiche technique';
 $('spec-product').innerHTML=d.products.map(p=>`<option value="${esc(p.reference)}">${esc(p.reference)} — ${esc(d.all_products.find(x=>x.reference===p.reference)?.name||p.reference)}</option>`).join('');
 $('spec-product').value=ref||d.products[0]?.reference||'';$('spec-product').disabled=!!ref;
 $('spec-error').textContent='';fillSpecFields();$('spec-dialog').showModal();
}
$('add-spec').onclick=()=>specDialog();$('add-spec-field').onclick=()=>addSpecField();$('spec-product').onchange=fillSpecFields;
$('spec-content').onclick=e=>{const button=e.target.closest('[data-action="edit"]');if(button)specDialog(button.dataset.id)};
$('spec-form').onsubmit=async e=>{e.preventDefault();try{
 if(!confirmScope('Enregistrer cette fiche technique'))return;
 const fields={};
 for(const row of document.querySelectorAll('#spec-fields .spec-field')){
  const key=row.querySelector('.spec-label').value.trim(),value=row.querySelector('.spec-value').value.trim();
  if(!key||!value)continue;if(Object.hasOwn(fields,key))throw Error('Caractéristique en double : '+key);fields[key]=value;
 }
 await api('sessions/'+uid()+'/specs/manual/'+encodeURIComponent($('spec-product').value),'PUT',{fields});
 $('spec-dialog').close();await details();notice('Fiche technique enregistrée pour '+scopeText()+'.');
}catch(error){$('spec-error').textContent=error.message;notice(error.message,true)}};

/* --- Remises : minimum d'articles et pourcentages --- */
$('remise-min-form').onsubmit=async e=>{e.preventDefault();try{
 const valeur=Number($('remise-min').value);
 if(!Number.isInteger(valeur)||valeur<1||valeur>99)throw Error('Entrez un nombre entier entre 1 et 99.');
 if(!confirmScope('Enregistrer ce nombre minimum d’articles'))return;
 await api('sessions/'+uid()+'/remise-minimum','PUT',{valeur});
 await details();notice('Minimum d’articles enregistré pour '+scopeText()+'.');
}catch(error){notice(error.message,true)}};
$('discount-form').onsubmit=async e=>{e.preventDefault();try{
 if(!confirmScope('Enregistrer ces remises'))return;
 await api('sessions/'+uid()+'/discounts/manual','PUT',{'6 Months':$('discount-6').value,'12 Months':$('discount-12').value,'18 Months':$('discount-18').value,'24 Months':$('discount-24').value});
 await details();notice('Remises enregistrées pour '+scopeText()+'.');
}catch(error){notice(error.message,true)}};

/* --- Offres de paiement --- */
$('formules-form').onsubmit=async e=>{e.preventDefault();try{
 const formules=[...document.querySelectorAll('input[name=formule]:checked')].map(c=>c.value);
 if(!formules.length)throw Error('Cochez au moins une offre.');
 if(!confirmScope('Enregistrer ces offres'))return;
 await api('sessions/'+uid()+'/formules','PUT',{formules});
 await details();notice('Offres enregistrées pour '+scopeText()+'.');
}catch(error){notice(error.message,true)}};

/* --- Imports Excel / CSV --- */
// Tableau des produits : cellules éditables, modifications surlignées, enregistrement groupé.
let tableauColonnes=[];
let tableauOriginal=new Map();
// Ordre affiché : colonnes du CSV, puis les formules de financement côte à côte, puis Disponibilité.
const COLONNES_TABLEAU=()=>{
 const facilite=c=>/^FACILITE /.test(c),dispo=c=>c==='Disponibilité';
 const facilites=[...new Set([...tableauColonnes.filter(facilite),'FACILITE 24 MOIS'])];
 return [...tableauColonnes.filter(c=>!facilite(c)&&!dispo(c)),...facilites,...tableauColonnes.filter(dispo)];
};
function majRangs(){[...$('grille').tBodies[0].rows].forEach((tr,i)=>{tr.querySelector('.rang').textContent=i+1})}
function majBarreTableau(){
 majSelection();
 const n=document.querySelectorAll('#grille td.modifie').length;
 $('tableau-modifs').hidden=!n;
 $('tableau-modifs').textContent=n+' cellule(s) modifiée(s)';
 $('tableau-enregistrer').hidden=!n;
 $('tableau-annuler').hidden=!n;
}
function ajouterProduit(){
 if(!tableauColonnes.length){notice('Ouvrez une session pour ajouter un produit.',true);return}
 const tbody=$('grille').tBodies[0];
 tbody.insertAdjacentHTML('beforeend',ligneTableau(Object.fromEntries(COLONNES_TABLEAU().map(c=>[c,''])),true));
 const tr=tbody.lastElementChild;
 tr.querySelectorAll('td').forEach(td=>td.classList.add('modifie'));
 majRangs();majBarreTableau();appliquerFiltres();
 tr.querySelector('input[data-col="REFERENCE "]').focus();
}
function ligneTableau(valeurs,nouveau=false){
 const cellules=COLONNES_TABLEAU().map(c=>{
  if(c==='product photos')return `<td class="photo"><div class="photo-cellule"><input data-col="${esc(c)}" value="${esc(valeurs[c]??'')}" placeholder="assets/photo.jpg"><label class="choisir" title="Choisir une photo sur cet ordinateur">Photo<input type="file" accept="image/*" data-photo hidden></label></div></td>`;
  const lecture=!nouveau&&c==='REFERENCE ';
  return `<td><input data-col="${esc(c)}" value="${esc(valeurs[c]??'')}"${lecture?' readonly tabindex="-1" title="Référence : non modifiable"':''}></td>`;
 }).join('');
 const actif=valeurs.actif!==false;
 return `<tr data-ref="${esc(valeurs['REFERENCE '])}"${nouveau?' data-nouveau="1"':''}><th><label class="sel-rang"><input type="checkbox" class="selection" title="Sélectionner ce produit"><span class="rang"></span></label></th>${cellules}<td class="etat"><label class="switch" title="Produit actif sur le site"><input type="checkbox" data-col="actif"${actif?' checked':''}><span></span></label><button type="button" class="supprimer-ligne" title="Supprimer ce produit">Supprimer</button></td></tr>`;
}
function valeurCellule(input){return input.type==='checkbox'?String(input.checked):input.value.trim()}
function rendreTableau(lignes){
 tableauOriginal=new Map();
 tableauTri={col:null,sens:1};
 const cols=[...COLONNES_TABLEAU(),'actif'];
 const entetes=cols.map(c=>`<th data-col="${esc(c)}" title="Cliquez pour trier">${esc(c==='actif'?'status':c.trim())}<span class="tri"></span></th>`).join('');
 const champsFiltres=cols.map(c=>c==='actif'?'<th><select data-filtre="actif"><option value="">Tous</option><option value="true">Actif</option><option value="false">Inactif</option></select></th>':`<th><input data-filtre="${esc(c)}" placeholder="Filtrer" autocomplete="off"></th>`).join('');
 $('grille').innerHTML='<thead><tr><th><input type="checkbox" id="selection-tout" title="Sélectionner les lignes affichées"></th>'+entetes+'</tr><tr class="filtres"><th></th>'+champsFiltres+'</tr></thead><tbody></tbody>';
 $('grille').tBodies[0].innerHTML=lignes.map(l=>{
  COLONNES_TABLEAU().forEach(c=>tableauOriginal.set(l['REFERENCE ']+'|'+c,String(l[c]??'').trim()));
  tableauOriginal.set(l['REFERENCE ']+'|actif',String(l.actif!==false));
  return ligneTableau(l);
 }).join('');
 majRangs();
 majBarreTableau();
 appliquerFiltres();
}
/* Tri (clic sur l'en-tête) et filtres par colonne. */
let tableauTri={col:null,sens:1};
const valeurTri=(tr,col)=>{const champ=champDeLigne(tr,col);return champ?valeurCellule(champ):''};
const nombreTri=v=>parseFloat(v.replace(/\s/g,'').replace(',','.'))||0;
function trierTableau(col){
 tableauTri=tableauTri.col===col?{col,sens:-tableauTri.sens}:{col,sens:1};
 const tbody=$('grille').tBodies[0];
 const lignes=[...tbody.rows];
 const nombres=lignes.every(tr=>{const v=valeurTri(tr,col).replace(/\s/g,'').replace(',','.');return v===''||isFinite(v)});
 lignes.sort((a,b)=>{
  const x=valeurTri(a,col),y=valeurTri(b,col);
  if(x===''||y==='')return (x==='')-(y==='');
  const c=nombres?nombreTri(x)-nombreTri(y):x.localeCompare(y,'fr',{numeric:true,sensitivity:'base'});
  return c*tableauTri.sens;
 });
 lignes.forEach(tr=>tbody.appendChild(tr));
 majRangs();
 $('grille').querySelectorAll('thead th[data-col] .tri').forEach(s=>{s.textContent=s.parentElement.dataset.col===tableauTri.col?(tableauTri.sens>0?' ▲':' ▼'):''});
}
function appliquerFiltres(){
 const q=normalize($('tableau-recherche').value.trim());
 const filtres=[...$('grille').querySelectorAll('[data-filtre]')].map(f=>[f.dataset.filtre,f.value.trim()]).filter(([,v])=>v!=='');
 const lignes=[...$('grille').tBodies[0].rows];
 let visibles=0;
 lignes.forEach(tr=>{
  const texte=normalize([...tr.querySelectorAll('input[data-col]:not([type=checkbox])')].map(i=>i.value).join(' '));
  const ok=(!q||texte.includes(q))&&filtres.every(([col,v])=>col==='actif'?valeurTri(tr,'actif')===v:normalize(valeurTri(tr,col)).includes(normalize(v)));
  tr.classList.toggle('masquee',!ok);
  if(ok)visibles++;
 });
 $('tableau-info').textContent=(visibles!==lignes.length?visibles+' sur ':'')+lignes.length+' produit(s)';
}
async function chargerTableau(){
 const id=uid();
 if(!id){
  $('grille').innerHTML='';
  tableauOriginal=new Map();
  $('tableau-info').textContent='';
  majBarreTableau();
  return;
 }
 try{
  const data=await api('sessions/'+id+'/tableau');
  tableauColonnes=data.colonnes;
  rendreTableau(data.lignes);
  $('tableau-info').textContent=data.lignes.length+' produit(s)';
 }catch(error){notice(error.message,true)}
}
function lignesModifiees(){
 return [...$('grille').tBodies[0].rows].filter(tr=>tr.querySelector('td.modifie')).map(tr=>{
  const l={nouveau:tr.dataset.nouveau==='1'};
  tr.querySelectorAll('input[data-col]').forEach(i=>{l[i.dataset.col]=i.type==='checkbox'?i.checked:i.value.trim()});
  return l;
 });
}
async function enregistrerTableau(){
 const lignes=lignesModifiees();
 if(!lignes.length)return;
 const nouvelles=lignes.filter(l=>l.nouveau);
 if(nouvelles.some(l=>!l['REFERENCE ']))return notice('Indiquez la référence de chaque nouveau produit.',true);
 const refs=[...$('grille').tBodies[0].rows].map(tr=>tr.querySelector('input[data-col="REFERENCE "]').value.trim());
 if(new Set(refs).size!==refs.length)return notice('Deux lignes ont la même référence.',true);
 if(!confirmScope('Enregistrer '+lignes.length+' produit(s) modifié(s)'))return;
 try{
  const result=await api('sessions/'+uid()+'/tableau','PUT',{lignes,scope:scope()});
  notice(result.lignes+' produit(s) enregistré(s) pour '+scopeText()+'.');
  await details();
 }catch(error){notice(error.message,true)}
}
$('tableau-enregistrer').onclick=enregistrerTableau;
$('tableau-annuler').onclick=chargerTableau;
$('tableau-ajouter').onclick=ajouterProduit;
/* Export Excel : lignes affichées (filtre et tri appliqués), valeurs actuelles y compris non enregistrées. */
function exporterTableau(){
 const cols=[...COLONNES_TABLEAU(),'actif'];
 const lignes=[...$('grille').tBodies[0].rows].filter(tr=>!tr.classList.contains('masquee'));
 if(!lignes.length)return notice('Aucun produit à exporter.',true);
 const echappe=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const entete=cols.map(c=>`<th>${echappe(c==='actif'?'status':c.trim())}</th>`).join('');
 const corps=lignes.map(tr=>`<tr>${cols.map(c=>{const champ=champDeLigne(tr,c);return `<td>${echappe(champ?valeurCellule(champ):'')}</td>`}).join('')}</tr>`).join('');
 const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><tr>${entete}</tr>${corps}</table></body></html>`;
 const maintenant=new Date(),p=n=>String(n).padStart(2,'0');
 const nom=`produits-${maintenant.getFullYear()}-${p(maintenant.getMonth()+1)}-${p(maintenant.getDate())}.xls`;
 const url=URL.createObjectURL(new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'}));
 const lien=document.createElement('a');
 lien.href=url;lien.download=nom;document.body.appendChild(lien);lien.click();lien.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('tableau-exporter').onclick=exporterTableau;

/* Suppression de produits : une ligne (bouton) ou la sélection (cases). Les produits sont retirés de la session choisie (ou de toutes si la portée le demande). */
function selectionnees(){return [...$('grille').tBodies[0].rows].filter(tr=>tr.querySelector('.selection')?.checked)}
function majSelection(){
 const n=selectionnees().length;
 $('tableau-supprimer').hidden=!n;
 $('tableau-supprimer').textContent='Supprimer la sélection ('+n+')';
}
async function supprimerProduits(trs){
 if(!trs.length)return;
 if(document.querySelectorAll('#grille td.modifie').length)return notice('Enregistrez ou annulez vos modifications avant de supprimer des produits.',true);
 if(!confirm('Supprimer '+trs.length+' produit(s) de '+scopeText()+' ? Cette action est définitive.'))return;
 const refs=trs.filter(tr=>tr.dataset.nouveau!=='1').map(tr=>tr.querySelector('input[data-col="REFERENCE "]').value.trim());
 trs.filter(tr=>tr.dataset.nouveau==='1').forEach(tr=>tr.remove());
 let supprimes=0;
 try{
  for(const ref of refs){
   await api('sessions/'+uid()+'/products/'+encodeURIComponent(ref),'DELETE');
   supprimes++;
  }
  notice(trs.length+' produit(s) supprimé(s) pour '+scopeText()+'.');
 }catch(error){notice(error.message+' ('+supprimes+' supprimé(s) avant l’erreur.)',true)}
 await chargerTableau();
}
$('tableau-supprimer').onclick=()=>supprimerProduits(selectionnees());
$('grille').addEventListener('click',e=>{const b=e.target.closest('.supprimer-ligne');if(b)supprimerProduits([b.closest('tr')])});
$('grille').addEventListener('change',e=>{
 if(e.target.id==='selection-tout'){
  [...$('grille').tBodies[0].rows].filter(tr=>!tr.classList.contains('masquee')).forEach(tr=>{const c=tr.querySelector('.selection');if(c)c.checked=e.target.checked});
  majSelection();
 }else if(e.target.matches('.selection'))majSelection();
});
$('tableau-recherche').addEventListener('input',appliquerFiltres);
$('grille').addEventListener('click',e=>{const th=e.target.closest('thead th[data-col]');if(th)trierTableau(th.dataset.col)});
for(const type of ['input','change'])$('grille').addEventListener(type,e=>{if(e.target.matches('[data-filtre]'))appliquerFiltres()});
$('grille').addEventListener('input',e=>{
 if(!e.target.matches('input[data-col]'))return;
 const tr=e.target.closest('tr');
 if(tr.dataset.nouveau==='1'){
  if(e.target.dataset.col==='REFERENCE ')tr.dataset.ref=e.target.value.trim();
  tr.querySelectorAll('td').forEach(td=>td.classList.add('modifie'));
 }else{
  const cle=tr.dataset.ref+'|'+e.target.dataset.col;
  e.target.closest('td').classList.toggle('modifie',valeurCellule(e.target)!==(tableauOriginal.get(cle)??''));
 }
 majBarreTableau();
});
$('grille').addEventListener('change',async e=>{
 if(!e.target.matches('input[data-photo]'))return;
 const fichier=e.target.files[0];
 e.target.value='';
 if(!fichier)return;
 const cellule=e.target.closest('td').querySelector('input[data-col]');
 try{
  const form=new FormData();form.append('photo',fichier);
  const resultat=await api('photo','POST',form);
  cellule.value=resultat.chemin;
  cellule.dispatchEvent(new Event('input',{bubbles:true}));
  notice('Photo importée : '+resultat.chemin);
 }catch(error){notice(error.message,true)}
});
$('grille').addEventListener('keydown',e=>{
 if(e.key!=='Enter'||!e.target.matches('input[data-col]'))return;
 e.preventDefault();
 const td=e.target.closest('td'),tr=td.parentElement,index=[...tr.cells].indexOf(td);
 const suivante=tr.nextElementSibling;
 if(suivante)suivante.cells[index].querySelector('input')?.focus();
});
/* Collage depuis Excel : la sélection copiée est répartie à partir de la cellule active, ligne par ligne. */
function lireTsv(texte){
 const lignes=[];let ligne=[],champ='',entreGuillemets=false;
 for(let i=0;i<texte.length;i++){
  const c=texte[i];
  if(entreGuillemets){
   if(c==='"'){if(texte[i+1]==='"'){champ+='"';i++}else entreGuillemets=false}
   else champ+=c;
  }else if(c==='"'&&champ===''){entreGuillemets=true}
  else if(c==='\t'){ligne.push(champ);champ=''}
  else if(c==='\n'){ligne.push(champ);lignes.push(ligne);ligne=[];champ=''}
  else if(c!=='\r')champ+=c;
 }
 if(champ!==''||ligne.length){ligne.push(champ);lignes.push(ligne)}
 return lignes.filter(l=>l.some(v=>v.trim()!==''));
}
const champDeLigne=(tr,col)=>[...tr.querySelectorAll('input[data-col]')].find(i=>i.dataset.col===col);
$('grille').addEventListener('paste',e=>{
 if(!e.target.matches('input[data-col]')||!tableauColonnes.length)return;
 e.preventDefault();
 const lignes=lireTsv((e.clipboardData||window.clipboardData).getData('text'));
 if(!lignes.length)return;
 const colonnes=[...COLONNES_TABLEAU(),'actif'];
 const tbody=$('grille').tBodies[0];
 const debut=colonnes.indexOf(e.target.dataset.col);
 const depart=[...tbody.rows].indexOf(e.target.closest('tr'));
 const nouvelles=[];
 lignes.forEach((valeurs,i)=>{
  let ligneCible=tbody.rows[depart+i];
  if(!ligneCible){
   tbody.insertAdjacentHTML('beforeend',ligneTableau(Object.fromEntries(COLONNES_TABLEAU().map(c=>[c,''])),true));
   ligneCible=tbody.lastElementChild;
   nouvelles.push(ligneCible);
  }
  valeurs.forEach((valeur,j)=>{
   const col=colonnes[debut+j];
   const champ=col&&champDeLigne(ligneCible,col);
   if(!champ||champ.readOnly)return;
   if(champ.type==='checkbox'){
    const v=valeur.trim().toLowerCase();
    if(['vrai','true','1','oui','yes'].includes(v))champ.checked=true;
    else if(['faux','false','0','non','no'].includes(v))champ.checked=false;
    else return;
   }else champ.value=valeur.trim();
   champ.dispatchEvent(new Event('input',{bubbles:true}));
  });
 });
 nouvelles.forEach(tr=>tr.querySelectorAll('td').forEach(td=>td.classList.add('modifie')));
 majRangs();
 majBarreTableau();
 appliquerFiltres();
 notice(lignes.length+' ligne(s) collée(s)'+(nouvelles.length?', dont '+nouvelles.length+' nouvelle(s)':'')+'. Vérifiez puis enregistrez.');
});
$('excel-form').onsubmit=async e=>{e.preventDefault();if(!confirmScope('Importer ce fichier produits'))return;const form=new FormData();form.append('fichier',$('excel-file').files[0]);try{const result=await api('sessions/'+uid()+'/import/products','POST',form);await details();$('excel-file').value='';notice(result.imported+' produits importés ou mis à jour pour '+scopeText()+'.')}catch(error){notice(error.message,true)}};
for(const kind of ['brandshops','specs','discounts']){
 const formElement=$('import-'+kind);
 formElement.onsubmit=async e=>{
  e.preventDefault();if(!uid())return;
  const file=formElement.querySelector('input[type=file]').files[0];
  if(!file||!confirmScope('Importer ce fichier'))return;
  const body=new FormData();body.append('fichier',file);
  try{const result=await api('sessions/'+uid()+'/import/'+kind,'POST',body);formElement.reset();await details();notice(result.imported+' ligne(s) importée(s) pour '+scopeText()+'.')}catch(error){notice(error.message,true)}
 };
}

/* --- Bannières : propres à chaque session (max 10, ordre 1 à 10 sans doublon dans la session) --- */
const BANNIERES='t/bannieres_accueil',BANNIERES_MAX=10;
const numerosPris=exceptId=>new Set(state.banners.filter(b=>b.statut!=='supprimé'&&String(b.id)!==String(exceptId)).map(b=>Number(b.ordre)));
function optionsOrdre(exceptId,actuel){
 const pris=numerosPris(exceptId);let html='';
 for(let n=1;n<=BANNIERES_MAX;n++){if(pris.has(n)&&n!==Number(actuel))continue;html+=`<option value="${n}"${n===Number(actuel)?' selected':''}>${n}</option>`}
 return html;
}
function renderBanners(){
 const actives=state.banners.filter(b=>b.statut!=='supprimé');
 $('banner-count').textContent=actives.length+' / '+BANNIERES_MAX+' photos pour cette session';
 $('add-banner').disabled=actives.length>=BANNIERES_MAX;
 const lignes=[...state.banners].sort((a,b)=>(a.statut==='supprimé')-(b.statut==='supprimé')||Number(a.ordre)-Number(b.ordre));
 $('banner-rows').innerHTML=lignes.length?lignes.map(b=>{
  const supprime=b.statut==='supprimé';
  const src='/'+String(b.image??'').split('/').map(encodeURIComponent).join('/');
  const badge=`<span class="badge ${b.statut==='actif'?'':'off'}">${esc(b.statut)}</span>`;
  const bascule=supprime?icon('toggle','Restaurer la bannière (actif)',b.id):icon('toggle',b.statut==='actif'?'Désactiver la bannière':'Activer la bannière',b.id);
  return `<tr><td><img class="thumb" src="${esc(src)}" alt="${esc(b.titre||'')}"></td><td>${esc(b.titre||'')}</td><td>${supprime?'—':esc(b.ordre)}</td><td>${badge}</td><td class="actions">${icon('edit','Modifier la bannière',b.id)}${bascule}${supprime?'':icon('delete','Supprimer la bannière',b.id)}</td></tr>`;
 }).join(''):'<tr><td colspan="5" class="empty">Aucune bannière pour cette session. Le site affiche les bannières communes.</td></tr>';
}
async function chargerBannieres(){
 const id=uid();
 if(!id){state.banners=[];return}
 const data=await api(BANNIERES);
 state.banners=data.lignes.filter(b=>Number(b.utilisateur_id)===id);
 renderBanners();
}
let banniereEdition=null;
function ouvrirBanniere(id){
 const b=id==null?null:state.banners.find(x=>String(x.id)===String(id));
 banniereEdition=b;
 $('banner-form').reset();$('banner-error').textContent='';
 $('banner-dialog-title').textContent=b?'Modifier la bannière':'Ajouter une bannière';
 $('banner-file').required=!b;
 $('banner-title').value=b?(b.titre??''):'';
 $('banner-order').innerHTML=optionsOrdre(b?b.id:null,b?b.ordre:null);
 $('banner-status').closest('label').hidden=!!b;
 $('banner-dialog').showModal();
}
$('banner-rows').onclick=async e=>{
 const btn=e.target.closest('[data-action]');if(!btn)return;
 const b=state.banners.find(x=>String(x.id)===String(btn.dataset.id));
 if(!b)return;
 try{
  if(btn.dataset.action==='edit')return ouvrirBanniere(b.id);
  if(btn.dataset.action==='toggle'){const statut=b.statut==='actif'?'inactif':'actif';await api(BANNIERES+'/statut','POST',{cle:b.id,statut});notice(statut==='actif'?'Bannière activée.':'Bannière désactivée.')}
  if(btn.dataset.action==='delete'){if(!confirm('Supprimer cette bannière de la page d\'accueil de cette session ?'))return;await api(BANNIERES+'/statut','POST',{cle:b.id,statut:'supprimé'});notice('Bannière supprimée.')}
 }catch(error){notice(error.message,true);return}
 await chargerBannieres().catch(error=>notice(error.message,true));
};
$('add-banner').onclick=()=>ouvrirBanniere(null);
$('banner-form').onsubmit=async e=>{
 e.preventDefault();
 const edition=banniereEdition,fichier=$('banner-file').files[0];
 if(!edition&&!fichier){$('banner-error').textContent='Choisissez une photo.';return}
 try{
  let image=edition?edition.image:null;
  if(fichier){const donnees=new FormData();donnees.append('photo',fichier);({chemin:image}=await api('photo','POST',donnees))}
  const valeurs={image,titre:$('banner-title').value.trim(),ordre:Number($('banner-order').value),statut:edition?edition.statut:$('banner-status').value,utilisateur_id:uid()};
  if(edition)await api(BANNIERES,'PUT',{cle:edition.id,valeurs});
  else await api(BANNIERES,'POST',{valeurs});
  $('banner-dialog').close();
  await chargerBannieres();
  notice(edition?'Bannière modifiée.':'Bannière ajoutée.');
 }catch(error){$('banner-error').textContent=error.message}
};

document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
users().catch(e=>notice(e.message,true));
})();

/* Saisie des prix : « 174000 » devient « 174 000,00 » en quittant le champ. */
function formaterPrixSaisie(v) {
  const brut = String(v ?? '');
  const t = brut.trim().replace(/\s+/g, '').replace(/(DA|DZD)\.?$/i, '');
  if (!t) return brut;
  const m = t.match(/^(\d{1,12})(?:[,.](\d{1,2}))?$/);
  if (!m || (m[2] !== undefined && m[2] !== '00')) return brut;
  const entier = m[1].replace(/^0+(?=\d)/, '');
  return entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',00';
}
document.addEventListener('blur', (e) => {
  const champ = e.target;
  if (champ && champ.matches && champ.matches('[data-prix]')) champ.value = formaterPrixSaisie(champ.value);
}, true);
