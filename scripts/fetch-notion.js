const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_VERSION = process.env.NOTION_VERSION || "2022-06-28";

function getText(prop) {
  if (!prop) return "";
  if (prop.type === "title") return prop.title.map((t) => t.plain_text).join("");
  if (prop.type === "rich_text") return prop.rich_text.map((t) => t.plain_text).join("");
  return "";
}

function getNumber(prop) {
  if (!prop || prop.type !== "number") return null;
  return prop.number;
}

function getFormula(prop) {
  if (!prop || prop.type !== "formula") return null;
  const f = prop.formula;
  if (f.type === "number") return f.number;
  if (f.type === "string") return f.string;
  return null;
}

function getMultiSelect(prop) {
  if (!prop || prop.type !== "multi_select") return [];
  return prop.multi_select.map((s) => s.name);
}

function getFiles(prop) {
  if (!prop || prop.type !== "files") return [];
  return prop.files.map((f) => {
    if (f.type === "external") return { name: f.name, url: f.external.url };
    if (f.type === "file") return { name: f.name, url: f.file.url };
    return null;
  }).filter(Boolean);
}

const PEOPLE = ["Rafael", "Fernando", "Dudu", "Hacksuya"];
const userNameCache = new Map();
let warnedCommentsPermission = false;

function normalizeName(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseNamedComments(text) {
  if (!text) return [];
  const peoplePattern = PEOPLE.join("|");
  const linePattern = new RegExp(`^\\s*(${peoplePattern})\\s*[:\\-–—]\\s*(.+)$`, "i");

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(linePattern);
      if (!match) return null;
      const person = PEOPLE.find((p) => normalizeName(p) === normalizeName(match[1]));
      return person ? { person, text: match[2].trim() } : null;
    })
    .filter(Boolean);
}

function getComments(properties) {
  const comments = [];

  for (const [name, prop] of Object.entries(properties)) {
    if (!normalizeName(name).includes("coment")) continue;

    const text = getText(prop).trim();
    if (!text) continue;

    const person = PEOPLE.find((p) => normalizeName(name).includes(normalizeName(p)));
    if (person) {
      comments.push({ person, text });
      continue;
    }

    comments.push(...parseNamedComments(text));
  }

  return comments;
}

function getRichText(richText) {
  return (richText || []).map((text) => text.plain_text).join("").trim();
}

function personFromAuthor(name) {
  if (!name) return "Comentário";
  const normalized = normalizeName(name);
  return PEOPLE.find((person) => normalized.includes(normalizeName(person))) || name;
}

async function getUserName(userId) {
  if (!userId) return "";
  if (userNameCache.has(userId)) return userNameCache.get(userId);

  try {
    const user = await notion.users.retrieve({ user_id: userId });
    const name = user.name || "";
    userNameCache.set(userId, name);
    return name;
  } catch {
    userNameCache.set(userId, "");
    return "";
  }
}

async function fetchPageComments(pageId) {
  const comments = [];
  let cursor = undefined;

  do {
    const url = new URL("https://api.notion.com/v1/comments");
    url.searchParams.set("block_id", pageId);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": NOTION_VERSION,
      },
    });

    if (response.status === 403) {
      if (!warnedCommentsPermission) {
        console.warn("Notion integration cannot read comments. Enable Read comments capability to sync page comments.");
        warnedCommentsPermission = true;
      }
      return [];
    }

    if (!response.ok) {
      const message = await response.text();
      console.warn(`Could not fetch comments for page ${pageId}: ${response.status} ${message}`);
      return comments;
    }

    const data = await response.json();
    for (const comment of data.results || []) {
      const text = getRichText(comment.rich_text);
      if (!text) continue;

      const authorName = await getUserName(comment.created_by?.id);
      comments.push({
        person: personFromAuthor(authorName),
        text,
        createdAt: comment.created_time || null,
      });
    }

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return comments;
}

async function mapLimit(items, limit, mapper) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchAllPages() {
  const results = [];
  let cursor = undefined;

  do {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      start_cursor: cursor,
      page_size: 100,
    });

    results.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return results;
}

async function main() {
  console.log("Fetching Notion database...");
  const pages = await fetchAllPages();
  console.log(`Found ${pages.length} entries.`);

  const animes = (await mapLimit(pages, 4, async (page) => {
    const p = page.properties;
    const propertyComments = getComments(p);
    const pageComments = await fetchPageComments(page.id);

    return {
      id: page.id,
      nome: getText(p["Anime 🎬"]),
      quemAssistiu: getMultiSelect(p["Quem já assistiu 👥"]),
      nota: getFormula(p["Nota ⭐"]),
      generos: getMultiSelect(p["🎭 Gênero"]),
      comentarios: getText(p["Comentários 💬"]),
      comments: [...propertyComments, ...pageComments],
      files: getFiles(p["Files & media"]),
      notaRafael: getNumber(p["Nota Rafael ⭐"]),
      notaFernando: getNumber(p["Nota Fernando ⭐"]),
      notaDudu: getNumber(p["Nota Dudu ⭐"]),
      notaHacksuya: getNumber(p["Nota Hacksuya ⭐"]),
      maisDeUmVoto: getFormula(p["2+ Votos ✅"]),
      qtdVotos: getFormula(p["Qtd. Votos 🗳️"]),
      notaSort: getFormula(p["_Nota Sort"]),
      controversia: getFormula(p["🌶️ Controvérsia"]),
    };
  })).filter((a) => a.nome);

  animes.sort((a, b) => (b.notaSort || 0) - (a.notaSort || 0));

  const output = {
    updatedAt: new Date().toISOString(),
    total: animes.length,
    animes,
  };

  const outPath = path.join(__dirname, "../data/animes.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`Saved to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
