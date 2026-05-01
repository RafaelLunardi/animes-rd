import {
  PEOPLE,
  PERSON_COLORS,
  PERSON_LIGHTS,
  animesOf,
  avgNota,
  favoriteGenre,
  formatNota,
  loadData,
  missedAnimes,
  stripEmoji,
} from "./data.js?v=ciel-gold-3";
import { escapeHTML } from "./utils.js";

const NOTE_FIELDS = {
  Rafael: "notaRafael",
  Fernando: "notaFernando",
  Dudu: "notaDudu",
  Hacksuya: "notaHacksuya",
  Zana: "notaZana",
};

// ── Tabs ─────────────────────────────────────────────────────────────────────

document.getElementById("desafios-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".desafio-tab");
  if (!btn) return;
  document.querySelectorAll(".desafio-tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".desafio-panel").forEach((p) => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
});

// ── 🔮 Previsão de Nota ──────────────────────────────────────────────────────

function predictScore(animes, person, targetAnime) {
  const watched = animesOf(animes, person).filter(
    (a) => a[NOTE_FIELDS[person]] !== null && a[NOTE_FIELDS[person]] !== undefined,
  );
  if (watched.length < 3) return null;

  const targetGenres = new Set((targetAnime.generos || []).map((g) => stripEmoji(g).toLowerCase()));

  let totalWeight = 0;
  let weightedSum = 0;

  watched.forEach((anime) => {
    const animeGenres = new Set((anime.generos || []).map((g) => stripEmoji(g).toLowerCase()));
    const overlap = [...targetGenres].filter((g) => animeGenres.has(g)).length;
    const union = new Set([...targetGenres, ...animeGenres]).size;
    const similarity = union > 0 ? overlap / union : 0;
    const weight = 0.2 + similarity * 2;
    const score = Number(anime[NOTE_FIELDS[person]]);
    totalWeight += weight;
    weightedSum += score * weight;
  });

  const base = totalWeight > 0 ? weightedSum / totalWeight : null;
  if (!base) return null;

  // Corrige levemente com a nota geral do grupo
  const groupNota = targetAnime.nota ? Number(targetAnime.nota) : base;
  const predicted = base * 0.75 + groupNota * 0.25;
  return Math.min(10, Math.max(0, predicted)).toFixed(1);
}

function initPrevisao(data) {
  const personSel = document.getElementById("prev-person");
  const animeSel = document.getElementById("prev-anime");
  const result = document.getElementById("prev-result");

  personSel.innerHTML = PEOPLE.map((p) => `<option value="${p}">${p}</option>`).join("");

  function updateAnimes() {
    const person = personSel.value;
    const missed = missedAnimes(data.animes, person)
      .filter((a) => a.nota !== null)
      .sort((a, b) => a.nome.localeCompare(b.nome));
    animeSel.innerHTML = missed
      .map((a) => `<option value="${a.id}">${escapeHTML(a.nome)}</option>`)
      .join("");
    result.classList.add("hidden");
  }

  personSel.addEventListener("change", updateAnimes);
  updateAnimes();

  document.getElementById("prev-btn").addEventListener("click", () => {
    const person = personSel.value;
    const animeId = animeSel.value;
    const anime = data.animes.find((a) => a.id === animeId);
    if (!anime) return;

    const predicted = predictScore(data.animes, person, anime);
    const color = PERSON_LIGHTS[person] || "#a78bfa";
    const favGenre = stripEmoji(favoriteGenre(data.animes, person));
    const genreMatch = (anime.generos || []).some(
      (g) => stripEmoji(g).toLowerCase() === favGenre.toLowerCase(),
    );

    result.innerHTML = `
      <div class="previsao-output">
        <div class="previsao-score" style="color:${color}">
          ${predicted ?? "—"}
        </div>
        <div class="previsao-label">Previsão para <strong style="color:${color}">${person}</strong></div>
        <div class="previsao-anime">${escapeHTML(anime.nome)}</div>
        <div class="previsao-reasons">
          <span class="previsao-tag">Gênero favorito: ${favGenre}</span>
          ${genreMatch ? `<span class="previsao-tag match">✓ Gênero combina</span>` : ""}
          <span class="previsao-tag">Nota do grupo: ${formatNota(anime.nota)}</span>
          <span class="previsao-tag">${(anime.quemAssistiu || []).length} voto(s)</span>
        </div>
        ${predicted ? `<p class="previsao-disclaimer">Estimativa baseada em ${animesOf(data.animes, person).length} animes assistidos por ${person}.</p>` : `<p class="previsao-disclaimer">${person} assistiu poucos animes para fazer uma previsão confiável.</p>`}
      </div>
    `;
    result.classList.remove("hidden");
  });
}

// ── ❓ Anime Misterioso ───────────────────────────────────────────────────────

let mysteryCurrent = null;
let mysteryRevealed = false;

