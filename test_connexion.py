import psycopg2

DATABASE_URL = 'postgresql://postgres:1234@localhost:5432/SAMSUNG%20PRICE%20LIST%20CONVENTIONS'

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM products;')
    print('Succes, nombre de produits :', cur.fetchone()[0])
    cur.close()
    conn.close()
except Exception as e:
    print('Erreur :', e)
