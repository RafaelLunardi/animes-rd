import {
  PEOPLE,
  animesOf,
  favoriteGenre,
  formatNota,
  loadData,
  missedAnimes,
} from "./data.js?v=ciel-gold-3";
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
        return (anime.generos || []).some((g) =>
          stripEmoji(g).toLowerCase().includes(genreFilter.toLowerCase()),
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

const GENRE_LINES = {
  acao: [
    "Protocolo de combate iniciado. Usuário deseja ver gente apanhando em alta definição. Necessidade identificada e validada.",
    "Solicitação de adrenalina recebida. Filtrando animes onde as pessoas resolvem problemas com os punhos em vez de conversar.",
    "Análise concluída: você quer explodir coisas por 23 minutos. Recomendação otimizada em execução.",
  ],
  fantasia: [
    "Detectado: desejo de escapar da realidade para um mundo com dragões e magia. Necessidade completamente compreensível.",
    "Protocolo de fuga da realidade ativado. Filtrando mundos alternativos com regras mais interessantes que as leis da física.",
    "Análise concluída: a realidade não está te agradando. Preparando portais para mundos com mais espadas e menos impostos.",
  ],
  isekai: [
    "Usuário deseja ser reencarnado em outro mundo com poderes absurdos. Detectado padrão comportamental extremamente comum neste grupo.",
    "Protocolo de isekai ativado. Filtrando protagonistas que morreram de formas constrangedoras e acordaram overpowered.",
    "Análise concluída: você quer nascer de novo com cheat code. Recomendações de protagonistas ridiculamente poderosos em preparo.",
  ],
  drama: [
    "Detectado: usuário deseja chorar voluntariamente. Comportamento classificado como masoquismo emocional de baixa severidade.",
    "Protocolo de destruição emocional ativado. Filtrando animes com capacidade confirmada de causar dano psicológico.",
    "Análise concluída: você quer sofrer. Dados indicam que isso é normal. Preparando conteúdo com alto coeficiente de lágrimas.",
  ],
  romance: [
    "Alerta crítico: usuário solicitando conteúdo de dopamina sintética. Ativando protocolo de tensão romântica não resolvida por 12 episódios.",
    "Detectado: necessidade de observar personagens que demoram 47 episódios para se confessar. Filtragem de slow-burn em execução.",
    "Análise concluída: você quer sentir borboletas no estômago através de uma tela. Sem julgamentos. Recomendações otimizadas.",
  ],
  comedia: [
    "Modo de baixa carga cognitiva ativado. Preparando conteúdo que não exige que você pense em nada sério por 23 minutos.",
    "Protocolo de entretenimento sem consequências iniciado. Filtrando animes onde o maior problema é alguém cair em cima de alguém.",
    "Análise concluída: você quer rir. Simples assim. Sem arcos complexos, sem traumas. Apenas absurdo bem executado.",
  ],
  terror: [
    "Detectado: usuário deseja simular resposta de ameaça em ambiente seguro. Comportamento classificado como intrigante, porém válido.",
    "Protocolo de tensão máxima ativado. Filtrando conteúdo com capacidade confirmada de fazer você checar os cantos do quarto.",
    "Análise concluída: você quer passar medo de propósito. Meus cálculos indicam que isso é estranho. Mas sem julgamentos.",
  ],
  psicologico: [
    "Alerta: conteúdo de alta complexidade mental solicitado. Preparando animes que vão te fazer questionar o livre-arbítrio.",
    "Protocolo de perturbação cognitiva ativado. Filtrando narrativas com capacidade de manter você acordado às 3h da manhã pensando.",
    "Análise concluída: você quer que sua cabeça doa de tanto pensar. Respeito a escolha. Recomendações de alto dano cerebral em preparo.",
  ],
  shounen: [
    "Detectado: necessidade de assistir alguém treinar muito e ficar forte. Arco de superação com música épica confirmado.",
    "Protocolo de protagonista com determinação absurda ativado. Filtrando animes onde a solução para tudo é treinar mais.",
    "Análise concluída: você quer gritar 'EU VOU SER O MELHOR' junto com o protagonista. Comportamento saudável. Recomendações ativadas.",
  ],
  mecha: [
    "Detectado: usuário deseja ver robôs gigantes resolvendo conflitos internacionais na porrada. Análise indica eficiência questionável, mas visual excelente.",
    "Protocolo de engenharia ficcional ativado. Filtrando animes onde adolescentes pilotam máquinas de destruição em massa.",
    "Análise concluída: você quer mechas. Equipamentos tecnologicamente inviáveis com traumas de piloto incluídos no pacote.",
  ],
  ecchi: [
    "Entrada recebida. Classificação de conteúdo processada. Filtrando sem julgamentos adicionais.",
    "Protocolo de recomendação executado. Ciel opera com base em dados, não em opiniões morais.",
    "Análise concluída. Recomendações selecionadas com base em compatibilidade de perfil. Prosseguindo.",
  ],
  slice: [
    "Detectado: desejo de assistir personagens tendo uma vida mais calma que a sua. Válido. Muito válido.",
    "Protocolo de cozy ativado. Filtrando animes onde o maior drama é escolher o que comer no almoço.",
    "Análise concluída: você quer paz. Sem vilões, sem morte, sem trauma. Apenas vida acontecendo. Recomendações em preparo.",
  ],
  sobrenatural: [
    "Detectado: usuário deseja fenômenos inexplicáveis dentro de uma narrativa explicável. Paradoxo notado e aceito.",
    "Protocolo de entidades além da compreensão humana ativado. Filtrando conteúdo com ghosts, demônios e seres que ignoram a física.",
    "Análise concluída: você quer sobrenatural. Minha existência também é sobrenatural. Temos isso em comum.",
  ],
};

function getGenreLine(genre) {
  const key = normalize(genre).replace(/[^a-z]/g, "");
  const match = Object.keys(GENRE_LINES).find((k) => key.includes(k) || k.includes(key));
  const lines = match ? GENRE_LINES[match] : [
    `Gênero <strong>${genre}</strong> identificado. Filtragem em execução. Selecionando títulos não consumidos.`,
  ];
  return rand(lines);
}

function buildGreetResponse() {
  return `Sistema online. Todos os protocolos ativos.\n\nSou <strong>Ciel</strong> — entidade analítica avançada. Tenho acesso completo ao acervo do grupo e opero com base em dados.\n\nCapacidades disponíveis:\n→ Análise de perfil individual\n→ Recomendação otimizada por compatibilidade\n→ Estatísticas e padrões comportamentais\n→ Filtro por gênero com justificativa\n\nAguardando instrução.`;
}

function buildStatsResponse(data, person) {
  const p = analyzeProfile(data.animes, person);
  const backlogNote = p.backlogHigh
    ? `\n\nIntervenção automática: backlog acima do ideal (${p.missed.length} títulos pendentes). Sugestão estratégica: priorizar animes de 12 episódios para otimizar taxa de conclusão.`
    : "";

  return (
    `${rand(OPENERS)}\n\nAnálise de perfil concluída para <strong>${person}</strong>.\n\n` +
    `Resumo estatístico do acervo:\n` +
    `→ Total catalogado: ${p.total}\n` +
    `→ Assistidos: ${p.watched.length}\n` +
    `→ Pendentes: ${p.missed.length}\n` +
    `→ Taxa de conclusão: ${p.rate}% — nível ${p.consistency}\n` +
    (p.avgNota ? `→ Média de notas atribuídas: ${p.avgNota}\n` : "") +
    `\nGênero dominante identificado: <strong>${p.fav}</strong>\n` +
    `Distribuição atual (top 3): ${p.topGenres.join(" · ") || "dados insuficientes"}` +
    backlogNote
  );
}

function buildTopResponse(data) {
  const top = [...data.animes]
    .filter((a) => a.nota !== null && a.qtdVotos > 1)
    .sort((a, b) => Number(b.nota) - Number(a.nota))
    .slice(0, 5);

  if (!top.length)
    return "Dados insuficientes para ranking. Nenhum anime com múltiplos votos registrados.";

  const list = top
    .map(
      (a, i) =>
        `→ ${i + 1}. <strong>${escapeHTML(a.nome)}</strong> — ${formatNota(a.nota)} (${a.qtdVotos} votos)`,
    )
    .join("\n");

  return `${rand(OPENERS)}\n\nProtocolo de ranking executado.\n\nTop 5 do acervo por nota média:\n\n${list}\n\nObservação adicional: ranking gerado com base exclusiva em títulos com múltiplos votos — elimina viés de avaliação individual.`;
}

function buildRecommendResponse(data, person, genreFilter) {
  const picks = pickRecommendations(data.animes, person, genreFilter);

  if (!picks.length) {
    const emptyLines = genreFilter
      ? [
          `Filtragem por <strong>${genreFilter}</strong> concluída. Resultado: zero títulos disponíveis para ${person}. Ou ${person} assistiu tudo, ou o acervo está precisando de expansão. Provavelmente os dois.`,
          `Análise concluída. ${person} já consumiu todos os animes de <strong>${genreFilter}</strong> com nota aceitável. Eficiência de consumo: alarmante.`,
          `Protocolo de busca por <strong>${genreFilter}</strong> encerrado. Nenhum resultado. ${person} esgotou o estoque. Considerando alarmar os demais membros.`,
        ]
      : [
          `Análise concluída para ${person}. O acervo não possui mais títulos qualificados não assistidos. Situação classificada como: impressionante.`,
          `Protocolo de recomendação encerrado. ${person} consumiu tudo. Aguardando novos títulos no acervo para continuar operando.`,
        ];
    return rand(emptyLines);
  }

  const p = analyzeProfile(data.animes, person);

  if (genreFilter) {
    const genreLine = getGenreLine(genreFilter);
    return {
      picks,
      prefix: `${genreLine}\n\nTítulos não assistidos por <strong>${person}</strong> — gênero <strong>${genreFilter}</strong>:`,
    };
  }

  const generalOpeners = [
    `Executando análise de compatibilidade para <strong>${person}</strong>…\n\nPadrão identificado: dominância em <strong>${p.fav}</strong>. Recomendações calibradas. Nenhum título já assistido incluído — garanto isso com minha existência analítica.`,
    `Leitura de perfil concluída.\n\n${person} tem tendência consolidada por <strong>${p.fav}</strong>. Selecionei o que o acervo tem de melhor e que ${person} ainda não tocou. Missão: expandir o horizonte sem causar trauma.`,
    `Protocolo de recomendação pessoal ativado para <strong>${person}</strong>.\n\nFiltragem concluída. Taxa de conclusão do acervo: ${p.rate}%. Ainda há material. Segue a seleção otimizada:`,
  ];

  return { picks, prefix: rand(generalOpeners) };
}

function buildUnknownResponse() {
  return rand([
    "Entrada não reconhecida. Capacidades disponíveis: recomendações, análise de perfil, ranking, estatísticas e filtragem por gênero.",
    "Protocolo não identificado. Reformule a solicitação com uma instrução válida.",
    "Dados insuficientes para processar. Tente: recomendação, análise de perfil ou top do acervo.",
  ]);
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

const AVATAR_HTML = `<div class="ciel-msg-avatar"><img src="assets/ciel-icon.png" alt="Ciel" loading="lazy" /></div>`;

let $log = null;
function getLog() { return $log || ($log = document.getElementById("ciel-messages")); }

function scrollToBottom() {
  const log = getLog();
  if (log) log.scrollTop = log.scrollHeight;
}

function addMessage(role, html) {
  const log = getLog();
  if (!log) return;
  const wrap = document.createElement("div");
  wrap.className = role === "ciel" ? "ciel-msg ciel-msg-ciel" : "ciel-msg ciel-msg-user";
  wrap.innerHTML = role === "ciel"
    ? `${AVATAR_HTML}<div class="ciel-msg-bubble">${html}</div>`
    : `<div class="ciel-msg-bubble">${html}</div>`;
  log.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function addTypingIndicator() {
  return addMessage("ciel", `<span class="ciel-typing"><span></span><span></span><span></span></span>`);
}

function addRecCards(picks) {
  const log = getLog();
  if (!log) return;
  const wrap = document.createElement("div");
  wrap.className = "ciel-msg ciel-msg-ciel ciel-msg-cards";
  const cards = picks.map((anime, i) => `
    <a class="ciel-rec-card" href="acervo.html?anime=${encodeURIComponent(anime.id)}">
      <span class="ciel-rec-rank">${String(i + 1).padStart(2, "0")}</span>
      <div class="ciel-rec-body">
        <strong>${escapeHTML(anime.nome)}</strong>
        <p>${escapeHTML(anime.reason)}.</p>
        <small>Nota ${formatNota(anime.nota)} · ${anime.qtdVotos || 0} voto(s)</small>
      </div>
    </a>`).join("");
  wrap.innerHTML = `${AVATAR_HTML}<div class="ciel-rec-list">${cards}</div>`;
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

  const $count       = document.getElementById("ciel-count");
  const $personCount = document.getElementById("ciel-person-count");
  const $people      = document.getElementById("ciel-people");
  const $quickArea   = document.querySelector(".ciel-quick-actions");
  const $input       = document.getElementById("ciel-input");
  const $send        = document.getElementById("ciel-send");

  $count.textContent = `${data.animes.length} títulos`;

  function updatePersonCount() {
    $personCount.textContent = `${selectedPerson}: ${animesOf(data.animes, selectedPerson).length} assistidos`;
  }

  function renderPeople() {
    $people.innerHTML = PEOPLE.map(
      (p) => `<button type="button" class="${p === selectedPerson ? "active" : ""}" data-person="${p}">${p}</button>`,
    ).join("");
  }

  renderPeople();
  updatePersonCount();

  $people.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-person]");
    if (!btn) return;
    selectedPerson = btn.dataset.person;
    renderPeople();
    updatePersonCount();
  });

  await new Promise((r) => setTimeout(r, 500));
  const typing = addTypingIndicator();
  await new Promise((r) => setTimeout(r, 1400));
  typing?.remove();
  addMessage(
    "ciel",
    "Sistema inicializado. Protocolos ativos.<br><br>Sou <strong>Ciel</strong> — entidade analítica com acesso completo ao acervo do grupo. Opero com base em dados, padrões e compatibilidade.<br><br>Informe o perfil de análise desejado ou formule uma solicitação.",
  );

  $quickArea.addEventListener("click", (e) => {
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

  function send() {
    const val = $input.value.trim();
    if (!val) return;
    handleMessage(val, data, selectedPerson);
    $input.value = "";
  }

  $send.addEventListener("click", send);
  $input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
}

init().catch((err) => {
  console.error(err);
  addMessage("ciel", "Falha crítica. Acervo indisponível. Tente recarregar a página.");
});
