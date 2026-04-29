const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const fetch = require("node-fetch");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addMissingOpenings() {
  console.log("Iniciando busca de openings faltantes...");
  const snapshot = await db.collection("animes").get();
  
  let count = 0;
  let totalProcessed = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const malId = data.malId;
    const files = data.files || [];

    // Verifica se já tem opening no campo files
    const hasOpening = files.some(file => /opening|op\b/i.test(file.name || ""));

    if (!hasOpening && malId) {
      totalProcessed++;
      console.log(`[${totalProcessed}] Buscando para: ${data.nome} (MAL ID: ${malId})`);

      try {
        // 1. Busca os temas (openings) do anime
        const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/themes`);
        
        if (res.ok) {
          const payload = await res.json();
          const openings = payload.data?.openings || [];
          
          let videoUrl = null;
          let label = "Opening 1";

          if (openings.length > 0) {
            // Pega a primeira opening da lista e limpa o texto
            const firstOP = openings[0]; 
            const searchQuery = firstOP.replace(/^\d+:\s*/, "").replace(/"/g, "");
            videoUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery + " anime opening")}`;
            console.log(`   ✓ Música encontrada: ${searchQuery}`);
          } else {
            // Fallback: busca pelo nome do anime
            videoUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(data.nome + " opening 1")}`;
            console.log(`   ⚠ Nenhuma música listada. Usando busca por nome.`);
          }

          if (videoUrl) {
            const newFiles = [...files, { name: label, url: videoUrl }];
            await doc.ref.update({ files: newFiles });
            count++;
          }
        } else if (res.status === 429) {
          console.log("   ! Rate limit atingido. Aguardando...");
          await new Promise(r => setTimeout(r, 2000));
          // O anime será ignorado nesta rodada e processado na próxima execução
        }
      } catch (error) {
        console.error(`   ! Erro ao processar ${data.nome}:`, error.message);
      }

      // Intervalo maior para respeitar o rate limit da Jikan
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\nProcesso concluído! ${count} animes foram atualizados.`);
}

addMissingOpenings().catch(console.error);
