"""CSV catalogue templates and isolated data snapshots per user account."""
import csv
import io
import json
import os
import sys
import unicodedata
import zipfile
from pathlib import Path
from decimal import Decimal
from werkzeug.security import safe_join

BUNDLED_SITE_PACKAGES=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/Lib/site-packages'
if BUNDLED_SITE_PACKAGES.is_dir() and str(BUNDLED_SITE_PACKAGES) not in sys.path:
    sys.path.append(str(BUNDLED_SITE_PACKAGES))
LOCAL_ROOT = Path(__file__).resolve().parent
ROOT=LOCAL_ROOT if (LOCAL_ROOT/'items.csv').is_file() else Path(__file__).resolve().parent/'session-defaults'
FILES={'products':'items.csv','brandshops':'Brandshops.csv','specs':'Specs.csv','discounts':'Discount.csv'}
KEYS={'products':'REFERENCE ','brandshops':'ID','specs':'REFERENCE ','discounts':None}

def source(kind):
    with (ROOT/FILES[kind]).open(encoding='utf-8-sig',newline='') as f:
        rows=list(csv.reader(f,delimiter=';'))
    headers=rows[0]
    return headers,[dict(zip(headers,row)) for row in rows[1:] if len(row)==len(headers)]

def parse_upload(kind,data):
    expected,_=source(kind)
    if data.startswith(bytes.fromhex('D0CF11E0A1B11AE1')):
        raise ValueError('Ancien format Excel .xls détecté. Enregistrez en .xlsx ou CSV.')
    if zipfile.is_zipfile(io.BytesIO(data)):
        from openpyxl import load_workbook
        try:
            wb=load_workbook(io.BytesIO(data),read_only=True,data_only=False)
        except Exception as exc:
            raise ValueError('Classeur Excel illisible. Enregistrez-le en vrai .xlsx ou CSV.') from exc
        try:
            sheet=wb.active
            rows=sheet.iter_rows()
            first=next(rows,None)
            if first is None: raise ValueError('Fichier vide.')
            headers=[str(c.value or '').strip() for c in first]
            if headers != [h.strip() for h in expected]:
                raise ValueError('Colonnes ou ordre différents de '+FILES[kind]+'. Attendu : '+' | '.join(h.strip() for h in expected))
            result=[]
            for number,cells in enumerate(rows,2):
                if number>2001: raise ValueError('Maximum 2 000 lignes.')
                if any(c.data_type=='f' for c in cells): raise ValueError(f'Ligne {number} : formules interdites.')
                values=[c.value if c.value is not None else '' for c in cells]
                if not any(str(v).strip() for v in values): continue
                if len(values)!=len(expected): raise ValueError(f'Ligne {number} : nombre de colonnes incorrect.')
                result.append(dict(zip(expected,values)))
        finally: wb.close()
    else:
        if data[:64].lstrip().startswith(b'<## NASCA DRM FILE'):
            raise ValueError('Fichier protégé par NASCA DRM : exportez-le depuis son logiciel en CSV non protégé ou en vrai XLSX.')
        if data.startswith((b'\xff\xfe', b'\xfe\xff')):
            try: text=data.decode('utf-16')
            except UnicodeDecodeError as exc: raise ValueError('CSV UTF-16 invalide.') from exc
        elif data.startswith((b'\xff\xfe\x00\x00', b'\x00\x00\xfe\xff')):
            try: text=data.decode('utf-32')
            except UnicodeDecodeError as exc: raise ValueError('CSV UTF-32 invalide.') from exc
        else:
            try: text=data.decode('utf-8-sig')
            except UnicodeDecodeError:
                try: text=data.decode('cp1252')
                except UnicodeDecodeError as exc:
                    raise ValueError('Le contenu n’est ni un XLSX, ni un CSV texte lisible. Exportez le fichier en CSV UTF-8 ou en XLSX depuis Excel.') from exc
        if '\x00' in text: raise ValueError('Contenu binaire détecté. Exportez en CSV texte ou en vrai XLSX.')
        first_line=text.splitlines()[0] if text.splitlines() else ''
        delimiter=';' if ';' in first_line else '\t' if '\t' in first_line else ','
        reader=csv.reader(io.StringIO(text,newline=''),delimiter=delimiter)
        headers=next(reader,None)
        if headers is None: raise ValueError('Fichier vide.')
        if [h.strip() for h in headers] != [h.strip() for h in expected]:
            raise ValueError('Colonnes ou ordre différents de '+FILES[kind]+'. Attendu : '+' | '.join(h.strip() for h in expected))
        result=[]
        for number,values in enumerate(reader,2):
            if number>2001: raise ValueError('Maximum 2 000 lignes.')
            if not any(v.strip() for v in values): continue
            if len(values)!=len(expected): raise ValueError(f'Ligne {number} : nombre de colonnes incorrect.')
            result.append(dict(zip(expected,values)))
    validate(kind,result)
    return result


