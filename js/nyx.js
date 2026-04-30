import {
  PEOPLE,
  animesOf,
  favoriteGenre,
  formatNota,
  loadData,
  missedAnimes,
} from "./data.js?v=ciel-1";
import { escapeHTML, stripEmoji } from "./utils.js";

// ── Recommendation engine ────────────────────────────────────────────────────

function scoreAnime(anime, genre) {
  const genreBonus = (anime.generos || []).some(
    (g) => stripEmoji(g).toLowerCase() === stripEmoji(genre || "").toLowerCase(),
  )
    ? 0.45
    : 0;
  const voteBonus = Math.min(Number(anime.qtdVotos || 0), 4) * 0.08;
  return Number(anime.nota || 0) + genreBonus + voteBonus;
}

function pickRecommendations(animes, person, genreFilter) {
  const favorite = favoriteGenre(animes, person);
  const genre = genreFilter || favorite;
  return missedAnimes(animes, person)
    .filter((anime) => {
      if (Number(anime.nota) < 7.5) return false;
      if (genreFilter) {
        return (anime.generos || []).some(
          (g) => stripEmoji(g).toLowerCase().includes(genreFilter.toLowerCase()),
        );
      }
      return true;
    })
    .sort((a, b) => scoreAnime(b, genre) - scoreAnime(a, genre))
    .slice(0, 6)
    .map((anime) => {
      const watchers = (anime.quemAssistiu || []).filter((n) => n !== person);
      const genreMatch = (anime.generos || []).some(
        (g) => stripEmoji(g).toLowerCase() === stripEmoji(favorite).toLowerCase(),
      );
      let reason;
      if (genreMatch && watchers.length) {
        reason = `alinhamento com ${stripEmoji(favorite)} confirmado. ${watchers.join(" e ")} validaram com nota alta`;
      } else if (genreMatch) {
        reason = `compatibilidade direta com padrão de gênero dominante: ${stripEmoji(favorite)}`;
      } else if (watchers.length) {
        reason = `${watchers.join(" e ")} consumiram e a nota geral está acima da média`;
      } else {
        reason = `alta nota geral no acervo — sem viés de popularidade`;
      }
      return { ...anime, reason };
    });
}

// ── Profile analysis ─────────────────────────────────────────────────────────

function analyzeProfile(animes, person) {
  const watched = animesOf(animes, person);
  const missed = missedAnimes(animes, person);
  const total = animes.length;
  const fav = stripEmoji(favoriteGenre(animes, person));
  const rate = total > 0 ? Math.round((watched.length / total) * 100) : 0;
  const avgNota =
    watched.length > 0
      ? (
          watched.reduce((sum, a) => {
            const n = Number(a[`nota${person}`] ?? a.nota);
            return sum + (isNaN(n) ? 0 : n);
          }, 0) / watched.length
        ).toFixed(2)
      : null;

  const genreCount = {};
  watched.forEach((a) => {
    (a.generos || []).forEach((g) => {
      const clean = stripEmoji(g);
      genreCount[clean] = (genreCount[clean] || 0) + 1;
    });
  });
  const topGenres = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g, n]) => `${g} (${n})`);

  const backlogHigh = missed.length > watched.length;
  const consistency = rate >= 60 ? "alto" : rate >= 35 ? "moderado" : "baixo";

  return { watched, missed, total, fav, rate, avgNota, topGenres, backlogHigh, consistency };
}

// ── Intent parser ────────────────────────────────────────────────────────────

const GENRE_KEYWORDS = [
  "ação", "acao", "fantasia", "drama", "comedia", "comédia", "romance",
  "shounen", "isekai", "terror", "mecha", "slice of life", "ecchi",
  "esportes", "sci-fi", "sobrenatural", "psicológico", "psicologico",
  "ação", "psicologic",
];

