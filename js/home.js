import {
  PEOPLE,
  PERSON_LIGHTS,
  animesOf,
  avgNota,
  favoriteGenre,
  formatNota,
  getPersonNota,
  loadData,
  mostControversial,
  topGenres,
} from "./data.js";

const OPENINGS = {
  Rafael: [
    "again - Fullmetal Alchemist: Brotherhood",
    "Unravel - Tokyo Ghoul",
    "Gurenge - Demon Slayer",
  ],
  Fernando: [
    "Departure! - Hunter x Hunter",
    "Haruka Kanata - Naruto",
    "Kaikai Kitan - Jujutsu Kaisen",
  ],
  Dudu: [
    "The Rumbling - Attack on Titan",
    "Blue Bird - Naruto Shippuden",
    "Silhouette - Naruto Shippuden",
  ],
  Hacksuya: [
    "Kyouran Hey Kids!! - Noragami Aragoto",
    "Inferno - Fire Force",
    "Kick Back - Chainsaw Man",
  ],
};

const NEWS_PLACEHOLDER = [
  {
    source: "Anime News API",
    title: "Endpoint de notícias pronto para conectar",
    summary: "Troque o array local por fetch('/api/news') quando a API estiver disponível.",
    url: "#",
  },
  {
    source: "Temporada",
    title: "Feed pode destacar estreias e continuações",
    summary: "Cards pensados para título, resumo curto, fonte e link externo.",
    url: "#",
  },
  {
    source: "Radar RD",
    title: "Curadoria do grupo também cabe aqui",
    summary: "A mesma área pode misturar notícias externas com posts internos do blog.",
    url: "#",
  },
];

function topAnimesByPerson(animes, person) {
  return animesOf(animes, person)
    .filter((anime) => getPersonNota(anime, person) !== null)
    .sort((a, b) => getPersonNota(b, person) - getPersonNota(a, person))
    .slice(0, 3);
}

function sharedTop(animes) {
  return [...animes]
    .filter((anime) => anime.nota !== null && anime.qtdVotos > 1)
    .sort((a, b) => Number(b.nota) - Number(a.nota))
    .slice(0, 5);
}

function shortName(name, size = 34) {
  return name.length > size ? `${name.slice(0, size - 1)}...` : name;
}

function renderHero(data) {
  const date = new Date(data.updatedAt);
  const top = sharedTop(data.animes)[0];
  document.getElementById("home-subtitle").textContent =
    `${data.total} animes catalogados, atualizado em ${date.toLocaleDateString("pt-BR")}. Rankings, opiniões e tretas organizadas em um painel só.`;

  document.getElementById("hero-panel").innerHTML = `
    <span class="eyebrow">Anime em destaque</span>
    <h2>${top ? top.nome : "Base carregada"}</h2>
    <p>${top ? `Nota geral ${formatNota(top.nota)} com ${top.qtdVotos} votos no grupo.` : "Assim que houver dados, o destaque aparece aqui."}</p>
    <div class="mini-metrics">
      <span>${data.total} animes</span>
      <span>${topGenres(data.animes, 1)[0]?.[0] || "Gêneros"}</span>
      <span>${PEOPLE.length} membros</span>
    </div>
  `;
}

function renderMemberCards(animes) {
  document.getElementById("member-grid").innerHTML = PEOPLE.map((person) => {
    const topAnimes = topAnimesByPerson(animes, person);
    const watched = animesOf(animes, person);
    const controversial = mostControversial(animes, person);
    const avg = avgNota(animes, person);
    const color = PERSON_LIGHTS[person];

    return `
      <article class="member-card card" style="--member-color:${color}">
        <header>
          <div class="member-mark">${person[0]}</div>
          <div>
            <h3>${person}</h3>
            <p>${watched.length} animes vistos · média ${avg ? avg.toFixed(2) : "--"}</p>
          </div>
        </header>

        <div class="rank-block">
          <h4>Top animes</h4>
          <ol>
            ${topAnimes.map((anime) => `
              <li>
                <span>${shortName(anime.nome)}</span>
                <strong>${formatNota(getPersonNota(anime, person))}</strong>
              </li>
            `).join("") || "<li><span>Sem notas ainda</span><strong>--</strong></li>"}
          </ol>
        </div>

        <div class="rank-block compact">
          <h4>Top openings</h4>
          <ol>
            ${(OPENINGS[person] || []).map((opening) => `<li><span>${opening}</span></li>`).join("")}
          </ol>
        </div>

        <footer>
          <span>${favoriteGenre(animes, person)}</span>
          <span>${controversial ? `hot take: ${shortName(controversial.nome, 22)}` : "sem controvérsia"}</span>
        </footer>
      </article>
    `;
  }).join("");
}

function renderSpotlight(animes) {
  const topShared = sharedTop(animes);
  const hottest = [...animes]
    .filter((anime) => anime.controversia !== null)
    .sort((a, b) => b.controversia - a.controversia)
    .slice(0, 4);

  document.getElementById("spotlight-card").innerHTML = `
    <span class="eyebrow">Consenso do grupo</span>
    <h2>Top animes com mais de um voto</h2>
    <div class="spotlight-list">
      ${topShared.map((anime, index) => `
        <div>
          <strong>${index + 1}</strong>
          <span>${anime.nome}</span>
          <em>${formatNota(anime.nota)}</em>
        </div>
      `).join("")}
    </div>
  `;

  document.getElementById("pulse-card").innerHTML = `
    <span class="eyebrow">Termômetro</span>
    <h2>Mais controversos</h2>
    <div class="hot-list">
      ${hottest.map((anime) => `
        <a href="acervo.html" title="${anime.nome}">
          <span>${shortName(anime.nome, 28)}</span>
          <strong>${anime.controversia.toFixed(1)}</strong>
        </a>
      `).join("")}
    </div>
  `;
}

function renderNews() {
  document.getElementById("news-grid").innerHTML = NEWS_PLACEHOLDER.map((item) => `
    <article class="news-card">
      <span class="news-source">${item.source}</span>
      <h3>${item.title}</h3>
      <p>${item.summary}</p>
      <a href="${item.url}" ${item.url === "#" ? 'aria-disabled="true"' : ""}>Ler notícia</a>
    </article>
  `).join("");
}

async function init() {
  const data = await loadData();
  renderHero(data);
  renderMemberCards(data.animes);
  renderSpotlight(data.animes);
  renderNews();
}

init().catch((error) => {
  console.error(error);
  document.getElementById("home-subtitle").textContent = "Não foi possível carregar os dados agora.";
});
