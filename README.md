# TechDrop — Setup

Dois projetos independentes que trabalham juntos.

---

## 📁 Estrutura

```
techdrop-backend/
  server.js     ← API REST (Express) + agendador cron
  scraper.js    ← Scraper de Kabum, Pichau e Amazon BR
  package.json

techdrop-frontend/
  index.html    ← Site completo (HTML/CSS/JS puro, sem build)
```

---

## 🔧 Backend

### 1. Instalar dependências
```bash
cd techdrop-backend
npm install
```

### 2. Rodar
```bash
node server.js
# ou em dev (auto-reload):
node --watch server.js
```

O servidor sobe em **http://localhost:3001**  
Ao iniciar, dispara o primeiro scrape automaticamente.  
Depois roda a cada **3 horas** via cron.

### Endpoints
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/deals` | Todas as ofertas ativas |
| GET | `/api/deals?cat=gpu` | Filtro por categoria |
| GET | `/api/deals/:id` | Detalhe + histórico |
| GET | `/api/history/:id?days=30` | Histórico de preços |
| GET | `/api/stats` | Resumo geral |
| POST | `/api/scrape` | Scrape manual (header: `x-scrape-secret`) |

### Personalizar produtos monitorados
Edite o array `WATCHLIST` no `scraper.js`:

```js
{
  slug: 'rx-7900-xtx',        // identificador único
  name: 'RX 7900 XTX 24GB',
  category: 'gpu',            // gpu | cpu | ram | perifericos
  image_url: null,
  sources: [
    { store: 'Kabum',  url: 'https://www.kabum.com.br/produto/...' },
    { store: 'Pichau', url: 'https://www.pichau.com.br/...' },
  ],
},
```

### Adicionar nova loja
Adicione um parser no objeto `PARSERS` em `scraper.js`:

```js
async function parseMinhaLoja(url) {
  const $ = await fetchHTML(url);
  const price    = parsePrice($('.preco-parcelado').text());
  const original = parsePrice($('.preco-de').text()) || null;
  return { price, original, in_stock: 1 };
}

const PARSERS = {
  // ...
  'MinhaLoja': parseMinhaLoja,
};
```

---

## 🌐 Frontend

Abra `techdrop-frontend/index.html` diretamente no browser.

**Com backend rodando:** conecta automaticamente em `localhost:3001` e exibe dados reais.

**Sem backend:** cai para modo demonstração com dados mockados — útil para desenvolver o visual sem precisar do backend.

### Mudar URL da API
No topo do `<script>` do `index.html`:
```js
const API_BASE = 'http://localhost:3001/api';
// Troque pelo seu deploy, ex: 'https://api.meusite.com/api'
```

---

## 🚀 Deploy sugerido

| Parte | Onde |
|-------|------|
| Backend | Railway, Render, VPS (qualquer Node.js) |
| Frontend | Vercel, Netlify, GitHub Pages (arquivo estático) |
| Banco | SQLite local (backend) ou migrate para Turso/PlanetScale |

---

## ⚠️ Observações

- Sites de e-commerce mudam os seletores CSS com frequência — os parsers podem precisar de ajuste eventual.
- Para uso intenso (muitos produtos), considere adicionar proxies rotativos ao `fetchHTML`.
- Os links de compra no WATCHLIST são de exemplo; substitua pelos URLs reais dos produtos.