function loadMystery(animes) {
  const pool = animes.filter((a) => a.nota !== null && a.qtdVotos > 1);
  mysteryCurrent = pool[Math.floor(Math.random() * pool.length)];
  mysteryRevealed = false;

  const guess = document.getElementById("misterio-guess");
  const feedback = document.getElementById("misterio-feedback");
  guess.value = "";
  feedback.classList.add("hidden");

  const clues = document.getElementById("misterio-clues");
  const genres = (mysteryCurrent.generos || [])
    .map((g) => `<span class="mystery-chip">${g}</span>`)
    .join("");
  const watchers = (mysteryCurrent.quemAssistiu || [])
    .map(
      (p) => `<span class="mystery-person" style="background:${PERSON_COLORS[p]}22;border-color:${PERSON_COLORS[p]}88;color:${PERSON_LIGHTS[p]}">${p[0]}</span>`,
    )
    .join("");

  clues.innerHTML = `
    <div class="mystery-clues-grid">
      <div class="mystery-clue-block">
        <small>Gêneros</small>
        <div class="mystery-chips">${genres}</div>
      </div>
      <div class="mystery-clue-block">
        <small>Nota média</small>
        <strong class="mystery-nota">${formatNota(mysteryCurrent.nota)}</strong>
      </div>
      <div class="mystery-clue-block">
        <small>Quem assistiu</small>
        <div class="mystery-persons">${watchers}</div>
      </div>
      <div class="mystery-clue-block">
        <small>Controvérsia</small>
        <strong class="mystery-nota">${mysteryCurrent.controversia?.toFixed(1) ?? "—"}</strong>
      </div>
    </div>
  `;
}

function initMisterio(data) {
  loadMystery(data.animes);

  document.getElementById("misterio-submit").addEventListener("click", () => {
    if (mysteryRevealed || !mysteryCurrent) return;
    const guess = document.getElementById("misterio-guess").value.trim().toLowerCase();
    const name = mysteryCurrent.nome.toLowerCase();
    const feedback = document.getElementById("misterio-feedback");

    const correct =
      name.includes(guess) || guess.includes(name.split(":")[0].trim().toLowerCase());

    if (correct) {
      feedback.innerHTML = `<span class="feedback-win">✓ Acertou! É <strong>${escapeHTML(mysteryCurrent.nome)}</strong></span>`;
    } else {
      feedback.innerHTML = `<span class="feedback-miss">✗ Não foi… tente novamente ou revele.</span>`;
    }
    feedback.classList.remove("hidden");
    if (correct) mysteryRevealed = true;
  });

  document.getElementById("misterio-guess").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("misterio-submit").click();
  });

  document.getElementById("misterio-reveal").addEventListener("click", () => {
    if (!mysteryCurrent) return;
    const feedback = document.getElementById("misterio-feedback");
    feedback.innerHTML = `<span class="feedback-reveal">Era: <strong>${escapeHTML(mysteryCurrent.nome)}</strong> — Nota: ${formatNota(mysteryCurrent.nota)}</span>`;
    feedback.classList.remove("hidden");
    mysteryRevealed = true;
  });

  document.getElementById("misterio-next").addEventListener("click", () => loadMystery(data.animes));
}

// ── 📅 Linha do Tempo ────────────────────────────────────────────────────────

