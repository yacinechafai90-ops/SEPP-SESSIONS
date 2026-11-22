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
 if(!id){state.detail=null;state.banners=[];$('session-state').textContent='Sélectionnez une session pour voir ses données.';return}
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
 const d=state.detail,names=Object.fromEntries(d.all_products.map(p=>[p.reference,p]));
 const category=$('product-category').value,categories=[...new Set(d.products.map(p=>names[p.reference]?.category||'Autres'))].sort((a,b)=>a.localeCompare(b,'fr'));
 $('product-category').innerHTML='<option value="">Toutes les catégories</option>'+categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
 $('product-category').value=categories.includes(category)?category:'';
 const query=normalize($('product-search').value.trim()),selectedCategory=$('product-category').value;
 const shown=d.products.filter(p=>{const item=names[p.reference]||{};return (!selectedCategory||(item.category||'Autres')===selectedCategory)&&(!query||normalize([p.reference,item.name,item.type,item.category].join(' ')).includes(query))});
 $('product-count').textContent=shown.length+' / '+d.products.length+' produits';
 $('product-rows').innerHTML=shown.length?shown.map(p=>`<tr><td>${esc(p.reference)}</td><td>${esc(names[p.reference]?.name||'Produit retiré du catalogue')}</td><td>${p.prix_offre==null?'Prix général':esc(p.prix_offre)+' DA'}</td><td><span class="badge ${p.actif?'':'off'}">${p.actif?'Actif':'Inactif'}</span></td><td class="actions">${icon('edit','Modifier le produit',p.reference)}${icon('toggle',p.actif?'Désactiver':'Activer',p.reference)}${icon('delete','Retirer le produit',p.reference)}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">Aucun produit correspondant.</td></tr>';
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
$('product-search').oninput=render;$('product-category').onchange=render;

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

/* --- Produits et prix --- */
let editingProduct=null;
function productDialog(ref=null){
 editingProduct=ref;
 $('product-title').textContent=ref?'Modifier le produit':'Ajouter un produit';
 const row=ref?state.detail.item_rows?.[ref]||{}:{};
 document.querySelectorAll('#product-form [data-item]').forEach(input=>{input.value=row[input.dataset.item]??''});
 const refInput=document.querySelector('#product-form [data-item="REFERENCE "]');
 refInput.value=ref||'';refInput.readOnly=!!ref;
 $('product-photo-file').value='';
 $('product-error').textContent='';
 $('product-dialog').showModal();
}
$('add-product').onclick=()=>productDialog();
$('product-form').onsubmit=async e=>{
 e.preventDefault();
 try{
  const row={};document.querySelectorAll('#product-form [data-item]').forEach(input=>{row[input.dataset.item]=input.value});
  const file=$('product-photo-file').files[0];
  if(file){const form=new FormData();form.append('photo',file);const result=await api('photo','POST',form);row['product photos']=result.chemin}
  if(!confirmScope('Enregistrer ce produit'))return;
  row.scope=scope();
  await api('sessions/'+uid()+'/products/manual'+(editingProduct?'/'+encodeURIComponent(editingProduct):''),editingProduct?'PUT':'POST',row);
  $('product-dialog').close();await details();notice('Produit enregistré pour '+scopeText()+'.');
 }catch(error){$('product-error').textContent=error.message;notice(error.message,true)}
};
$('product-rows').onclick=async e=>{
 const b=e.target.closest('[data-action]');if(!b)return;
 const ref=b.dataset.id,product=state.detail.products.find(p=>p.reference===ref);
 try{
  if(b.dataset.action==='edit')return productDialog(ref);
  if(b.dataset.action==='delete'){
   if(!confirm('Retirer ce produit de '+scopeText()+' ?'))return;
   await api('sessions/'+uid()+'/products/'+encodeURIComponent(ref),'DELETE',{});
  }else{
   if(!confirmScope(product.actif?'Désactiver ce produit':'Activer ce produit'))return;
   await api('sessions/'+uid()+'/products/'+encodeURIComponent(ref)+'/statut','POST',{actif:!product.actif});
  }
  await details();notice('Produit mis à jour pour '+scopeText()+'.');
 }catch(error){notice(error.message,true)}
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
$('paste-form').onsubmit=async e=>{e.preventDefault();if(!confirmScope('Importer ces lignes'))return;try{const result=await api('sessions/'+uid()+'/import-texte/products','POST',{texte:$('paste-text').value,scope:scope()});await details();$('paste-text').value='';notice(result.imported+' produits importés ou mis à jour pour '+scopeText()+'.')}catch(error){notice(error.message,true)}};
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