function normalize(str) {
  return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function parseIntent(text, person) {
  const t = normalize(text);
  const foundPerson = PEOPLE.find((p) => t.includes(p.toLowerCase()));
  const foundGenre = GENRE_KEYWORDS.find((g) => t.includes(normalize(g)));

  if (/^(oi|ola|ei|bom|boa|alo|hey|hello|salve|tudo|como vai)/.test(t))
    return { type: "greet" };

  if (/quant|total|acervo|quanto|estatistica|base de dados|resumo|perfil|analise|anali/.test(t))
    return { type: "stats", person: foundPerson || person };

  if (/top|melhor|mais visto|nota alta|ranking|melhores|mais bem avaliado/.test(t))
    return { type: "top" };

  if (foundGenre)
    return { type: "recommend", genre: foundGenre, person: foundPerson || person };

  if (/recomend|indica|sugere|assistir|ver|proximo|proxim|o que|dica/.test(t))
    return { type: "recommend", person: foundPerson || person };

  if (foundPerson)
    return { type: "stats", person: foundPerson };

  return { type: "unknown" };
}

// ── Ciel response builder ────────────────────────────────────────────────────

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const OPENERS = [
  "Processando solicitação…",
  "Executando análise…",
  "Dados coletados.",
  "Leitura de perfil concluída.",
  "Iniciando protocolo de análise…",
];

const GENRE_CONTEXT = {
  acao: "Alta intensidade e progressão constante. Combate estratégico e ritmo acelerado.",
  fantasia: "Ambiente expansivo com regras próprias. Forte presença de progressão de poder.",
  isekai: "Forte presença de progressão de poder. Protagonismo dominante em mundo alternativo.",
  drama: "Alta carga emocional e narrativa orientada a personagens.",
  romance: "Desenvolvimento gradual de relacionamento. Foco em dinâmica emocional.",
  comedia: "Baixa carga cognitiva, alto fator de entretenimento. Ideal para consumo leve.",
  terror: "Alta tensão e imprevisibilidade. Indicado para consumo imersivo.",
  psicologico: "Narrativa focada em tensão mental e decisões críticas. Alto nível de complexidade.",
  shounen: "Progressão de poder clara. Forte foco em superação e combate.",
  mecha: "Combinação de tecnologia e combate estratégico em larga escala.",
};

function getGenreContext(genre) {
  const key = normalize(genre).replace(/[^a-z]/g, "");
  const match = Object.keys(GENRE_CONTEXT).find((k) => key.includes(k) || k.includes(key));
  return match ? GENRE_CONTEXT[match] : "Gênero identificado. Filtragem em execução.";
}

function buildGreetResponse() {
  return `Sistema online. Todos os protocolos ativos.\n\nSou <strong>Ciel</strong> — entidade analítica avançada. Tenho acesso completo ao acervo do grupo e opero com base em dados.\n\nCapacidades disponíveis:\n→ Análise de perfil individual\n→ Recomendação otimizada por compatibilidade\n→ Estatísticas e padrões comportamentais\n→ Filtro por gênero com justificativa\n\nAguardando instrução.`;
}

function buildStatsResponse(data, person) {
  const p = analyzeProfile(data.animes, person);
  const backlogNote = p.backlogHigh
    ? `\n\nIntervenção automática: backlog acima do ideal (${p.missed.length} títulos pendentes). Sugestão estratégica: priorizar animes de 12 episódios para otimizar taxa de conclusão.`
    : "";

  return `${rand(OPENERS)}\n\nAnálise de perfil concluída para <strong>${person}</strong>.\n\n` +
    `Resumo estatístico do acervo:\n` +
    `→ Total catalogado: ${p.total}\n` +
    `→ Assistidos: ${p.watched.length}\n` +
    `→ Pendentes: ${p.missed.length}\n` +
    `→ Taxa de conclusão: ${p.rate}% — nível ${p.consistency}\n` +
    (p.avgNota ? `→ Média de notas atribuídas: ${p.avgNota}\n` : "") +
    `\nGênero dominante identificado: <strong>${p.fav}</strong>\n` +
    `Distribuição atual (top 3): ${p.topGenres.join(" · ") || "dados insuficientes"}` +
    backlogNote;
}

function buildTopResponse(data) {
  const top = [...data.animes]
    .filter((a) => a.nota !== null && a.qtdVotos > 1)
    .sort((a, b) => Number(b.nota) - Number(a.nota))
    .slice(0, 5);

  if (!top.length)
    return "Dados insuficientes para ranking. Nenhum anime com múltiplos votos registrados.";

  const list = top
    .map((a, i) => `→ ${i + 1}. <strong>${escapeHTML(a.nome)}</strong> — ${formatNota(a.nota)} (${a.qtdVotos} votos)`)
    .join("\n");

  return `${rand(OPENERS)}\n\nProtocolo de ranking executado.\n\nTop 5 do acervo por nota média:\n\n${list}\n\nObservação adicional: ranking gerado com base exclusiva em títulos com múltiplos votos — elimina viés de avaliação individual.`;
}

function buildRecommendResponse(data, person, genreFilter) {
  const picks = pickRecommendations(data.animes, person, genreFilter);
  if (!picks.length) {
    return `Análise concluída para <strong>${person}</strong>.\n\nResultado: nenhum título compatível disponível no acervo. Todos os animes qualificados já foram consumidos.\n\nSugestão: ampliar critério de busca ou aguardar novos títulos no acervo.`;
  }
  const p = analyzeProfile(data.animes, person);
  const genreCtx = genreFilter ? `\n\nContexto do gênero selecionado — ${genreFilter}: ${getGenreContext(genreFilter)}` : "";
  const patternNote = `\n\nPadrão identificado: preferência consolidada por <strong>${p.fav}</strong>. Recomendações calibradas para compatibilidade máxima.`;

  return { picks, prefix: `${rand(OPENERS)}${genreCtx}${patternNote}\n\nRecomendação otimizada com base no perfil de <strong>${person}</strong>:` };
}

function buildUnknownResponse() {
  return rand([
    "Entrada não reconhecida. Capacidades disponíveis: recomendações, análise de perfil, ranking, estatísticas e filtragem por gênero.",
    "Protocolo não identificado. Reformule a solicitação com uma instrução válida.",
    "Dados insuficientes para processar. Tente: recomendação, análise de perfil ou top do acervo.",
  ]);
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

function scrollToBottom() {
  const log = document.getElementById("ciel-messages");
  if (log) log.scrollTop = log.scrollHeight;
}

function addMessage(role, html) {
  const log = document.getElementById("ciel-messages");
  if (!log) return;
  const wrap = document.createElement("div");
  wrap.className = role === "ciel" ? "ciel-msg ciel-msg-ciel" : "ciel-msg ciel-msg-user";
  if (role === "ciel") {
    wrap.innerHTML = `
      <div class="ciel-msg-avatar"><img src="assets/ciel-icon.png" alt="Ciel" /></div>
      <div class="ciel-msg-bubble">${html}</div>
    `;
  } else {
    wrap.innerHTML = `<div class="ciel-msg-bubble">${html}</div>`;
  }
  log.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function addTypingIndicator() {
  return addMessage(
    "ciel",
    `<span class="ciel-typing"><span></span><span></span><span></span></span>`,
  );
}

function addRecCards(picks) {
  const log = document.getElementById("ciel-messages");
  if (!log) return;
  const wrap = document.createElement("div");
  wrap.className = "ciel-msg ciel-msg-ciel ciel-msg-cards";
  const cards = picks
    .map(
      (anime, i) => `
    <a class="ciel-rec-card" href="acervo.html?anime=${encodeURIComponent(anime.id)}">
      <span class="ciel-rec-rank">${String(i + 1).padStart(2, "0")}</span>
      <div class="ciel-rec-body">
        <strong>${escapeHTML(anime.nome)}</strong>
        <p>${escapeHTML(anime.reason)}.</p>
        <small>Nota ${formatNota(anime.nota)} · ${anime.qtdVotos || 0} voto(s)</small>
      </div>
    </a>`,
    )
    .join("");
  wrap.innerHTML = `
    <div class="ciel-msg-avatar"><img src="assets/ciel-icon.png" alt="Ciel" /></div>
    <div class="ciel-rec-list">${cards}</div>
  `;
  log.appendChild(wrap);
  scrollToBottom();
}

// ── Main chat handler ────────────────────────────────────────────────────────

async function handleMessage(text, data, person) {
  if (!text.trim()) return;

  addMessage("user", escapeHTML(text));

  const typing = addTypingIndicator();
  await new Promise((r) => setTimeout(r, 900 + Math.random() * 700));
  typing?.remove();

  const intent = parseIntent(text, person);

  if (intent.type === "greet") {
    addMessage("ciel", buildGreetResponse().replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "stats") {
    addMessage("ciel", buildStatsResponse(data, intent.person || person).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "top") {
    addMessage("ciel", buildTopResponse(data).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "recommend") {
    const result = buildRecommendResponse(data, intent.person || person, intent.genre);
    if (typeof result === "string") {
      addMessage("ciel", result.replace(/\n/g, "<br>"));
    } else {
      addMessage("ciel", result.prefix.replace(/\n/g, "<br>"));
      addRecCards(result.picks.slice(0, 4));
    }
    return;
  }

  addMessage("ciel", buildUnknownResponse());
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const data = await loadData();
  let selectedPerson = PEOPLE[0];

  document.getElementById("ciel-count").textContent = `${data.animes.length} títulos`;

  function updatePersonCount() {
    const n = animesOf(data.animes, selectedPerson).length;
    document.getElementById("ciel-person-count").textContent =
      `${selectedPerson}: ${n} assistidos`;
  }

  function renderPeople() {
    const el = document.getElementById("ciel-people");
    el.innerHTML = PEOPLE.map(
      (p) =>
        `<button type="button" class="${p === selectedPerson ? "active" : ""}" data-person="${p}">${p}</button>`,
    ).join("");
  }

  renderPeople();
  updatePersonCount();

  document.getElementById("ciel-people").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-person]");
    if (!btn) return;
    selectedPerson = btn.dataset.person;
    renderPeople();
    updatePersonCount();
  });

  // Boot message
  await new Promise((r) => setTimeout(r, 500));
  const typing = addTypingIndicator();
  await new Promise((r) => setTimeout(r, 1400));
  typing?.remove();
  addMessage(
    "ciel",
    "Sistema inicializado. Protocolos ativos.<br><br>Sou <strong>Ciel</strong> — entidade analítica com acesso completo ao acervo do grupo. Opero com base em dados, padrões e compatibilidade.<br><br>Informe o perfil de análise desejado ou formule uma solicitação.",
  );

  // Quick actions
  document.querySelector(".ciel-quick-actions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-quick]");
    if (!btn) return;
    const actions = {
      recommend: `Recomenda um anime para ${selectedPerson}`,
      top: "Top 5 do acervo",
      genre: `Recomenda por gênero favorito de ${selectedPerson}`,
      stats: `Análise de perfil de ${selectedPerson}`,
    };
    handleMessage(actions[btn.dataset.quick], data, selectedPerson);
  });

  // Input
  const input = document.getElementById("ciel-input");
  document.getElementById("ciel-send").addEventListener("click", () => {
    const val = input.value.trim();
    if (!val) return;
    handleMessage(val, data, selectedPerson);
    input.value = "";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const val = input.value.trim();
    if (!val) return;
    handleMessage(val, data, selectedPerson);
    input.value = "";
  });
}

init().catch((err) => {
  console.error(err);
  addMessage("ciel", "Falha crítica. Acervo indisponível. Tente recarregar a página.");
});
