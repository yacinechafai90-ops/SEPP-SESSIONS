import fs from 'node:fs/promises';
import pg from 'pg';
const {Pool}=pg;
const products=JSON.parse(await fs.readFile(new URL('./products.json',import.meta.url),'utf8'));
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
try {
 await client.query('BEGIN');
 for(const p of products){
  const c=await client.query('SELECT id FROM categories WHERE name=$1',[p.category]);
  if(!c.rowCount) throw new Error(`Unknown category: ${p.category}`);
  const subName=(()=>{const n=p.name.toLowerCase();if(p.category==='Téléviseurs')return /neo\\s*qled/.test(n)?'Neo QLED':/\\boled\\b|\\bo led\\b/.test(n)?'OLED':/\\bqled\\b/.test(n)?'QLED':/crystal/.test(n)?'Crystal LED':null;if(p.category==='Lave-linge')return /top/i.test(n)?'Top Load':/front/i.test(n)?'Front Load':null;return null})();
  const sub=subName?await client.query('SELECT id FROM subcategories WHERE category_id=$1 AND name=$2',[c.rows[0].id,subName]):{rowCount:0};
  const ins=await client.query(`INSERT INTO products(reference,designation,category_id,subcategory_id,market_price_dzd,offer_price_dzd,availability,image_path,specs) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(reference) DO UPDATE SET designation=EXCLUDED.designation,category_id=EXCLUDED.category_id,subcategory_id=EXCLUDED.subcategory_id,market_price_dzd=EXCLUDED.market_price_dzd,offer_price_dzd=EXCLUDED.offer_price_dzd,availability=EXCLUDED.availability,image_path=EXCLUDED.image_path,specs=EXCLUDED.specs RETURNING id`,[p.reference,p.name,c.rows[0].id,sub.rowCount?sub.rows[0].id:null,p.marketPrice,p.offerPrice,p.availability,p.image,p.specs||{}]);
  const id=ins.rows[0].id;for(const [code,total] of [['cash',p.offerPrice],['3/6',p.financing['3/6']],['12',p.financing['12']],['18',p.financing['18']]]){await client.query('INSERT INTO product_payment_totals(product_id,payment_plan_id,total_amount_dzd) SELECT $1,id,$2 FROM payment_plans WHERE code=$3 ON CONFLICT(product_id,payment_plan_id) DO UPDATE SET total_amount_dzd=EXCLUDED.total_amount_dzd',[id,total,code]);}
 }
 await client.query('COMMIT');
} catch(e){await client.query('ROLLBACK');throw e} finally{client.release();await pool.end()}
console.log(`Imported ${products.length} products`);