function initTimeline(data) {
  const animes = data.animes;
  const container = document.getElementById("timeline-content");

  // Stats por membro
  const stats = PEOPLE.map((person) => {
    const watched = animesOf(animes, person);
    const avg = avgNota(animes, person);
    const fav = stripEmoji(favoriteGenre(animes, person));
    const top = watched
      .filter((a) => a[NOTE_FIELDS[person]] !== null)
      .sort((a, b) => Number(b[NOTE_FIELDS[person]]) - Number(a[NOTE_FIELDS[person]]))[0];
    const exclusive = watched.filter((a) => (a.quemAssistiu || []).length === 1);
    const color = PERSON_LIGHTS[person];
    return { person, watched, avg, fav, top, exclusive, color };
  });

  // Milestones do grupo
  const allRated = animes.filter((a) => a.nota !== null && a.qtdVotos > 1);
  const topGroup = [...allRated].sort((a, b) => Number(b.nota) - Number(a.nota))[0];
  const mostControversial = [...allRated].sort(
    (a, b) => (b.controversia || 0) - (a.controversia || 0),
  )[0];
  const mostWatched = [...animes].sort(
    (a, b) => (b.qtdVotos || 0) - (a.qtdVotos || 0),
  )[0];
  const mostGenres = [...animes].sort(
    (a, b) => (b.generos || []).length - (a.generos || []).length,
  )[0];

  container.innerHTML = `
    <div class="timeline-milestones">
      <h3 class="timeline-section-title">🏆 Recordes do Grupo</h3>
      <div class="timeline-grid">
        <div class="timeline-milestone">
          <span class="milestone-icon">⭐</span>
          <div>
            <small>Melhor avaliado</small>
            <strong>${escapeHTML(topGroup?.nome ?? "—")}</strong>
            <span>${formatNota(topGroup?.nota)}</span>
          </div>
        </div>
        <div class="timeline-milestone">
          <span class="milestone-icon">🌶️</span>
          <div>
            <small>Mais controverso</small>
            <strong>${escapeHTML(mostControversial?.nome ?? "—")}</strong>
            <span>Controvérsia: ${mostControversial?.controversia?.toFixed(1) ?? "—"}</span>
          </div>
        </div>
        <div class="timeline-milestone">
          <span class="milestone-icon">👥</span>
          <div>
            <small>Mais assistido</small>
            <strong>${escapeHTML(mostWatched?.nome ?? "—")}</strong>
            <span>${mostWatched?.qtdVotos ?? 0} votos</span>
          </div>
        </div>
        <div class="timeline-milestone">
          <span class="milestone-icon">🎭</span>
          <div>
            <small>Mais gêneros</small>
            <strong>${escapeHTML(mostGenres?.nome ?? "—")}</strong>
            <span>${(mostGenres?.generos || []).length} gêneros</span>
          </div>
        </div>
      </div>
    </div>

    <div class="timeline-members">
      <h3 class="timeline-section-title">👤 Perfil dos Membros</h3>
      <div class="timeline-members-grid">
        ${stats.map((s) => `
          <div class="timeline-member-card" style="border-color:${s.color}33">
            <div class="timeline-member-name" style="color:${s.color}">${s.person}</div>
            <div class="timeline-member-stats">
              <div class="tms-item"><small>Assistidos</small><strong>${s.watched.length}</strong></div>
              <div class="tms-item"><small>Média</small><strong>${s.avg ? Number(s.avg).toFixed(2) : "—"}</strong></div>
              <div class="tms-item"><small>Gênero fav.</small><strong>${s.fav}</strong></div>
              <div class="tms-item"><small>Exclusivos</small><strong>${s.exclusive.length}</strong></div>
            </div>
            ${s.top ? `<div class="timeline-top-anime"><small>Favorito</small><span>${escapeHTML(s.top.nome)}</span><span style="color:${s.color}">${formatNota(s.top[NOTE_FIELDS[s.person]])}</span></div>` : ""}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ── ⚔️ Batalha ───────────────────────────────────────────────────────────────

const VOTES_KEY = "desafios-batalha-votes";

function getVotes() {
  try { return JSON.parse(localStorage.getItem(VOTES_KEY)) || {}; } catch { return {}; }
}

function saveVotes(votes) {
  try { localStorage.setItem(VOTES_KEY, JSON.stringify(votes)); } catch {}
}

let batalhaPair = null;

function loadBatalha(animes) {
  const pool = animes.filter((a) => a.nota !== null && a.qtdVotos > 0);
  const a = pool[Math.floor(Math.random() * pool.length)];
  let b;
  do { b = pool[Math.floor(Math.random() * pool.length)]; } while (b.id === a.id);
  batalhaPair = [a, b];
  renderBatalha(animes);
}

function renderBatalha(animes) {
  if (!batalhaPair) return;
  const [a, b] = batalhaPair;
  const votes = getVotes();
  const vA = votes[a.id] || 0;
  const vB = votes[b.id] || 0;
  const total = vA + vB;
  const pA = total ? Math.round((vA / total) * 100) : 50;
  const pB = total ? Math.round((vB / total) * 100) : 50;

  const card = (anime, pct, voteCount) => `
    <div class="batalha-side" data-id="${anime.id}">
      <div class="batalha-info">
        <h3>${escapeHTML(anime.nome)}</h3>
        <div class="batalha-meta">
          <span>⭐ ${formatNota(anime.nota)}</span>
          <span>${(anime.generos || []).slice(0, 2).map((g) => stripEmoji(g)).join(" · ")}</span>
        </div>
      </div>
      <button class="desafio-btn batalha-vote-btn" data-id="${anime.id}">Votar</button>
      <div class="batalha-bar-wrap">
        <div class="batalha-bar" style="width:${pct}%"></div>
      </div>
      <span class="batalha-pct">${pct}% · ${voteCount} voto${voteCount !== 1 ? "s" : ""}</span>
    </div>
  `;

  document.getElementById("batalha-arena").innerHTML = `
    <div class="batalha-cards">
      ${card(a, pA, vA)}
      <div class="batalha-vs">VS</div>
      ${card(b, pB, vB)}
    </div>
  `;

  document.querySelectorAll(".batalha-vote-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const v = getVotes();
      v[id] = (v[id] || 0) + 1;
      saveVotes(v);
      renderBatalha(animes);
    });
  });
}

function initBatalha(data) {
  loadBatalha(data.animes);
  document.getElementById("batalha-next").addEventListener("click", () => loadBatalha(data.animes));
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const data = await loadData();
  initPrevisao(data);
  initMisterio(data);
  initTimeline(data);
  initBatalha(data);
}

init().catch(console.error);