def parse_excel(kind,data):
    return parse_upload(kind,data)

def validate(kind,rows):
    if not rows: raise ValueError('Aucune ligne de données.')
    if kind=='discounts' and len(rows)!=1: raise ValueError('Discount exige exactement une ligne.')
    key=KEYS[kind]
    if key:
        vals=[str(row[key]).strip() for row in rows]
        if kind=='specs': vals=[v for v in vals if v]
        if len(vals)!=len(set(vals)) or not vals: raise ValueError('Identifiants vides ou doublons.')
        if kind!='specs' and any(not v for v in vals): raise ValueError('Identifiant vide.')
    if kind=='brandshops':
        if any(not record_key(kind,r).isdigit() or int(record_key(kind,r)) <= 0 for r in rows):
            raise ValueError('ID brandshop invalide.')
    if kind=='products':
        for row in rows:
            for col in ('PRIX SHOWROOM','PRIX B2B CASH + TIMBRE','FACILITE 6 MOIS','FACILITE 12 MOIS','FACILITE 18 MOIS'):
                parse_number(row[col])
    if kind=='discounts':
        for col in ('6 Months','12 Months','18 Months'):
            value=parse_number(rows[0][col]);
            if value>=100: raise ValueError('Remise invalide.')

def parse_number(value):
    text=''.join(str(value).replace('%','').split()).replace(',','.')
    number=Decimal(text)
    if not number.is_finite() or number<0: raise ValueError('Nombre invalide : '+str(value))
    return float(number)

def record_key(kind,row):
    return 'rates' if kind=='discounts' else str(row[KEYS[kind]]).strip()

def prepare(cn):
    cn.execute('''CREATE TABLE IF NOT EXISTS public.donnees_session (
      utilisateur_id bigint NOT NULL REFERENCES public.utilisateurs_catalogue(id) ON DELETE CASCADE,
      type_donnee text NOT NULL CHECK (type_donnee IN ('products','brandshops','specs','discounts')),
      cle text NOT NULL, payload jsonb NOT NULL,
      PRIMARY KEY (utilisateur_id,type_donnee,cle)
    )''')

def save_rows(cn,uid,kind,rows):
    validate(kind,rows)
    for row in rows:
        if kind=='specs' and not str(row[KEYS[kind]]).strip(): continue
        cn.execute('''INSERT INTO public.donnees_session (utilisateur_id,type_donnee,cle,payload)
          VALUES (%s,%s,%s,%s::jsonb) ON CONFLICT (utilisateur_id,type_donnee,cle)
          DO UPDATE SET payload=EXCLUDED.payload''',(uid,kind,record_key(kind,row),json.dumps(row,ensure_ascii=False,default=str)))

def initialize(cn,uid,product_refs,shop_ids):
    for kind in FILES:
        _,rows=source(kind)
        validate(kind,rows)
        if kind=='products':
            rows=[r for r in rows if record_key(kind,r) in product_refs]
            for row in rows:
                cn.execute('''INSERT INTO public.offres_utilisateur (utilisateur_id,reference,prix_offre)
                  VALUES (%s,%s,%s) ON CONFLICT DO NOTHING''',(uid,record_key(kind,row),parse_number(row['PRIX B2B CASH + TIMBRE'])))
        if kind=='brandshops':
            rows=[r for r in rows if int(record_key(kind,r)) in shop_ids]
            for row in rows:
                cn.execute('''INSERT INTO public.brandshops_utilisateur (utilisateur_id,brandshop_id) VALUES (%s,%s) ON CONFLICT DO NOTHING''',(uid,int(record_key(kind,row))))
            cn.execute('UPDATE public.utilisateurs_catalogue SET tous_brandshops=false WHERE id=%s',(uid,))
        if kind=='specs': rows=[r for r in rows if record_key(kind,r) in product_refs]
        if rows: save_rows(cn,uid,kind,rows)

def snapshot(cn,uid):
    rows=cn.execute('SELECT type_donnee,cle,payload FROM public.donnees_session WHERE utilisateur_id=%s',(uid,)).fetchall()
    result={kind:{} for kind in FILES}
    for row in rows: result[row['type_donnee']][row['cle']]=row['payload']
    return result

