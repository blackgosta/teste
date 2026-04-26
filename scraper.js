/**
 * TechDrop Scraper — scraper.js
 *
 * Scrape modular: cada loja tem seu próprio parser.
 * Adicionar nova loja = adicionar um objeto em SCRAPERS.
 *
 * Estratégia anti-block:
 *  - Delay aleatório entre requests
 *  - User-Agent rotativo
 *  - Timeout por request
 */

const axios   = require('axios');
const cheerio = require('cheerio');

// ─── Produtos monitorados ─────────────────────────────────────────────────────
// Cada entrada define um slug único, categoria e URLs por loja
const WATCHLIST = [
  {
    slug: 'rtx-4070-super-12gb',
    name: 'RTX 4070 Super 12GB',
    category: 'gpu',
    image_url: 'https://i.imgur.com/placeholder1.png',
    sources: [
      { store: 'Kabum',  url: 'https://www.kabum.com.br/produto/558819/placa-de-video-rtx-4070-super' },
      { store: 'Pichau', url: 'https://www.pichau.com.br/placa-de-video-gigabyte-geforce-rtx-4070-super' },
    ],
  },
  {
    slug: 'rtx-3060-12gb',
    name: 'RTX 3060 12GB',
    category: 'gpu',
    image_url: null,
    sources: [
      { store: 'Kabum',  url: 'https://www.kabum.com.br/produto/166474/placa-de-video-rtx-3060-12gb' },
      { store: 'Amazon', url: 'https://www.amazon.com.br/s?k=rtx+3060+12gb' },
    ],
  },
  {
    slug: 'rtx-4060-8gb',
    name: 'RTX 4060 8GB',
    category: 'gpu',
    image_url: null,
    sources: [
      { store: 'Amazon', url: 'https://www.amazon.com.br/s?k=rtx+4060+8gb' },
      { store: 'Pichau', url: 'https://www.pichau.com.br/placa-de-video-msi-geforce-rtx-4060' },
    ],
  },
  {
    slug: 'ryzen-5-5600',
    name: 'Ryzen 5 5600',
    category: 'cpu',
    image_url: null,
    sources: [
      { store: 'Kabum',  url: 'https://www.kabum.com.br/produto/216843/processador-amd-ryzen-5-5600' },
      { store: 'Amazon', url: 'https://www.amazon.com.br/s?k=ryzen+5+5600' },
    ],
  },
  {
    slug: 'kingston-fury-32gb-ddr5',
    name: 'Kingston Fury 32GB DDR5',
    category: 'ram',
    image_url: null,
    sources: [
      { store: 'Pichau', url: 'https://www.pichau.com.br/memoria-ram-kingston-fury-beast-ddr5-32gb' },
      { store: 'Kabum',  url: 'https://www.kabum.com.br/produto/535898/memoria-ram-kingston-fury-beast-32gb-ddr5' },
    ],
  },
  {
    slug: 'ryzen-7-7700x',
    name: 'Ryzen 7 7700X',
    category: 'cpu',
    image_url: null,
    sources: [
      { store: 'Kabum',  url: 'https://www.kabum.com.br/produto/386527/processador-amd-ryzen-7-7700x' },
    ],
  },
];

// ─── User agents rotativos ────────────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

function randomAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────
async function fetchHTML(url) {
  const { data } = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': randomAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.google.com/',
    },
  });
  return cheerio.load(data);
}

// ─── Parsers por loja ────────────────────────────────────────────────────────

/**
 * Kabum — preço fica em span.sc-cdc9b13f-0 ou data-price
 */
async function parseKabum(url) {
  const $ = await fetchHTML(url);

  // Preço com desconto (boleto/pix)
  const priceText =
    $('[data-smarthint-attribute="price"]').first().text() ||
    $('h4.sc-5992cf4-3').first().text() ||
    $('span.sc-cdc9b13f-0').first().text();

  // Preço original (sem desconto)
  const originalText =
    $('span.sc-cdc9b13f-1').first().text() ||
    $('del').first().text();

  const price    = parsePrice(priceText);
  const original = parsePrice(originalText) || null;

  if (!price) return null;

  const inStock = !$('[data-testid="out-of-stock"]').length;

  return { price, original, in_stock: inStock ? 1 : 0 };
}

