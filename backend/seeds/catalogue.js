'use strict';
// Garnit la boutique d'un premier assortiment (sacs, chaussures, vêtements) avec des photos libres de droits (Unsplash).
// Lancement :  npm run seed:catalogue   — sans danger à relancer : un article déjà présent (même nom) est ignoré.
// Les noms, prix et stocks sont des exemples : modifiez-les ensuite dans l'administration (menu « Articles »).
const { pool } = require('../src/config/db');
const catalog = require('../src/services/adminCatalogService');
const s = require('../src/validators/schemas');

// « id@bottom » recadre sur le bas de la photo (utile quand le sujet est en bas de l'image).
const photo = (ref) => { const [id, crop] = ref.split('@'); return `https://images.unsplash.com/photo-${id}?w=1000&q=80&fit=crop&ar=4:5&fm=jpg${crop ? '&crop=' + crop : ''}`; };
const sizes = (name, values, price, stocks) => values.map((v, i) => ({ attributes: { [name]: v }, price, stockQuantity: stocks[i % stocks.length] }));
const POINTURES = ['36', '37', '38', '39', '40', '41'];
const TAILLES = ['S', 'M', 'L', 'XL'];

const ARTICLES = [
  // ---- Sacs ----
  { cat: 'Sacs', name: 'Sac cabas en cuir tressé', img: '1598532163257-ae3c6b2524b6', desc: 'Grand cabas en cuir tressé camel, chaîne dorée amovible. Assez vaste pour le quotidien.', variants: [{ attributes: {}, price: 35000, stockQuantity: 6 }] },
  { cat: 'Sacs', name: 'Sac à main bordeaux à rabat', img: '1596552639068-99bd471b579c', desc: 'Sac structuré bordeaux, fermoir doré, anse courte et bandoulière réglable.', variants: [{ attributes: {}, price: 28000, stockQuantity: 5 }] },
  { cat: 'Sacs', name: 'Sac à main bleu canard', img: '1594223274512-ad4803739b7c', desc: 'Cuir grainé bleu canard, rabat à fermoir doré. Une touche de couleur qui réveille une tenue sobre.', variants: [{ attributes: {}, price: 26000, stockQuantity: 4 }] },
  { cat: 'Sacs', name: 'Sac à main noir structuré', img: '1713425886650-69ed8aa1b7c9', desc: 'Lignes nettes, cuir noir grainé, bandoulière amovible. Le sac qui va avec tout.', variants: [{ attributes: {}, price: 30000, stockQuantity: 7 }] },
  { cat: 'Sacs', name: 'Petit sac blanc à anse', img: '1575403538007-acb790100421', desc: 'Petit format ivoire, anse rigide et fermoir argenté. Idéal pour les sorties.', variants: [{ attributes: {}, price: 22000, stockQuantity: 5 }] },
  { cat: 'Sacs', name: 'Pochette perlée', img: '1722510825571-8cdd1fe98ba4', desc: 'Pochette de soirée entièrement perlée, anse en perles. Pour les grandes occasions.', variants: [{ attributes: {}, price: 18000, stockQuantity: 3 }] },

  // ---- Chaussures ----
  { cat: 'Chaussures', name: 'Escarpins blancs à talon bloc', img: '1562687848-c1664eff566d', desc: 'Escarpins à bout pointu, cuir blanc cassé, talon bloc stable.', variants: sizes('Pointure', POINTURES, 25000, [2, 4, 5, 4, 3, 1]) },
  { cat: 'Chaussures', name: 'Escarpins noirs classiques', img: '1596703263926-eb0762ee17e4', desc: 'L\'escarpin noir intemporel : bout pointu, talon aiguille, cuir lisse.', variants: sizes('Pointure', POINTURES, 24000, [3, 5, 6, 5, 2, 0]) },
  { cat: 'Chaussures', name: 'Sandales à talon nude', img: '1595970487296-8818e128ac4b', desc: 'Sandales à bride cheville, talon carré, teinte nude qui allonge la jambe.', variants: sizes('Pointure', POINTURES, 20000, [2, 3, 5, 4, 2, 1]) },
  { cat: 'Chaussures', name: 'Sandales à brides argentées', img: '1618615099365-8330e38d5d57', desc: 'Sandales plates à brides croisées et détails argentés.', variants: sizes('Pointure', POINTURES, 15000, [3, 4, 4, 3, 2, 2]) },
  { cat: 'Chaussures', name: 'Tapettes tressées', img: '1618615098938-84fc29796e76', desc: 'Tapettes à large bride tressée et perlée, semelle confortable. Faciles à enfiler, jolies à porter.', variants: sizes('Pointure', POINTURES, 9000, [5, 6, 8, 6, 4, 2]) },
  { cat: 'Chaussures', name: 'Mules en dentelle', img: '1619510331283-a46c425e48bb', desc: 'Mules à bride en dentelle écrue, petit talon compensé.', variants: sizes('Pointure', POINTURES, 12000, [2, 4, 5, 3, 2, 0]) },
  { cat: 'Chaussures', name: 'Baskets blanches', img: '1608384177866-0bca0d225435@bottom', desc: 'Baskets basses entièrement blanches, semelle souple. Le basique qui va avec tout.', variants: sizes('Pointure', POINTURES, 18000, [4, 6, 8, 7, 5, 3]) },
  { cat: 'Chaussures', name: 'Baskets à paillettes', img: '1620114884229-65d21f8c9423', desc: 'Baskets blanches perforées, contrefort à paillettes roses.', variants: sizes('Pointure', POINTURES, 19500, [2, 3, 4, 4, 2, 1]) },

  // ---- Vêtements ----
  { cat: 'Vêtements', name: 'Jean clair taille haute', img: '1602293589930-45aad59ba3ab', desc: 'Jean délavé clair, taille haute, coupe droite.', variants: sizes('Taille', ['36', '38', '40', '42', '44'], 14000, [3, 5, 6, 4, 2]) },
  { cat: 'Vêtements', name: 'Jean brut coupe droite', img: '1713880453396-aa0493e308ec', desc: 'Denim brut foncé, coupe droite, cinq poches.', variants: sizes('Taille', ['36', '38', '40', '42', '44'], 15000, [2, 4, 6, 5, 3]) },
  { cat: 'Vêtements', name: 'Polo bicolore beige', img: '1711355249709-1733df63e028', desc: 'Polo en maille piquée, col et bas beige, sans motif.', variants: sizes('Taille', TAILLES, 9500, [4, 6, 5, 3]) },
  { cat: 'Vêtements', name: 'Polo noir uni', img: '1625910513413-c23b8bb81cba', desc: 'Polo noir en coton piqué, coupe droite, sans motif.', variants: sizes('Taille', TAILLES, 9000, [5, 7, 6, 4]) },
  { cat: 'Vêtements', name: 'T-shirt blanc uni', img: '1581655353564-df123a1eb820', desc: 'T-shirt en coton épais, col rond, blanc uni.', variants: sizes('Taille', TAILLES, 5000, [6, 9, 8, 5]) },
  { cat: 'Vêtements', name: 'T-shirt vert sauge', img: '1789110520733-ff019cdee043', desc: 'T-shirt féminin à manches courtes, vert sauge, coupe ajustée.', variants: sizes('Taille', TAILLES, 5500, [4, 6, 5, 2]) },
  { cat: 'Vêtements', name: 'T-shirt uni multicolore', img: '1562157873-818bc0726f68', desc: 'Le même t-shirt uni, décliné en plusieurs couleurs. Coton doux, col rond.',
    variants: ['Blanc', 'Noir', 'Rouge', 'Bleu marine', 'Jaune'].flatMap((c, i) => ['S', 'M', 'L'].map((t, j) => ({ attributes: { Couleur: c, Taille: t }, price: 4500, stockQuantity: (i + j) % 4 + 2 }))) },
];

async function categoryId(name) {
  const [rows] = await pool.query('SELECT id FROM categories WHERE name = ?', [name]);
  if (rows.length) return rows[0].id;
  return (await catalog.saveCategory(s.category.parse({ name }))).id;
}

async function main() {
  let added = 0, skipped = 0;
  for (const a of ARTICLES) {
    const [exists] = await pool.query('SELECT id FROM products WHERE name = ?', [a.name]);
    if (exists.length) { skipped++; continue; }
    // La photo d'abord : si elle est introuvable, l'article n'est pas créé (pas d'article sans image).
    const res = await fetch(photo(a.img));
    if (!res.ok) { console.warn(`Photo indisponible (${res.status}) : « ${a.name} » ignoré.`); continue; }
    const buffer = Buffer.from(await res.arrayBuffer());
    const input = s.product.parse({ name: a.name, categoryId: await categoryId(a.cat), description: a.desc, variants: a.variants });
    const { id } = await catalog.saveProduct(input, undefined, null);
    await catalog.addImage(id, { buffer }, a.name);
    added++; console.log(`+ ${a.cat} · ${a.name}`);
  }
  console.log(`Terminé : ${added} article(s) ajouté(s), ${skipped} déjà présent(s).`);
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
