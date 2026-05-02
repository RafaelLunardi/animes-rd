/**
 * mark-pt-dubs.js
 * Verifica quais animes do acervo têm dublagem em PT-BR via Jikan API
 * e atualiza o campo ptDub no Firebase Firestore.
 *
 * Como rodar:
 *   node scripts/mark-pt-dubs.js
 *
 * Requer: npm install firebase-admin node-fetch
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore }        = require("firebase-admin/firestore");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
const fs    = require("fs");
const path  = require("path");

// ── Config ────────────────────────────────────────────────────────────────────

// Coloca aqui o caminho pro teu service account JSON (baixa no Firebase Console
// → Configurações do projeto → Contas de serviço → Gerar nova chave privada)
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "service-account.json");

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`
❌  Arquivo service-account.json não encontrado em scripts/

Como obter:
  Firebase Console → Configurações do Projeto → Contas de serviço
  → "Gerar nova chave privada" → salvar como scripts/service-account.json
`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Jikan helpers ─────────────────────────────────────────────────────────────

const DELAY_MS   = 700; // respeita rate limit da Jikan (~3 req/s free tier)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Plataformas que tipicamente oferecem PT-BR dub
const PT_PLATFORMS = [
  "crunchyroll", "netflix", "amazon", "prime video",
  "funimation", "globoplay", "telecine", "claro",
];

async function checkPtDub(malId, animeName) {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
    if (!res.ok) return false;
    const data = await res.json();
    const anime = data.data;

    // 1) Verifica se tem título em PT
    const hasPtTitle = (anime.titles || []).some(
      (t) => t.type === "Portuguese" || (t.title && /[áéíóúàèìòùâêîôûãõç]/i.test(t.title))
    );

    // 2) Verifica streaming em plataformas que oferecem PT dub no BR
    const streaming = (anime.streaming || []).map((s) => s.name?.toLowerCase() || "");
    const onPtPlatform = streaming.some((s) => PT_PLATFORMS.some((p) => s.includes(p)));

    // 3) Verifica producers/licensors brasileiros
    const licensors = [
      ...(anime.licensors || []),
      ...(anime.producers || []),
    ].map((l) => l.name?.toLowerCase() || "");
    const brLicensor = licensors.some((l) =>
      l.includes("globo") || l.includes("bandai") || l.includes("funimation")
    );

    const result = hasPtTitle || onPtPlatform || brLicensor;
    if (result) {
      const reason = hasPtTitle ? "título PT" : onPtPlatform ? "streaming PT" : "licensor BR";
      console.log(`  ✓ ${animeName} → ${reason}`);
    }
    return result;
  } catch (e) {
    console.warn(`  ⚠ Erro ao buscar ${animeName}: ${e.message}`);
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🎙️  Iniciando verificação de dublagens PT-BR...\n");

  // Carrega animes do JSON local (mais rápido do que buscar do Firestore)
  const jsonPath = path.join(__dirname, "../data/animes.json");
  const { animes } = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  const withMalId = animes.filter((a) => a.malId);
  console.log(`📦 Total: ${animes.length} animes | Com MAL ID: ${withMalId.length}\n`);

  let marked = 0;
  let unchanged = 0;
  let errors = 0;

  for (let i = 0; i < withMalId.length; i++) {
    const anime = withMalId[i];
    process.stdout.write(`[${i + 1}/${withMalId.length}] ${anime.nome} ... `);

    const hasDub = await checkPtDub(anime.malId, anime.nome);

    if (hasDub !== !!anime.ptDub) {
      try {
        await db.collection("animes").doc(anime.id).update({
          ptDub: hasDub,
          updatedAt: new Date(),
        });
        marked++;
        if (hasDub) console.log("🇧🇷 MARCADO");
        else console.log("↩ removido");
      } catch (e) {
        errors++;
        console.log(`❌ Erro Firebase: ${e.message}`);
      }
    } else {
      unchanged++;
      if (!hasDub) process.stdout.write("—\n");
    }

    await sleep(DELAY_MS);
  }

  console.log(`
✅  Concluído!
   Marcados/atualizados: ${marked}
   Sem alteração:        ${unchanged}
   Erros:               ${errors}
  `);
}

main().catch(console.error);
