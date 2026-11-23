"""Gestion des comptes, magasins et import des offres Excel."""
import io
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import urlparse
from flask import jsonify, request
from werkzeug.security import generate_password_hash
import session_templates
from prix_saisie import formater_prix

BUNDLED_SITE_PACKAGES = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/Lib/site-packages'
if BUNDLED_SITE_PACKAGES.is_dir() and str(BUNDLED_SITE_PACKAGES) not in sys.path:
    sys.path.append(str(BUNDLED_SITE_PACKAGES))


def prix_valide(valeur):
    if valeur is None or str(valeur).strip() == '':
        return None
    try:
        prix = Decimal(str(valeur).replace('\u00a0', '').replace(' ', '').replace(',', '.'))
    except InvalidOperation as exc:
        raise ValueError('Prix non numérique.') from exc
    if not prix.is_finite() or prix < 0 or prix > Decimal('9999999999.99'):
        raise ValueError('Prix hors limites.')
    return prix


def lire_excel(fichier):
    try:
        from openpyxl import load_workbook
    except ImportError as exc:
        raise ValueError('Lecteur Excel indisponible : installez openpyxl.') from exc
    workbook = load_workbook(io.BytesIO(fichier), read_only=True, data_only=False)
    try:
        sheet = workbook.active
        rows = sheet.iter_rows(values_only=False)
        headers = next(rows, None)
        if not headers:
            raise ValueError('Le fichier Excel est vide.')
        names = [str(c.value or '').strip().lower() for c in headers]
        if names.count('reference') != 1 or names.count('prix_offre') != 1:
            raise ValueError('La première ligne doit contenir reference et prix_offre.')
        reference_index, prix_index = names.index('reference'), names.index('prix_offre')
        result = {}
        for number, cells in enumerate(rows, start=2):
            if number > 1001:
                raise ValueError('Maximum 1 000 lignes par fichier.')
            reference_cell = cells[reference_index] if reference_index < len(cells) else None
            price_cell = cells[prix_index] if prix_index < len(cells) else None
            reference = str(reference_cell.value or '').strip() if reference_cell else ''
            if not reference and (not price_cell or price_cell.value is None):
                continue
            if not reference or reference in result:
                raise ValueError(f'Ligne {number} : référence vide ou en double.')
            if (reference_cell and reference_cell.data_type == 'f') or (price_cell and price_cell.data_type == 'f'):
                raise ValueError(f'Ligne {number} : les formules Excel ne sont pas acceptées.')
            try:
                result[reference] = prix_valide(price_cell.value if price_cell else None)
            except ValueError as exc:
                raise ValueError(f'Ligne {number} : {exc}') from exc
        if not result:
            raise ValueError('Aucune offre à importer.')
        return result
    finally:
        workbook.close()


