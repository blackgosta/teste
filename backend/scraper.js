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
// ─────────────────────────────────────────────────────────────────────────────
// WATCHLIST — Top produtos mais buscados no Brasil (hardware gamer, 2025)
// Todas as URLs são páginas de produto direto (/dp/), nunca buscas (/s?k=)
// ─────────────────────────────────────────────────────────────────────────────
const WATCHLIST = [

  // ── GPUs ──────────────────────────────────────────────────────────────────

  {
    slug: 'rtx-4060-8gb-msi-ventus',
    name: 'RTX 4060 8GB MSI Ventus',
    category: 'gpu',
    image_url: null,
    sources: [
      // #1 GPU mais vendida geração Ada no BR
      { store: 'Amazon', url: 'https://www.amazon.com.br/Placa-128Bits-Ventus-MSI-912-V516-012/dp/B0C7W8GZMJ' },
    ],
  },
  {
    slug: 'rtx-4060-ti-8gb-msi-ventus',
    name: 'RTX 4060 Ti 8GB MSI Ventus',
    category: 'gpu',
    image_url: null,
    sources: [
      { store: 'Amazon', url: 'https://www.amazon.com.br/Placa-Video-VENTUS-MSI-912-V515/dp/B0C4F7KX1B' },
    ],
  },
  {
    slug: 'rtx-3060-12gb-asus-tuf',
    name: 'RTX 3060 12GB ASUS TUF',
    category: 'gpu',
    image_url: null,
    sources: [
      // Ainda muito popular custo-benefício
      { store: 'Amazon', url: 'https://www.amazon.com.br/Placa-V%C3%ADdeo-ASUS-TUF-Gaming/dp/B096658ZWP' },
    ],
  },
  {
    slug: 'rx-6600-8gb-asrock',
    name: 'RX 6600 8GB ASRock Challenger',
    category: 'gpu',
    image_url: null,
    sources: [
      // AMD mais vendida entrada/intermediário
      { store: 'Amazon', url: 'https://www.amazon.com.br/ASRock-Placa-gr%C3%A1fica-Challenger-resfriamento/dp/B09KG8JXQR' },
    ],
  },

  // ── CPUs ─────────────────────────────────────────────────────────────────

  {
    slug: 'ryzen-5-5500',
    name: 'Ryzen 5 5500',
    category: 'cpu',
    image_url: null,
    sources: [
      // #1 mais vendido CPU AM4 custo-benefício
      { store: 'Amazon', url: 'https://www.amazon.com.br/Processador-AMD-Ryzen-5500-100100000457BOX/dp/B09HM4NRJJ' },
    ],
  },
  {
    slug: 'ryzen-5-5600',
    name: 'Ryzen 5 5600',
    category: 'cpu',
    image_url: null,
    sources: [
      { store: 'Amazon', url: 'https://www.amazon.com.br/PROCESSADOR-AMD-5600-100-100000927BOX-Cer%C3%A2mica/dp/B09VCHR1VH' },
    ],
  },
  {
    slug: 'ryzen-5-5600x',
    name: 'Ryzen 5 5600X',
    category: 'cpu',
    image_url: null,
    sources: [
      { store: 'Amazon', url: 'https://www.amazon.com.br/Processador-AMD-Ryzen-5600X-Threads/dp/B08166SLDF' },
    ],
  },
  {
    slug: 'ryzen-7-5700x',
    name: 'Ryzen 7 5700X',
    category: 'cpu',
    image_url: null,
    sources: [
      // Muito procurado para upgrade AM4
      { store: 'Amazon', url: 'https://www.amazon.com.br/PROCESSADOR-AMD-RYZEN-5700X-100-100000926WOF/dp/B09VCGKZH1' },
    ],
  },
  {
    slug: 'ryzen-5-7600',
    name: 'Ryzen 5 7600',
    category: 'cpu',
    image_url: null,
    sources: [
      // Melhor custo-benefício AM5 2025
      { store: 'Amazon', url: 'https://www.amazon.com.br/PROCESSADOR-AMD-RYZEN-7600-100-100001015BOX/dp/B0BBJDS4GM' },
    ],
  },

  // ── RAM ───────────────────────────────────────────────────────────────────

  {
    slug: 'kingston-fury-beast-32gb-ddr5',
    name: 'Kingston Fury Beast 32GB DDR5 5600',
    category: 'ram',
    image_url: null,
    sources: [
      // Módulo único desktop mais popular DDR5
      { store: 'Amazon', url: 'https://www.amazon.com.br/KF556C40BB-32-M%C3%B3dulo-mem%C3%B3ria-5600Mhz-desktop/dp/B09T8WL54M' },
    ],
  },
  {
    slug: 'kingston-fury-beast-rgb-32gb-ddr5-kit',
    name: 'Kingston Fury Beast RGB Kit 2x16GB DDR5',
    category: 'ram',
    image_url: null,
    sources: [
      // Kit dual-channel mais buscado DDR5 com RGB
      { store: 'Amazon', url: 'https://www.amazon.com.br/Kingston-Technology-sincroniza%C3%A7%C3%A3o-infravermelha-KF556C36BBEAK2-32/dp/B0BD5VH64R' },
    ],
  },
  {
    slug: 'corsair-vengeance-32gb-ddr4-3200',
    name: 'Corsair Vengeance LPX 32GB DDR4 3200',
    category: 'ram',
    image_url: null,
    sources: [
      // Kit DDR4 mais vendido ainda no Brasil (plataformas AM4/LGA1200)
      { store: 'Amazon', url: 'https://www.amazon.com.br/CORSAIR-CMK32GX4M2E3200C16-Vengeance-3200MHz-Desktop/dp/B08C4Z69LN' },
    ],
  },

  // ── SSD ───────────────────────────────────────────────────────────────────

  {
    slug: 'kingston-nv3-1tb-nvme',
    name: 'Kingston NV3 1TB NVMe M.2',
    category: 'ssd',
    image_url: null,
    sources: [
      // #1 SSD mais vendido absoluto na Amazon BR 2025
      { store: 'Amazon', url: 'https://www.amazon.com.br/Kingston-NV3-2280-NVMe-SNV3S/dp/B0BBWH7DBT' },
    ],
  },
  {
    slug: 'kingston-nv3-2tb-nvme',
    name: 'Kingston NV3 2TB NVMe M.2',
    category: 'ssd',
    image_url: null,
    sources: [
      { store: 'Amazon', url: 'https://www.amazon.com.br/Kingston-NV3-2280-NVMe-SNV3S/dp/B0C7YKT74D' },
    ],
  },
  {
    slug: 'samsung-980-1tb-nvme',
    name: 'Samsung 980 1TB NVMe M.2',
    category: 'ssd',
    image_url: null,
    sources: [
      { store: 'Amazon', url: 'https://www.amazon.com.br/Samsung-MZ-V8V1T0B-AM-980-SSD/dp/B08GVFF1VB' },
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
