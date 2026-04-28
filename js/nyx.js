import {
  PEOPLE,
  animesOf,
  favoriteGenre,
  formatNota,
  loadData,
  missedAnimes,
} from "./data.js?v=dudu-yellow-1";

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function cleanGenre(genre) {
  return String(genre || "")
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, "")
    .trim();
}

function scoreAnime(anime, favorite) {
  const genreBonus = (anime.generos || []).some(
    (genre) => cleanGenre(genre) === cleanGenre(favorite)
  )
    ? 0.35
    : 0;
  const voteBonus = Math.min(Number(anime.qtdVotos || 0), 4) * 0.08;
  return Number(anime.nota || 0) + genreBonus + voteBonus;
}

function recommendationReason(anime, person, favorite) {
  const watchers = (anime.quemAssistiu || []).filter((name) => name !== person);
  const genreMatch = (anime.generos || []).some(
    (genre) => cleanGenre(genre) === cleanGenre(favorite)
  );
  if (genreMatch) return `combina com seu gosto por ${cleanGenre(favorite)}`;
  if (watchers.length) return `${watchers.join(", ")} ja viu e a nota geral esta forte`;
  return "tem uma nota geral alta no acervo";
}

function pickRecommendations(animes, person) {
  const favorite = favoriteGenre(animes, person);
  return missedAnimes(animes, person)
    .filter((anime) => Number(anime.nota) >= 8)
    .sort((a, b) => scoreAnime(b, favorite) - scoreAnime(a, favorite))
    .slice(0, 6)
    .map((anime) => ({
      ...anime,
      reason: recommendationReason(anime, person, favorite),
    }));
}

function pickSingleRecommendation(animes, person) {
  const list = pickRecommendations(animes, person);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function renderPeople(current) {
  const tabs = document.getElementById("nyx-people");
  tabs.innerHTML = PEOPLE.map(
    (person) => `
    <button type="button" class="${person === current ? "active" : ""}" data-person="${person}">
      ${person}
    </button>
  `
  ).join("");
}

function renderRecommendations(data, person) {
  const watched = animesOf(data.animes, person).length;
  const recommendations = pickRecommendations(data.animes, person);
  const output = document.getElementById("nyx-results");

  document.getElementById("nyx-summary").textContent = `${person} ja assistiu ${watched} animes. A Nyx separou dicas que ainda nao estao na lista dessa pessoa.`;

  output.innerHTML =
    recommendations
      .map(
        (anime, index) => `
    <a class="nyx-rec-card" href="acervo.html?anime=${encodeURIComponent(anime.id)}">
      <span class="nyx-rank">${String(index + 1).padStart(2, "0")}</span>
      <div>
        <h3>${escapeHTML(anime.nome)}</h3>
        <p>${escapeHTML(anime.reason)}.</p>
        <small>Nota geral ${formatNota(anime.nota)} · ${anime.qtdVotos || 0} voto(s)</small>
      </div>
    </a>
  `
      )
      .join("") || `<p class="nyx-empty">A Nyx nao encontrou recomendacoes novas agora.</p>`;
}

function pushChatMessage(text) {
  const log = document.getElementById("nyx-chat-log");
  if (!log) return;
  const msg = document.createElement("div");
  msg.className = "nyx-chat-msg";
  msg.textContent = text;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

async function init() {
  const data = await loadData();
  let selectedPerson = PEOPLE[0];

  renderPeople(selectedPerson);
  renderRecommendations(data, selectedPerson);

  document.getElementById("nyx-people").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-person]");
    if (!button) return;
    selectedPerson = button.dataset.person;
    renderPeople(selectedPerson);
    renderRecommendations(data, selectedPerson);
  });

  document.getElementById("nyx-recommend-btn")?.addEventListener("click", () => {
    const anime = pickSingleRecommendation(data.animes, selectedPerson);
    pushChatMessage(anime ? anime.nome : "Sem recomendacoes agora");
  });
}

init().catch((error) => {
  console.error(error);
  document.getElementById("nyx-summary").textContent =
    "A Nyx nao conseguiu carregar o acervo agora.";
});
