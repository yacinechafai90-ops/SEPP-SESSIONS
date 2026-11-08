"""Acces des visiteurs et offres individuelles du catalogue."""
from decimal import Decimal, InvalidOperation
from functools import wraps
from flask import abort, redirect, request, session, Response, jsonify
from werkzeug.security import check_password_hash
import session_templates


def preparer_base(srv):
    with srv['ouvrir_connexion'](srv['NOM_BASE']) as cn:
        cn.execute('''CREATE TABLE IF NOT EXISTS public.utilisateurs_catalogue (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            identifiant text UNIQUE NOT NULL,
            mot_de_passe_hash text NOT NULL,
            actif boolean NOT NULL DEFAULT true
        )''')
        cn.execute('ALTER TABLE public.utilisateurs_catalogue ADD COLUMN IF NOT EXISTS tous_brandshops boolean NOT NULL DEFAULT true')
        cn.execute('''CREATE TABLE IF NOT EXISTS public.brandshops_utilisateur (
            utilisateur_id bigint NOT NULL REFERENCES public.utilisateurs_catalogue(id) ON DELETE CASCADE,
            brandshop_id bigint NOT NULL,
            PRIMARY KEY (utilisateur_id, brandshop_id)
        )''')
        cn.execute('''CREATE TABLE IF NOT EXISTS public.offres_utilisateur (
            utilisateur_id bigint NOT NULL REFERENCES public.utilisateurs_catalogue(id) ON DELETE CASCADE,
            reference text NOT NULL,
            prix_offre numeric(12,2),
            PRIMARY KEY (utilisateur_id, reference),
            CHECK (prix_offre IS NULL OR prix_offre >= 0)
        )''')
        cn.execute('ALTER TABLE public.offres_utilisateur ADD COLUMN IF NOT EXISTS actif boolean NOT NULL DEFAULT true')
        cn.execute('ALTER TABLE public.brandshops_utilisateur ADD COLUMN IF NOT EXISTS actif boolean NOT NULL DEFAULT true')
        for column in ('nom_personnalise', 'ville_personnalisee', 'adresse_personnalisee', 'mobile_personnalise'):
            cn.execute(f'ALTER TABLE public.brandshops_utilisateur ADD COLUMN IF NOT EXISTS {column} text')
        session_templates.prepare(cn)
        cn.execute('''CREATE TABLE IF NOT EXISTS public.photos_session (
            chemin text PRIMARY KEY,
            contenu bytea NOT NULL,
            mime text NOT NULL
        )''')

def appliquer_offre(srv, catalogue, utilisateur_id):
    with srv['ouvrir_connexion'](srv['NOM_BASE']) as cn:
        lignes = cn.execute('''SELECT reference, prix_offre FROM public.offres_utilisateur
                               WHERE utilisateur_id = %s AND actif = true''', (utilisateur_id,)).fetchall()
        compte = cn.execute('SELECT tous_brandshops FROM public.utilisateurs_catalogue WHERE id = %s', (utilisateur_id,)).fetchone()
        boutiques = cn.execute('SELECT brandshop_id, nom_personnalise, ville_personnalisee, adresse_personnalisee, mobile_personnalise FROM public.brandshops_utilisateur WHERE utilisateur_id = %s AND actif = true', (utilisateur_id,)).fetchall()
        session_data = session_templates.snapshot(cn, utilisateur_id)
    catalogue = session_templates.apply(catalogue, session_data)
    offres = {str(l['reference']).strip(): l['prix_offre'] for l in lignes}
    produits = []
    for produit in catalogue['products']:
        reference = produit['reference']
        if reference not in offres:
            continue
        produit = dict(produit)
        if offres[reference] is not None:
            produit['offerPrice'] = float(offres[reference])
        produits.append(produit)
    catalogue['products'] = produits
    catalogue['specs'] = {r: s for r, s in catalogue['specs'].items() if r in offres}
    if compte and not compte['tous_brandshops']:
        autorises = {int(b['brandshop_id']) for b in boutiques}
        catalogue['shops'] = [b for b in catalogue['shops'] if b['id'] in autorises]
        details = {int(b['brandshop_id']): b for b in boutiques}
        for shop in catalogue['shops']:
            extra = details[shop['id']]
            for column, key in [('nom_personnalise','name'), ('ville_personnalisee','city'), ('adresse_personnalisee','address'), ('mobile_personnalise','phone')]:
                if extra[column] is not None:
                    shop[key] = extra[column]
    return catalogue