/**
 * Pichau — preço em span com classe contendo "price"
 */
async function parsePichau(url) {
  const $ = await fetchHTML(url);

  const priceText    = $('[class*="price"]:not([class*="old"]):not([class*="from"])').first().text();
  const originalText = $('[class*="old-price"], [class*="from-price"]').first().text();

  const price    = parsePrice(priceText);
  const original = parsePrice(originalText) || null;

  if (!price) return null;

  const inStock = !!$('button[class*="add-to-cart"], button[class*="comprar"]').length;

  return { price, original, in_stock: inStock ? 1 : 0 };
}

/**
 * Amazon BR — preço em span.a-price-whole + .a-price-fraction
 */
async function parseAmazon(url) {
  const $ = await fetchHTML(url);

  // Listing page (busca)
  const isSearch = url.includes('/s?');

  let price, original, inStock = 1;

  if (isSearch) {
    // Pega o primeiro resultado
    const priceWhole    = $('span.a-price-whole').first().text().replace(/\D/g, '');
    const priceFraction = $('span.a-price-fraction').first().text().replace(/\D/g, '') || '00';
    const raw = `${priceWhole}.${priceFraction}`;
    price = parseFloat(raw) || null;

    const originalText = $('span.a-price.a-text-price span.a-offscreen').first().text();
    original = parsePrice(originalText) || null;
  } else {
    // Página de produto
    const priceWhole    = $('#priceblock_ourprice, .a-price-whole').first().text();
    price    = parsePrice(priceWhole);
    const originalText = $('span.priceBlockStrikePriceString, span.a-price.a-text-price span.a-offscreen').first().text();
    original = parsePrice(originalText) || null;
    inStock  = !$('#outOfStock').length ? 1 : 0;
  }

  if (!price) return null;
  return { price, original, in_stock: inStock };
}

// ─── Dispatch por store ──────────────────────────────────────────────────────
const PARSERS = {
  'Kabum':  parseKabum,
  'Pichau': parsePichau,
  'Amazon': parseAmazon,
};

// ─── Parser de preço ─────────────────────────────────────────────────────────
function parsePrice(text = '') {
  if (!text) return null;
  // "R$ 2.799,90" → 2799.90
  const cleaned = text
    .replace(/R\$\s*/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  const n = parseFloat(cleaned);
  return isNaN(n) || n <= 0 ? null : n;
}

// ─── scrapeAll ───────────────────────────────────────────────────────────────
async function scrapeAll() {
  const results = [];
  let ok = 0, fail = 0;

  for (const product of WATCHLIST) {
    for (const source of product.sources) {
      await sleep(1200 + Math.random() * 1800); // 1.2–3s entre requests

      const parser = PARSERS[source.store];
      if (!parser) {
        console.warn(`[scraper] Parser não encontrado para loja: ${source.store}`);
        continue;
      }

      try {
        console.log(`[scraper] → ${product.name} @ ${source.store}`);
        const data = await parser(source.url);

        if (!data || !data.price) {
          console.warn(`[scraper]   ✗ Preço não encontrado`);
          fail++;
          continue;
        }

        results.push({
          slug:      product.slug,
          name:      product.name,
          category:  product.category,
          image_url: product.image_url,
          store:     source.store,
          url:       source.url,
          price:     data.price,
          original:  data.original,
          in_stock:  data.in_stock,
        });

        console.log(`[scraper]   ✓ R$ ${data.price}${data.original ? ` (era R$ ${data.original})` : ''}`);
        ok++;

      } catch (err) {
        console.error(`[scraper]   ✗ Erro: ${err.message}`);
        fail++;
      }
    }
  }

  console.log(`[scraper] Concluído: ${ok} ok, ${fail} falhas`);
  return results;
}

module.exports = { scrapeAll, WATCHLIST };