def installer(app, srv):
    def connexion():
        return srv['ouvrir_connexion'](srv['NOM_BASE'])

    def scope_ids(cn, uid, scope):
        if scope not in ('selected', 'all'):
            return None
        ids = [row['id'] for row in cn.execute('SELECT id FROM public.utilisateurs_catalogue ORDER BY id').fetchall()]
        if uid not in ids:
            return []
        return ids if scope == 'all' else [uid]

    @app.get('/admin/api/sessions')
    def lister_sessions():
        with connexion() as cn:
            comptes = cn.execute('SELECT id, identifiant, actif, tous_brandshops FROM public.utilisateurs_catalogue ORDER BY identifiant').fetchall()
            affectations = cn.execute('SELECT utilisateur_id, brandshop_id, actif, nom_personnalise, ville_personnalisee, adresse_personnalisee, mobile_personnalise FROM public.brandshops_utilisateur').fetchall()
        boutiques = [{'id': b['id'], 'name': b['name'], 'city': b['city']}
                    for b in srv['charger_catalogue']()['shops']]
        return jsonify(comptes=comptes, boutiques=boutiques, affectations=affectations)

    @app.post('/admin/api/sessions')
    def creer_session():
        data = request.get_json(silent=True) or {}
        identifiant = str(data.get('identifiant') or '').strip()
        password = str(data.get('mot_de_passe') or '')
        if len(identifiant) < 3 or len(identifiant) > 80 or len(password) < 12:
            return jsonify(erreur='Identifiant : 3 à 80 caractères ; mot de passe : 12 caractères minimum.'), 400
        with connexion() as cn:
            if cn.execute('SELECT id FROM public.utilisateurs_catalogue WHERE identifiant = %s', (identifiant,)).fetchone():
                return jsonify(erreur='Cet identifiant existe déjà.'), 409
            row = cn.execute('INSERT INTO public.utilisateurs_catalogue (identifiant, mot_de_passe_hash) VALUES (%s,%s) RETURNING id',
                             (identifiant, generate_password_hash(password))).fetchone()
            catalogue = srv['charger_catalogue']()
            session_templates.initialize(cn, row['id'], {p['reference'] for p in catalogue['products']}, {b['id'] for b in catalogue['shops']})
        return jsonify(ok=True, id=row['id']), 201

    @app.put('/admin/api/sessions/<int:user_id>')
    def modifier_session(user_id):
        data = request.get_json(silent=True) or {}
        identifiant = str(data.get('identifiant') or '').strip()
        password = str(data.get('mot_de_passe') or '')
        if len(identifiant) < 3 or len(identifiant) > 80 or (password and len(password) < 12):
            return jsonify(erreur='Identifiant invalide ou mot de passe trop court.'), 400
        with connexion() as cn:
            if cn.execute('SELECT id FROM public.utilisateurs_catalogue WHERE identifiant = %s AND id <> %s',
                          (identifiant, user_id)).fetchone():
                return jsonify(erreur='Cet identifiant existe déjà.'), 409
            if password:
                row = cn.execute('UPDATE public.utilisateurs_catalogue SET identifiant=%s, mot_de_passe_hash=%s WHERE id=%s RETURNING id',
                                 (identifiant, generate_password_hash(password), user_id)).fetchone()
            else:
                row = cn.execute('UPDATE public.utilisateurs_catalogue SET identifiant=%s WHERE id=%s RETURNING id',
                                 (identifiant, user_id)).fetchone()
        return (jsonify(ok=True) if row else (jsonify(erreur='Compte introuvable.'), 404))

    @app.post('/admin/api/sessions/<int:user_id>/statut')
    def statut_session(user_id):
        data = request.get_json(silent=True) or {}
        if type(data.get('actif')) is not bool:
            return jsonify(erreur='Statut invalide.'), 400
        with connexion() as cn:
            row = cn.execute('UPDATE public.utilisateurs_catalogue SET actif=%s WHERE id=%s RETURNING id',
                             (data['actif'], user_id)).fetchone()
        return (jsonify(ok=True) if row else (jsonify(erreur='Compte introuvable.'), 404))

    @app.delete('/admin/api/sessions/<int:user_id>')
    def supprimer_session(user_id):
        with connexion() as cn:
            row = cn.execute('DELETE FROM public.utilisateurs_catalogue WHERE id=%s RETURNING id', (user_id,)).fetchone()
        return (jsonify(ok=True) if row else (jsonify(erreur='Compte introuvable.'), 404))

    @app.put('/admin/api/sessions/<int:user_id>/brandshops')
    def enregistrer_brandshops(user_id):
        data = request.get_json(silent=True) or {}
        ids = data.get('ids')
        if not isinstance(ids, list) or len(ids) > 1000 or any(type(i) is not int for i in ids):
            return jsonify(erreur='Liste de magasins invalide.'), 400
        valid = {b['id'] for b in srv['charger_catalogue']()['shops']}
        if any(i not in valid for i in ids):
            return jsonify(erreur='Magasin inconnu.'), 400
        with connexion() as cn:
            row = cn.execute('UPDATE public.utilisateurs_catalogue SET tous_brandshops=false WHERE id=%s RETURNING id', (user_id,)).fetchone()
            if not row:
                return jsonify(erreur='Compte introuvable.'), 404
            cn.execute('DELETE FROM public.brandshops_utilisateur WHERE utilisateur_id=%s', (user_id,))
            for brandshop_id in set(ids):
                cn.execute('INSERT INTO public.brandshops_utilisateur (utilisateur_id,brandshop_id) VALUES (%s,%s)',
                           (user_id, brandshop_id))
        return jsonify(ok=True)

    @app.post('/admin/api/sessions/<int:user_id>/import-excel')
    def importer_excel(user_id):
        return import_template(user_id, 'products')

    def ensure_shops(cn, uid):
        row = cn.execute('SELECT tous_brandshops FROM public.utilisateurs_catalogue WHERE id=%s', (uid,)).fetchone()
        if not row: return False
        if row['tous_brandshops']:
            for b in srv['charger_catalogue']()['shops']:
                cn.execute('INSERT INTO public.brandshops_utilisateur (utilisateur_id,brandshop_id) VALUES (%s,%s) ON CONFLICT DO NOTHING',(uid,b['id']))
            cn.execute('UPDATE public.utilisateurs_catalogue SET tous_brandshops=false WHERE id=%s',(uid,))
        return True

    @app.get('/admin/api/sessions/<int:uid>/details')
    def session_details(uid):
        cat=srv['charger_catalogue']()
        with connexion() as cn:
            user=cn.execute('SELECT id,identifiant,actif,tous_brandshops,formules_autorisees,remise_minimum FROM public.utilisateurs_catalogue WHERE id=%s',(uid,)).fetchone()
            if not user: return jsonify(erreur='Session introuvable.'),404
            products=cn.execute('SELECT reference,prix_offre,actif FROM public.offres_utilisateur WHERE utilisateur_id=%s ORDER BY reference',(uid,)).fetchall()
            shops=cn.execute('SELECT brandshop_id,actif,nom_personnalise,ville_personnalisee,adresse_personnalisee,mobile_personnalise FROM public.brandshops_utilisateur WHERE utilisateur_id=%s',(uid,)).fetchall()
            data=session_templates.snapshot(cn,uid)
        cat=session_templates.apply(cat,data)
        refs={p['reference'] for p in products}
        return jsonify(item_rows=data['products'],shop_rows=data['brandshops'],spec_rows=data['specs'],discount_rows=data['discounts'],user=user,products=[dict(reference=p['reference'],prix_offre=float(p['prix_offre']) if p['prix_offre'] is not None else None,actif=p['actif']) for p in products],shops=shops,
          all_products=[dict(reference=p['reference'],name=p['name'],type=p['type'],category=p['category'],offerPrice=p['offerPrice']) for p in cat['products']],all_shops=cat['shops'],
          specs={r:v for r,v in cat['specs'].items() if r in refs},discount=cat['discount'])

    @app.post('/admin/api/sessions/<int:uid>/products/<reference>/statut')
    def product_status(uid,reference):
        data=request.get_json(silent=True) or {}
        value=data.get('actif')
        if type(value) is not bool: return jsonify(erreur='Statut invalide.'),400
        with connexion() as cn:
            ids=scope_ids(cn,uid,data.get('scope','selected'))
            if ids is None: return jsonify(erreur='Portée invalide.'),400
            if not ids: return jsonify(erreur='Session introuvable.'),404
            changed=0
            for target in ids:
                row=cn.execute('UPDATE public.offres_utilisateur SET actif=%s WHERE utilisateur_id=%s AND reference=%s RETURNING reference',(value,target,reference)).fetchone()
                changed+=bool(row)
        return jsonify(ok=True,updated=changed) if changed else (jsonify(erreur='Produit introuvable.'),404)

    @app.delete('/admin/api/sessions/<int:uid>/products/<reference>')
    def product_delete(uid,reference):
        data=request.get_json(silent=True) or {}
        with connexion() as cn:
            ids=scope_ids(cn,uid,data.get('scope','selected'))
            if ids is None: return jsonify(erreur='Portée invalide.'),400
            if not ids: return jsonify(erreur='Session introuvable.'),404
            for target in ids:
                cn.execute('DELETE FROM public.offres_utilisateur WHERE utilisateur_id=%s AND reference=%s',(target,reference))
        return jsonify(ok=True,updated=len(ids))

    @app.put('/admin/api/sessions/<int:uid>/shops/<int:shop_id>')
    def shop_save(uid,shop_id):
        if shop_id not in {b['id'] for b in srv['charger_catalogue']()['shops']}: return jsonify(erreur='Brandshop inconnu.'),404
        data=request.get_json(silent=True) or {}
        fields=('nom_personnalise','ville_personnalisee','adresse_personnalisee','mobile_personnalise')
        values=[]
        for field in fields:
            v=data.get(field)
            if v is not None and (not isinstance(v,str) or len(v)>500): return jsonify(erreur='Donnée invalide.'),400
            values.append(v.strip() or None if v is not None else None)
        with connexion() as cn:
            ids=scope_ids(cn,uid,data.get('scope','selected'))
            if ids is None: return jsonify(erreur='Portée invalide.'),400
            if not ids: return jsonify(erreur='Session introuvable.'),404
            for target in ids:
                if not ensure_shops(cn,target): return jsonify(erreur='Session introuvable.'),404
                cn.execute('''INSERT INTO public.brandshops_utilisateur (utilisateur_id,brandshop_id,actif,nom_personnalise,ville_personnalisee,adresse_personnalisee,mobile_personnalise)
              VALUES (%s,%s,true,%s,%s,%s,%s) ON CONFLICT (utilisateur_id,brandshop_id) DO UPDATE SET
              actif=true,nom_personnalise=EXCLUDED.nom_personnalise,ville_personnalisee=EXCLUDED.ville_personnalisee,
              adresse_personnalisee=EXCLUDED.adresse_personnalisee,mobile_personnalise=EXCLUDED.mobile_personnalise''',(target,shop_id,*values))
        return jsonify(ok=True,updated=len(ids))

    @app.post('/admin/api/sessions/<int:uid>/shops/<int:shop_id>/statut')
    def shop_status(uid,shop_id):
        data=request.get_json(silent=True) or {}
        value=data.get('actif')
        if type(value) is not bool: return jsonify(erreur='Statut invalide.'),400
        with connexion() as cn:
            ids=scope_ids(cn,uid,data.get('scope','selected'))
            if ids is None: return jsonify(erreur='Portée invalide.'),400
            if not ids: return jsonify(erreur='Session introuvable.'),404
            changed=0
            for target in ids:
                if not ensure_shops(cn,target): return jsonify(erreur='Session introuvable.'),404
                row=cn.execute('UPDATE public.brandshops_utilisateur SET actif=%s WHERE utilisateur_id=%s AND brandshop_id=%s RETURNING brandshop_id',(value,target,shop_id)).fetchone()
                changed+=bool(row)
        return jsonify(ok=True,updated=changed) if changed else (jsonify(erreur='Brandshop introuvable.'),404)

    @app.delete('/admin/api/sessions/<int:uid>/shops/<int:shop_id>')
    def shop_delete(uid,shop_id):
        data=request.get_json(silent=True) or {}
        with connexion() as cn:
            ids=scope_ids(cn,uid,data.get('scope','selected'))
            if ids is None: return jsonify(erreur='Portée invalide.'),400
            if not ids: return jsonify(erreur='Session introuvable.'),404
            for target in ids:
                if not ensure_shops(cn,target): return jsonify(erreur='Session introuvable.'),404
                cn.execute('DELETE FROM public.brandshops_utilisateur WHERE utilisateur_id=%s AND brandshop_id=%s',(target,shop_id))
        return jsonify(ok=True,updated=len(ids))

    @app.route('/admin/api/sessions/<int:uid>/shops/manual', methods=['POST'])
    @app.route('/admin/api/sessions/<int:uid>/shops/manual/<int:shop_id>', methods=['PUT'])
    def manual_shop(uid,shop_id=None):
        data=request.get_json(silent=True) or {}
        if not isinstance(data,dict): return jsonify(erreur='Données brandshop invalides.'),400
        scope=data.get('scope','selected')
        expected,_=session_templates.source('brandshops')
        if scope not in ('selected','all') or set(data)-{'scope','Google Maps URL'}!=set(expected):
            return jsonify(erreur='Champs du brandshop ou portée invalides.'),400
        row={key:data[key] for key in expected}
        row['Google Maps URL']=str(data.get('Google Maps URL') or '').strip()
        try: session_templates.validate('brandshops',[row])
        except Exception as exc: return jsonify(erreur=str(exc)),400
        ident=int(session_templates.record_key('brandshops',row))
        if shop_id is not None and shop_id!=ident: return jsonify(erreur='ID du brandshop non modifiable.'),400
        if not str(row['Nom du Showroom']).strip() or not str(row['Ville']).strip() or not str(row['Mobile']).strip():
            return jsonify(erreur='Nom, ville et mobile requis.'),400
        if row['Google Maps URL']:
            link=urlparse(row['Google Maps URL'])
            if link.scheme!='https' or link.hostname not in ('www.google.com','google.com','maps.google.com','maps.app.goo.gl','goo.gl'):
                return jsonify(erreur='Lien Google Maps HTTPS invalide.'),400
        with connexion() as cn:
            ids=scope_ids(cn,uid,scope)
            if not ids: return jsonify(erreur='Session introuvable.'),404
            if shop_id is None:
                assigned=cn.execute('SELECT brandshop_id FROM public.brandshops_utilisateur WHERE utilisateur_id=%s AND brandshop_id=%s',(uid,ident)).fetchone()
                if assigned: return jsonify(erreur='Ce brandshop existe déjà dans cette session. Utilisez Modifier.'),409
            for target in ids:
                if not ensure_shops(cn,target): return jsonify(erreur='Session introuvable.'),404
                session_templates.save_rows(cn,target,'brandshops',[row])
                cn.execute('''INSERT INTO public.brandshops_utilisateur
                    (utilisateur_id,brandshop_id,actif,nom_personnalise,ville_personnalisee,adresse_personnalisee,mobile_personnalise)
                    VALUES (%s,%s,true,NULL,NULL,NULL,NULL)
                    ON CONFLICT (utilisateur_id,brandshop_id) DO UPDATE SET actif=true,
                    nom_personnalise=NULL,ville_personnalisee=NULL,adresse_personnalisee=NULL,mobile_personnalise=NULL''',(target,ident))
        return jsonify(ok=True,id=ident,sessions=len(ids))

    @app.put('/admin/api/sessions/<int:uid>/specs/manual/<reference>')
    def manual_spec(uid,reference):
        data=request.get_json(silent=True) or {}
        if not isinstance(data,dict) or data.get('scope','selected') not in ('selected','all'):
            return jsonify(erreur='Données invalides.'),400
        fields=data.get('fields')
        if not reference or len(reference)>120 or not isinstance(fields,dict) or not fields or len(fields)>40:
            return jsonify(erreur='Référence ou caractéristiques invalides.'),400
        cleaned={str(k).strip():str(v).strip() for k,v in fields.items() if str(k).strip() and str(v).strip()}
        if not cleaned or any(len(k)>120 or len(v)>2000 for k,v in cleaned.items()):
            return jsonify(erreur='Caractéristiques invalides.'),400
        row={'REFERENCE ':reference,'_manual':cleaned}
        with connexion() as cn:
            ids=scope_ids(cn,uid,data.get('scope','selected'))
            if not ids: return jsonify(erreur='Session introuvable.'),404
            if not cn.execute('SELECT reference FROM public.offres_utilisateur WHERE utilisateur_id=%s AND reference=%s',(uid,reference)).fetchone():
                return jsonify(erreur='Produit absent de cette session.'),404
            for target in ids:
                session_templates.save_rows(cn,target,'specs',[row])
        return jsonify(ok=True,sessions=len(ids))

    @app.put('/admin/api/sessions/<int:uid>/discounts/manual')
    def manual_discount(uid):
        data=request.get_json(silent=True) or {}
        expected,_=session_templates.source('discounts')
        # 6, 12 et 18 mois obligatoires ; 24 mois accepté en plus (remise de la formule 24 mois).
        cles=set(data)-{'scope'} if isinstance(data,dict) else set()
        if not isinstance(data,dict) or data.get('scope','selected') not in ('selected','all') or not set(expected)<=cles or not cles<=set(expected)|{'24 Months'}:
            return jsonify(erreur='Remises ou portée invalides.'),400
        row={key:data[key] for key in cles}
        try: session_templates.validate('discounts',[row])
        except Exception as exc: return jsonify(erreur=str(exc)),400
        with connexion() as cn:
            ids=scope_ids(cn,uid,data.get('scope','selected'))
            if not ids: return jsonify(erreur='Session introuvable.'),404
            for target in ids: session_templates.save_rows(cn,target,'discounts',[row])
        return jsonify(ok=True,sessions=len(ids))

    @app.put('/admin/api/sessions/<int:uid>/formules')
    def formules_session(uid):
        data=request.get_json(silent=True) or {}
        permises=data.get('formules')
        if not isinstance(permises,list) or not permises or any(str(m) not in ('cash','6','12','18','24') for m in permises) or data.get('scope','selected') not in ('selected','all'):
            return jsonify(erreur='Cochez au moins une formule valide.'),400
        valeur=','.join(m for m in ('cash','6','12','18','24') if m in {str(x) for x in permises})
        with connexion() as cn:
            ids=scope_ids(cn,uid,data.get('scope','selected'))
            if not ids: return jsonify(erreur='Session introuvable.'),404
            cn.execute('UPDATE public.utilisateurs_catalogue SET formules_autorisees=%s WHERE id = ANY(%s)',(valeur,ids))
        return jsonify(ok=True,sessions=len(ids))

    @app.put('/admin/api/sessions/<int:uid>/remise-minimum')
    def remise_minimum_session(uid):
        data=request.get_json(silent=True) or {}
        try: valeur=int(str(data.get('valeur')).strip())
        except (TypeError,ValueError): return jsonify(erreur="Indiquez un nombre entier d'articles."),400
        if not 1<=valeur<=99: return jsonify(erreur="Le nombre d'articles doit être entre 1 et 99."),400
        if data.get('scope','selected') not in ('selected','all'): return jsonify(erreur='Portée invalide.'),400
        with connexion() as cn:
            ids=scope_ids(cn,uid,data.get('scope','selected'))
            if not ids: return jsonify(erreur='Session introuvable.'),404
            cn.execute('UPDATE public.utilisateurs_catalogue SET remise_minimum=%s WHERE id = ANY(%s)',(valeur,ids))
        return jsonify(ok=True,sessions=len(ids))

    @app.post('/admin/api/sessions/<int:uid>/import/<kind>')
    def import_template(uid,kind):
        if kind not in session_templates.FILES:
            return jsonify(erreur='Type de fichier inconnu.'),404
        scope=request.form.get('scope','selected')
        if scope not in ('selected','all'):
            return jsonify(erreur='Portée invalide.'),400
        upload=request.files.get('fichier')
        if not upload or not upload.filename.lower().endswith(('.xlsx','.csv')):
            return jsonify(erreur='Fichier .xlsx ou .csv requis.'),400
        contents=upload.read(4_000_001)
        if len(contents)>4_000_000:
            return jsonify(erreur='Fichier trop volumineux (4 Mo).'),413
        return appliquer_import(uid,kind,scope,contents)

    @app.get('/admin/api/sessions/<int:uid>/tableau')
    def lire_tableau(uid):
        # Tableau des produits de la session : valeurs de la session, sinon valeurs par défaut.
        colonnes, defauts = session_templates.source('products')
        par_ref = {session_templates.record_key('products', r): r for r in defauts}
        with connexion() as cn:
            offres = cn.execute('SELECT reference, actif FROM public.offres_utilisateur WHERE utilisateur_id=%s ORDER BY reference', (uid,)).fetchall()
            if not offres and not cn.execute('SELECT id FROM public.utilisateurs_catalogue WHERE id=%s', (uid,)).fetchone():
                return jsonify(erreur='Session introuvable.'), 404
            donnees = session_templates.snapshot(cn, uid)
        lignes = []
        for offre in offres:
            ref = offre['reference']
            source_ligne = donnees['products'].get(ref) or par_ref.get(ref)
            if source_ligne:
                ligne = {c: str(source_ligne.get(c, '') or '') for c in colonnes + ['FACILITE 24 MOIS']}
                ligne['actif'] = bool(offre['actif'])
                lignes.append(ligne)
        return jsonify(colonnes=colonnes, lignes=lignes)

    @app.put('/admin/api/sessions/<int:uid>/tableau')
    def enregistrer_tableau(uid):
        # Enregistre les lignes éditées : une ligne par référence, les produits absents du tableau ne sont pas supprimés.
        donnees = request.get_json(silent=True) or {}
        scope = donnees.get('scope', 'selected')
        if scope not in ('selected', 'all'):
            return jsonify(erreur='Portée invalide.'), 400
        colonnes, _ = session_templates.source('products')
        lignes = donnees.get('lignes')
        if not isinstance(lignes, list) or not 1 <= len(lignes) <= 2000:
            return jsonify(erreur='Tableau vide ou trop long (2 000 lignes maximum).'), 400
        rows, actifs, nouveaux = [], [], []
        for ligne in lignes:
            if not isinstance(ligne, dict):
                return jsonify(erreur='Ligne invalide.'), 400
            row = {c: str(ligne.get(c) or '') for c in colonnes}
            if str(ligne.get('FACILITE 24 MOIS') or '').strip():
                try: row['FACILITE 24 MOIS'] = formater_prix(ligne['FACILITE 24 MOIS'])
                except ValueError as exc: return jsonify(erreur=f"Produit {row['REFERENCE ']} : facilité 24 mois : {exc}"), 400
            try:
                session_templates.validate('products', [row])
            except ValueError as exc:
                return jsonify(erreur=f"Produit {row['REFERENCE ']} : {exc}"), 400
            if ligne.get('nouveau') is True:
                if not row['category'].strip() or not row['sous categorie'].strip() or not row['DESIGNATION'].strip():
                    return jsonify(erreur=f"Produit {row['REFERENCE ']} : catégorie, sous-catégorie et désignation requises."), 400
                nouveaux.append(row['REFERENCE '].strip())
            rows.append(row)
            actifs.append(ligne.get('actif') is not False)
        try:
            session_templates.validate('products', rows)
        except ValueError as exc:
            return jsonify(erreur=str(exc)), 400
        with connexion() as cn:
            ids = scope_ids(cn, uid, scope)
            if not ids: return jsonify(erreur='Session introuvable.'), 404
            for target in ids:
                for ref in nouveaux:
                    if cn.execute('SELECT 1 FROM public.offres_utilisateur WHERE utilisateur_id=%s AND reference=%s', (target, ref)).fetchone():
                        return jsonify(erreur=f'Le produit {ref} existe déjà dans cette session.'), 409
            for target in ids:
                session_templates.save_rows(cn, target, 'products', rows)
                for row, actif in zip(rows, actifs):
                    cn.execute('INSERT INTO public.offres_utilisateur (utilisateur_id,reference,prix_offre,actif) VALUES (%s,%s,%s,%s) ON CONFLICT (utilisateur_id,reference) DO UPDATE SET prix_offre=EXCLUDED.prix_offre,actif=EXCLUDED.actif',
                               (target, session_templates.record_key('products', row), session_templates.parse_number(row['PRIX B2B CASH + TIMBRE']), actif))
        return jsonify(ok=True, lignes=len(rows), sessions=len(ids))

    def appliquer_import(uid,kind,scope,contents):
        try:
            rows=session_templates.parse_upload(kind,contents)
        except Exception as exc:
            return jsonify(erreur=str(exc)),400
        with connexion() as cn:
            ids=scope_ids(cn,uid,scope)
            if not ids: return jsonify(erreur='Session introuvable.'),404
            if kind=='specs':
                assigned={str(item['reference']) for item in cn.execute('SELECT reference FROM public.offres_utilisateur WHERE utilisateur_id=%s',(uid,)).fetchall()}
                if any(session_templates.record_key(kind,row) not in assigned for row in rows if session_templates.record_key(kind,row)):
                    return jsonify(erreur='Référence spec absente de la session sélectionnée.'),400
            for target in ids:
                session_templates.save_rows(cn,target,kind,rows)
                if kind=='products':
                    for row in rows:
                        ref=session_templates.record_key(kind,row)
                        cn.execute('INSERT INTO public.offres_utilisateur (utilisateur_id,reference,prix_offre,actif) VALUES (%s,%s,%s,true) ON CONFLICT (utilisateur_id,reference) DO UPDATE SET prix_offre=EXCLUDED.prix_offre,actif=true',(target,ref,session_templates.parse_number(row['PRIX B2B CASH + TIMBRE'])))
                if kind=='brandshops':
                    if not ensure_shops(cn,target): return jsonify(erreur='Session introuvable.'),404
                    for row in rows:
                        shop_id=int(session_templates.record_key(kind,row))
                        cn.execute('INSERT INTO public.brandshops_utilisateur (utilisateur_id,brandshop_id,actif) VALUES (%s,%s,true) ON CONFLICT (utilisateur_id,brandshop_id) DO UPDATE SET actif=true',(target,shop_id))
        return jsonify(ok=True,imported=len(rows),sessions=len(ids))

    @app.route('/admin/api/sessions/<int:uid>/products/manual',methods=['POST'])
    @app.route('/admin/api/sessions/<int:uid>/products/manual/<reference>',methods=['PUT'])
    def manual_product(uid,reference=None):
        payload=request.get_json(silent=True) or {}
        if not isinstance(payload,dict):
            return jsonify(erreur='Données produit invalides.'),400
        scope=payload.get('scope','selected')
        if scope not in ('selected','all'):
            return jsonify(erreur='Portée invalide.'),400
        expected,_=session_templates.source('products')
        # Colonnes anciennes du CSV, absentes du formulaire : laissees vides si non envoyees.
        facultatives={'PRIX B2B CASH','TIMBRE'}
        # Facilité 24 mois : saisie optionnelle, stockée avec le produit de la session (absente du CSV).
        cles=set(payload)-{'scope'}
        if not isinstance(payload,dict) or not cles<=set(expected)|{'FACILITE 24 MOIS'} or not (set(expected)-facultatives)<=cles:
            return jsonify(erreur='Tous les champs de items.csv sont requis.'),400
        row={key:str(payload.get(key,'')) for key in expected}
        if str(payload.get('FACILITE 24 MOIS') or '').strip():
            try: row['FACILITE 24 MOIS']=formater_prix(payload['FACILITE 24 MOIS'])
            except ValueError as exc: return jsonify(erreur=f'Facilité 24 mois : {exc}'),400
        ref=session_templates.record_key('products',row)
        if not ref or len(ref)>120 or (reference is not None and ref!=reference):
            return jsonify(erreur='Référence invalide ou modifiée.'),400
        if not str(row['category']).strip() or not str(row['sous categorie']).strip() or not str(row['DESIGNATION']).strip():
            return jsonify(erreur='Catégorie, sous-catégorie et désignation requises.'),400
        try: session_templates.validate('products',[row])
        except Exception as exc: return jsonify(erreur=str(exc)),400
        with connexion() as cn:
            ids=scope_ids(cn,uid,scope)
            if not ids: return jsonify(erreur='Session introuvable.'),404
            exists=cn.execute('SELECT reference FROM public.offres_utilisateur WHERE utilisateur_id=%s AND reference=%s',(uid,ref)).fetchone()
            if reference is None and exists: return jsonify(erreur='Ce produit est déjà dans cette session. Utilisez Modifier.'),409
            if reference is not None and not exists: return jsonify(erreur='Produit introuvable dans cette session.'),404
            for target in ids:
                session_templates.save_rows(cn,target,'products',[row])
                cn.execute('INSERT INTO public.offres_utilisateur (utilisateur_id,reference,prix_offre,actif) VALUES (%s,%s,%s,true) ON CONFLICT (utilisateur_id,reference) DO UPDATE SET prix_offre=EXCLUDED.prix_offre,actif=true',
                           (target,ref,session_templates.parse_number(row['PRIX B2B CASH + TIMBRE'])))
        return jsonify(ok=True,reference=ref,sessions=len(ids))
