# ✦ Animes RD

Site estático hospedado no GitHub Pages que consome dados do Notion e exibe gráficos, rankings e comparações dos animes assistidos por **Rafael**, **Fernando** e **Dudu**.

## 🔗 Páginas

| Página | Descrição |
|---|---|
| `index.html` | Tabela geral com busca, filtros e modal de detalhes |
| `charts.html` | Gráficos gerais: gêneros, notas, dispersão, controvérsia |
| `compare.html` | Comparação entre 2 pessoas: Venn, radar, notas lado a lado |
| `rafael.html` | Perfil individual do Rafael |
| `fernando.html` | Perfil individual do Fernando |
| `dudu.html` | Perfil individual do Dudu |

---

## 🚀 Setup

### 1. Clone e suba o repositório

```bash
git clone https://github.com/SEU_USER/animes-rd.git
cd animes-rd
git add .
git commit -m "feat: initial setup"
git push origin main
```

### 2. Crie a Notion Integration

1. Acesse [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Clique em **New integration**
3. Dê um nome (ex: `Animes RD Site`) e clique em **Submit**
4. Copie a **Internal Integration Secret** (`secret_xxx...`)

### 3. Compartilhe o database com a integration

1. Abra o database **Animes RD** no Notion
2. Clique nos `...` no canto superior direito → **Add connections**
3. Selecione a integration que você criou

### 4. Adicione os secrets no GitHub

No seu repositório: **Settings → Secrets and variables → Actions → New repository secret**

| Nome | Valor |
|---|---|
| `NOTION_API_KEY` | `secret_xxx...` (sua integration key) |
| `NOTION_DATABASE_ID` | `a2e6beabc78483ac879e015a5695384b` |

### 5. Ative o GitHub Pages

**Settings → Pages → Source: Deploy from branch → Branch: `main` / `(root)` → Save**

### 6. Rode o workflow pela primeira vez

**Actions → Fetch Notion Data → Run workflow**

Isso vai buscar os dados do Notion, salvar em `data/animes.json` e fazer commit automático.
Após isso, o site atualiza automaticamente todo dia às 06h e a cada push.

---

## 🗂️ Estrutura

```
animes-rd/
├── index.html              # Página inicial
├── charts.html             # Gráficos gerais
├── compare.html            # Comparação entre pessoas
├── rafael.html             # Perfil Rafael
├── fernando.html           # Perfil Fernando
├── dudu.html               # Perfil Dudu
├── css/
│   └── style.css           # Estilos globais
├── js/
│   ├── data.js             # Carrega e processa animes.json
│   ├── table.js            # Tabela com filtros, ordenação e modal
│   ├── charts.js           # Todos os gráficos (Chart.js)
│   └── compare.js          # Lógica de comparação, Venn e radar
├── data/
│   └── animes.json         # Gerado automaticamente pelo GitHub Action
├── scripts/
│   ├── fetch-notion.js     # Script Node.js que busca dados do Notion
│   └── package.json
└── .github/
    └── workflows/
        └── fetch-notion.yml  # GitHub Action
```

---

## 🛠️ Desenvolvimento local

```bash
# Instale um servidor local (necessário por causa dos ES modules)
npx serve .
# ou
python3 -m http.server 8000
```

Abra `http://localhost:8000` no navegador.

Para testar o fetch do Notion localmente:

```bash
cd scripts
npm install
NOTION_API_KEY=secret_xxx NOTION_DATABASE_ID=a2e6beab... node fetch-notion.js
```

---

## 📦 Dependências

- [Chart.js 4.4](https://www.chartjs.org/) — gráficos (CDN)
- [@notionhq/client](https://github.com/makenotion/notion-sdk-js) — apenas no script de fetch (Node.js)
- Sem frameworks JS no frontend