def product_from_row(row, category=None):
    raw_type=str(row['Type']).strip()
    clean=''.join(c for c in unicodedata.normalize('NFKD',raw_type.lower()) if c.isalnum() and not unicodedata.combining(c))
    categories={'aspirateur':'Aspirateurs','climatiseur':'Climatiseurs','refrigerateur':'Réfrigérateurs',
                'lavelinge':'Lave-linge','microondes':'Micro-ondes','crystalled':'Téléviseurs',
                'neoqled':'Téléviseurs','oled':'Téléviseurs','qled':'Téléviseurs','televiseur':'Téléviseurs'}
    category=category or categories.get(clean,raw_type)
    photo=str(row['product photos']).strip().replace('\\','/')
    if not photo.startswith('assets/') or '..' in Path(photo).parts or not (os.environ.get('SEPP_CLOUD_MODE') == '1' or (Path(__file__).resolve().parent/photo).is_file()):
        photo=None
    return {'id':record_key('products',row),'reference':record_key('products',row),'name':str(row['DESIGNATION']).strip(),
            'type':raw_type,'category':category,'marketPrice':parse_number(row['PRIX SHOWROOM']),
            'offerPrice':parse_number(row['PRIX B2B CASH + TIMBRE']),
            'financing':{'3/6':parse_number(row['FACILITE 6 MOIS']),'12':parse_number(row['FACILITE 12 MOIS']),'18':parse_number(row['FACILITE 18 MOIS'])},
            'availability':str(row['Disponibilité']).strip(),'image':photo,'box':None}


def shop_from_row(row):
    return {'id':int(record_key('brandshops',row)), 'name':str(row['Nom du Showroom']).strip(),
            'city':str(row['Ville']).strip(), 'address':str(row['Adresse']).strip(),
            'contactName':str(row['Responsable local']).strip(), 'phone':str(row['Mobile']).strip(),
            'email':str(row['Email']).strip() or None, 'mapsUrl':str(row.get('Google Maps URL') or '').strip() or None}


def apply(catalogue,data):
    existing={p['reference'] for p in catalogue['products']}
    for ref,row in data['products'].items():
        if ref not in existing:
            catalogue['products'].append(product_from_row(row))
    for product in catalogue['products']:
        row=data['products'].get(product['reference'])
        if not row: continue
        updated=product_from_row(row)
        product['type']=updated['type']
        product['category']=updated['category']
        product['name']=str(row['DESIGNATION']).strip() or product['name']
        product['marketPrice']=parse_number(row['PRIX SHOWROOM'])
        product['financing']={'3/6':parse_number(row['FACILITE 6 MOIS']),'12':parse_number(row['FACILITE 12 MOIS']),'18':parse_number(row['FACILITE 18 MOIS'])}
        product['availability']=str(row['Disponibilité']).strip() or product['availability']
        photo=str(row['product photos']).strip().replace('\\','/')
        if photo.startswith('assets/') and '..' not in Path(photo).parts and (os.environ.get('SEPP_CLOUD_MODE') == '1' or (Path(__file__).resolve().parent/photo).is_file()):
            product['image']=photo
    existing_shops={shop['id'] for shop in catalogue['shops']}
    for key,row in data['brandshops'].items():
        if int(key) not in existing_shops:
            catalogue['shops'].append(shop_from_row(row))
    for shop in catalogue['shops']:
        row=data['brandshops'].get(str(shop['id']))
        if not row: continue
        for key,col in [('name','Nom du Showroom'),('city','Ville'),('address','Adresse'),('contactName','Responsable local'),('phone','Mobile'),('email','Email')]:
            shop[key]=str(row[col]).strip()
        shop['mapsUrl']=str(row.get('Google Maps URL') or '').strip() or None
    for ref,row in data['specs'].items():
        if '_manual' in row:
            catalogue['specs'][ref]={str(k):str(v) for k,v in row['_manual'].items() if str(k).strip() and str(v).strip()}
            continue
        if ref in catalogue['specs']:
            keys=list(catalogue['specs'][ref])
            values=[v for k,v in row.items() if k not in ('Type','REFERENCE ','DESIGNATION','Column1')]
            catalogue['specs'][ref]={label:str(value).strip() for label,value in zip(keys,values) if str(value).strip()}
        else:
            catalogue['specs'][ref]={str(k):str(v).strip() for k,v in row.items()
                                     if k not in ('Type','REFERENCE ','DESIGNATION','Column1') and str(v).strip()}
    rates=data['discounts'].get('rates')
    if rates: catalogue['discount']={str(m):parse_number(rates[str(m)+' Months']) for m in (6,12,18)}
    return catalogue