def installer(app, srv):
    @app.before_request
    def proteger_catalogue():
        chemin = request.path
        if chemin == '/specs.js':
            abort(404)
        if chemin.startswith('/admin') or chemin.startswith('/publication') or chemin == '/connexion':
            return None
        identite = session.get('utilisateur_id')
        if identite:
            with srv['ouvrir_connexion'](srv['NOM_BASE']) as cn:
                compte = cn.execute('SELECT actif FROM public.utilisateurs_catalogue WHERE id = %s', (identite,)).fetchone()
            if compte and compte['actif']:
                return None
        session.pop('utilisateur_id', None)
        if chemin.endswith(('.js', '.json', '.xlsx', '.pdf')) or chemin == '/data.js':
            return Response('Connexion requise', status=401, mimetype='text/plain')
        return redirect('/connexion')

    @app.route('/connexion', methods=['GET', 'POST'])
    def connexion_utilisateur():
        erreur = ''
        if request.method == 'POST':
            identifiant = request.form.get('identifiant', '').strip()
            mot_de_passe = request.form.get('mot_de_passe', '')
            with srv['ouvrir_connexion'](srv['NOM_BASE']) as cn:
                compte = cn.execute('''SELECT id, mot_de_passe_hash FROM public.utilisateurs_catalogue
                                       WHERE identifiant = %s AND actif = true''', (identifiant,)).fetchone()
            if compte and check_password_hash(compte['mot_de_passe_hash'], mot_de_passe):
                session.clear()
                session.permanent = True
                session['utilisateur_id'] = compte['id']
                return redirect('/')
            erreur = '<p role="alert">Identifiant ou mot de passe incorrect.</p>'
        page = '''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion au catalogue</title><style>body{font:16px Arial;background:#f4f6fb;display:grid;place-items:center;min-height:100vh}main{background:white;padding:2rem;border-radius:14px;box-shadow:0 8px 30px #0002;width:min(90vw,400px)}label{display:block;margin:1rem 0}input{display:block;width:100%;box-sizing:border-box;padding:.8rem;margin-top:.3rem}button{background:#1428a0;color:white;border:0;padding:.8rem 1.2rem;border-radius:6px;cursor:pointer}p[role=alert]{color:#a00}</style><main><h1>Catalogue Samsung</h1><p>Connectez-vous pour voir votre offre.</p>'''+erreur+'''<form method="post"><label>Identifiant<input name="identifiant" autocomplete="username" required></label><label>Mot de passe<input name="mot_de_passe" type="password" autocomplete="current-password" required></label><button type="submit">Connexion</button></form></main></html>'''
        return Response(page, mimetype='text/html')

    @app.post('/deconnexion')
    def deconnexion_utilisateur():
        session.clear()
        return redirect('/connexion')
    @app.get('/admin/api/offres')
    def api_offres():
        with srv['ouvrir_connexion'](srv['NOM_BASE']) as cn:
            utilisateurs = cn.execute('SELECT id, identifiant, actif FROM public.utilisateurs_catalogue ORDER BY identifiant').fetchall()
            attributions = cn.execute('SELECT utilisateur_id, reference, prix_offre, actif FROM public.offres_utilisateur ORDER BY utilisateur_id, reference').fetchall()
        produits = [{'reference': p['reference'], 'name': p['name'], 'offerPrice': p['offerPrice']}
                    for p in srv['charger_catalogue']()['products']]
        return jsonify(utilisateurs=utilisateurs, produits=produits,
                       attributions=[{'utilisateur_id': a['utilisateur_id'], 'reference': a['reference'],
                                      'prix_offre': float(a['prix_offre']) if a['prix_offre'] is not None else None, 'actif': a['actif']}
                                     for a in attributions])

    @app.put('/admin/api/offres')
    def enregistrer_offre():
        donnees = request.get_json(silent=True) or {}
        try:
            utilisateur_id = int(donnees.get('utilisateur_id'))
        except (TypeError, ValueError):
            return jsonify(erreur='Choisissez un utilisateur.'), 400
        reference = str(donnees.get('reference') or '').strip()
        if not reference:
            return jsonify(erreur='Choisissez un produit.'), 400
        texte = str(donnees.get('prix_offre') or '').strip().replace(' ', '').replace(',', '.')
        try:
            prix = Decimal(texte) if texte else None
        except InvalidOperation:
            return jsonify(erreur='Prix invalide.'), 400
        if prix is not None and (not prix.is_finite() or prix < 0 or prix > 9999999999.99):
            return jsonify(erreur='Prix invalide.'), 400
        if reference not in {p['reference'] for p in srv['charger_catalogue']()['products']}:
            return jsonify(erreur='Référence introuvable dans le catalogue actif.'), 400
        with srv['ouvrir_connexion'](srv['NOM_BASE']) as cn:
            utilisateur = cn.execute('SELECT actif FROM public.utilisateurs_catalogue WHERE id = %s', (utilisateur_id,)).fetchone()
            if not utilisateur or not utilisateur['actif']:
                return jsonify(erreur='Utilisateur introuvable ou inactif.'), 400
            cn.execute('''INSERT INTO public.offres_utilisateur (utilisateur_id, reference, prix_offre)
                          VALUES (%s, %s, %s)
                          ON CONFLICT (utilisateur_id, reference)
                          DO UPDATE SET prix_offre = EXCLUDED.prix_offre, actif = true''',
                       (utilisateur_id, reference, prix))
        return jsonify(ok=True)

    @app.delete('/admin/api/offres')
    def supprimer_offre():
        donnees = request.get_json(silent=True) or {}
        try:
            utilisateur_id = int(donnees.get('utilisateur_id'))
        except (TypeError, ValueError):
            return jsonify(erreur='Choisissez un utilisateur.'), 400
        reference = str(donnees.get('reference') or '').strip()
        if not reference:
            return jsonify(erreur='Choisissez un produit.'), 400
        with srv['ouvrir_connexion'](srv['NOM_BASE']) as cn:
            cn.execute('DELETE FROM public.offres_utilisateur WHERE utilisateur_id = %s AND reference = %s',
                       (utilisateur_id, reference))
        return jsonify(ok=True)
