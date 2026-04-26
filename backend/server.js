/**
 * TechDrop Backend — server.js
 * API REST + Scraper de promoções de hardware
 *
 * Instalar dependências:
 *   npm install express cors better-sqlite3 axios cheerio node-cron
 *
 * Rodar:
 *   node server.js
 *
 * Endpoints:
 *   GET  /api/deals          → lista todas as ofertas ativas
 *   GET  /api/deals?cat=gpu  → filtra por categoria
 *   GET  /api/deals/:id      → detalhe de uma oferta
 *   GET  /api/history/:id    → histórico de preços de um produto
 *   POST /api/scrape          → dispara scrape manual (protegido por secret)
 *   GET  /api/stats           → resumo geral
 */

const express   = require('express');
const cors      = require('cors');
const cron      = require('node-cron');
const Database  = require('better-sqlite3');
const { scrapeAll } = require('./scraper');

const app = express();
const db  = new Database('./techdrop.db');
const PORT = process.env.PORT || 3001;
const SCRAPE_SECRET = process.env.SCRAPE_SECRET || 'techdrop-secret';

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,
    image_url   TEXT
  );

  CREATE TABLE IF NOT EXISTS prices (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES products(id),
    store       TEXT NOT NULL,
    price       REAL NOT NULL,
    original    REAL,
    url         TEXT NOT NULL,
    in_stock    INTEGER DEFAULT 1,
    scraped_at  TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_prices_product ON prices(product_id);
  CREATE INDEX IF NOT EXISTS idx_prices_scraped ON prices(scraped_at);
`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Retorna a oferta mais barata atual por produto
 * (última entrada de preço nas últimas 25h, menor valor)
 */
function getBestDeals(category = null) {
  const catFilter = category ? `AND p.category = ?` : '';
  const params = category ? [category] : [];

  return db.prepare(`
    SELECT
      pr.id,
      prod.slug,
      prod.name,
      prod.category,
      prod.image_url,
      pr.store,
      pr.price,
      pr.original,
      pr.url,
      pr.in_stock,
      pr.scraped_at,
      ROUND((1 - pr.price / pr.original) * 100) AS discount_pct
    FROM products prod
    JOIN prices pr ON pr.product_id = prod.id
    WHERE pr.scraped_at >= datetime('now', '-25 hours', 'localtime')
      ${catFilter}
      AND pr.in_stock = 1
      AND pr.id = (
        SELECT id FROM prices
        WHERE product_id = prod.id
          AND scraped_at >= datetime('now', '-25 hours', 'localtime')
          AND in_stock = 1
        ORDER BY price ASC
        LIMIT 1
      )
    ORDER BY discount_pct DESC NULLS LAST, pr.price ASC
  `).all(...params);
}

function getPriceHistory(productId, days = 30) {
  return db.prepare(`
    SELECT store, price, original, url, scraped_at
    FROM prices
    WHERE product_id = ?
      AND scraped_at >= datetime('now', ? || ' days', 'localtime')
    ORDER BY scraped_at ASC
  `).all(productId, -days);
}

function getStats() {
  const totalDeals = db.prepare(`
    SELECT COUNT(DISTINCT product_id) as n
    FROM prices WHERE scraped_at >= datetime('now', '-25 hours', 'localtime')
  `).get();

  const savings = db.prepare(`
    SELECT SUM(CASE WHEN original IS NOT NULL THEN original - price ELSE 0 END) as total
    FROM prices
    WHERE scraped_at >= datetime('now', '-25 hours', 'localtime') AND in_stock = 1
  `).get();

  const lastRun = db.prepare(`
    SELECT MAX(scraped_at) as ts FROM prices
  `).get();

  return {
    activeDeals: totalDeals.n,
    totalSavingsR$: Math.round(savings.total || 0),
    lastScrapedAt: lastRun.ts,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/deals', (req, res) => {
  try {
    const { cat } = req.query;
    const deals = getBestDeals(cat || null);
    res.json({ ok: true, count: deals.length, data: deals });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/deals/:id', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ? OR slug = ?')
      .get(req.params.id, req.params.id);
    if (!product) return res.status(404).json({ ok: false, error: 'Not found' });

    const latestPrices = db.prepare(`
      SELECT store, price, original, url, in_stock, scraped_at
      FROM prices
      WHERE product_id = ?
      ORDER BY scraped_at DESC
      LIMIT 20
    `).all(product.id);

    res.json({ ok: true, data: { ...product, latestPrices } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/history/:id', (req, res) => {
  try {
    const { days = 30 } = req.query;
    const product = db.prepare('SELECT * FROM products WHERE id = ? OR slug = ?')
      .get(req.params.id, req.params.id);
    if (!product) return res.status(404).json({ ok: false, error: 'Not found' });

    const history = getPriceHistory(product.id, Number(days));
    res.json({ ok: true, product, data: history });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/stats', (_req, res) => {
  try {
    res.json({ ok: true, data: getStats() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/scrape', async (req, res) => {
  const secret = req.headers['x-scrape-secret'];
  if (secret !== SCRAPE_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  try {
    res.json({ ok: true, message: 'Scrape iniciado em background' });
    await runScrape(); // não bloqueia a resposta
  } catch (err) {
    console.error('[scrape manual]', err.message);
  }
});

// ─── Scrape runner ────────────────────────────────────────────────────────────

async function runScrape() {
  console.log(`[${new Date().toLocaleString('pt-BR')}] ▶ Iniciando scrape...`);
  try {
    const results = await scrapeAll();
    let inserted = 0;

    const upsertProduct = db.prepare(`
      INSERT INTO products (slug, name, category, image_url)
      VALUES (@slug, @name, @category, @image_url)
      ON CONFLICT(slug) DO UPDATE SET name=excluded.name, image_url=excluded.image_url
    `);

    const insertPrice = db.prepare(`
      INSERT INTO prices (product_id, store, price, original, url, in_stock)
      VALUES (@product_id, @store, @price, @original, @url, @in_stock)
    `);

    const insertMany = db.transaction((items) => {
      for (const item of items) {
        upsertProduct.run(item);
        const row = db.prepare('SELECT id FROM products WHERE slug = ?').get(item.slug);
        insertPrice.run({ ...item, product_id: row.id });
        inserted++;
      }
    });

    insertMany(results);
    console.log(`[scrape] ✓ ${inserted} preços salvos`);
  } catch (err) {
    console.error('[scrape] ✗', err.message);
  }
}

// ─── Cron: roda a cada 3 horas ────────────────────────────────────────────────
cron.schedule('0 */3 * * *', runScrape);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 TechDrop API rodando em http://localhost:${PORT}`);
  console.log(`   Endpoints: /api/deals  /api/stats  /api/history/:id\n`);
  // Roda scrape inicial ao subir o servidor
  runScrape();
});
