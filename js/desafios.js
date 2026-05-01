import {
  PEOPLE,
  PERSON_COLORS,
  PERSON_LIGHTS,
  animesOf,
  avgNota,
  cleanGenreLabel,
  favoriteGenre,
  formatNota,
  getPersonNota,
  loadData,
  missedAnimes,
} from "./data.js?v=ciel-gold-3";
import { escapeHTML, stripEmoji } from "./utils.js";

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
  if (watched.length < 2) return null;

  const targetGenres = new Set(
    (targetAnime.generos || []).map((g) => stripEmoji(g).toLowerCase()),
  );

  let totalWeight = 0;
  let weightedSum = 0;

  watched.forEach((anime) => {
    const animeGenres = new Set(
      (anime.generos || []).map((g) => stripEmoji(g).toLowerCase()),
    );
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
  const groupNota = targetAnime.nota ? Number(targetAnime.nota) : base;
  return Math.min(10, Math.max(0, base * 0.75 + groupNota * 0.25)).toFixed(1);
}

function initPrevisao(data) {
  const personSel = document.getElementById("prev-person");
  const animeSel = document.getElementById("prev-anime");
  const result = document.getElementById("prev-result");

  personSel.innerHTML = PEOPLE.map(
    (p) => `<option value="${p}">${p}</option>`,
  ).join("");

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
    const anime = data.animes.find((a) => a.id === animeSel.value);
    if (!anime) return;

    const predicted = predictScore(data.animes, person, anime);
    const color = PERSON_LIGHTS[person] || "#a78bfa";
    const fav = stripEmoji(favoriteGenre(data.animes, person));
    const genreMatch = (anime.generos || []).some(
      (g) => stripEmoji(g).toLowerCase() === fav.toLowerCase(),
    );
    const watchedCount = animesOf(data.animes, person).length;

    result.innerHTML = `
      <div class="previsao-output">
        <div class="previsao-score-wrap">
          <div class="previsao-score" style="color:${color}">${predicted ?? "?"}</div>
          <div class="previsao-score-label">/10</div>
        </div>
        <div class="previsao-anime-name">${escapeHTML(anime.nome)}</div>
        <div class="previsao-person-label">Previsão para <span style="color:${color};font-weight:900">${person}</span></div>
        <div class="previsao-tags">
          <span class="ptag">Gênero fav: ${fav}</span>
          ${genreMatch ? `<span class="ptag green">✓ Gênero combina!</span>` : ""}
          <span class="ptag">Nota do grupo: ${formatNota(anime.nota)}</span>
          <span class="ptag">${watchedCount} animes analisados</span>
        </div>
        <p class="previsao-note">${predicted ? "Previsão baseada em gêneros, histórico e nota do grupo." : "Poucos dados para uma previsão confiável."}</p>
      </div>
    `;
    result.classList.remove("hidden");
  });
}

// ── ❓ Anime Misterioso ───────────────────────────────────────────────────────

let mystery = null;
let mysteryDone = false;

function loadMystery(animes) {
  const pool = animes.filter((a) => a.nota !== null && a.qtdVotos > 1);
  mystery = pool[Math.floor(Math.random() * pool.length)];
  mysteryDone = false;
  document.getElementById("misterio-guess").value = "";
  const fb = document.getElementById("misterio-feedback");
  fb.classList.add("hidden");
  fb.innerHTML = "";

  const genres = (mystery.generos || [])
    .map((g) => `<span class="mchip">${g}</span>`)
    .join("");

  const watchers = (mystery.quemAssistiu || [])
    .map(
      (p) =>
        `<span class="mperson" style="background:${PERSON_COLORS[p]}22;border:1.5px solid ${PERSON_COLORS[p]}88;color:${PERSON_LIGHTS[p]}" title="${p}">${p[0]}</span>`,
    )
    .join("");

  document.getElementById("misterio-clues").innerHTML = `
    <div class="mystery-board">
      <div class="mystery-stat-grid">
        <div class="mstat">
          <div class="mstat-label">Nota média</div>
          <div class="mstat-value nota-glow">${formatNota(mystery.nota)}</div>
        </div>
        <div class="mstat">
          <div class="mstat-label">Votos</div>
          <div class="mstat-value">${mystery.qtdVotos}</div>
        </div>
        <div class="mstat">
          <div class="mstat-label">Controvérsia</div>
          <div class="mstat-value">${mystery.controversia?.toFixed(1) ?? "0.0"}</div>
        </div>
      </div>
      <div class="mstat-full">
        <div class="mstat-label">Gêneros</div>
        <div class="mystery-chips">${genres}</div>
      </div>
      <div class="mstat-full">
        <div class="mstat-label">Quem assistiu</div>
        <div class="mystery-persons">${watchers}</div>
      </div>
    </div>
  `;
}

function initMisterio(data) {
  loadMystery(data.animes);

  const guess = document.getElementById("misterio-guess");
  const fb = document.getElementById("misterio-feedback");

  function submit() {
    if (mysteryDone || !mystery) return;
    const g = guess.value.trim().toLowerCase();
    const name = mystery.nome.toLowerCase();
    const ok = name.includes(g) || g.includes(name.split(":")[0].trim().toLowerCase().slice(0, 6));
    if (ok) {
      fb.innerHTML = `<div class="fb-win">🎉 Acertou! É <strong>${escapeHTML(mystery.nome)}</strong></div>`;
      mysteryDone = true;
    } else {
      fb.innerHTML = `<div class="fb-miss">❌ Não foi… tente novamente ou revele.</div>`;
    }
    fb.classList.remove("hidden");
  }

  document.getElementById("misterio-submit").addEventListener("click", submit);
  guess.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  document.getElementById("misterio-reveal").addEventListener("click", () => {
    if (!mystery) return;
    fb.innerHTML = `<div class="fb-reveal">👁 Era: <strong>${escapeHTML(mystery.nome)}</strong> — ${formatNota(mystery.nota)}</div>`;
    fb.classList.remove("hidden");
    mysteryDone = true;
  });

  document.getElementById("misterio-next").addEventListener("click", () =>
    loadMystery(data.animes),
  );
}

// ── 📊 Timeline ──────────────────────────────────────────────────────────────

function initTimeline(data) {
  const animes = data.animes;
  const c = document.getElementById("timeline-content");

  const allRated = animes.filter((a) => a.nota !== null && a.qtdVotos > 1);
  const top1 = [...allRated].sort((a, b) => Number(b.nota) - Number(a.nota))[0];
  const hottest = [...allRated].sort((a, b) => (b.controversia || 0) - (a.controversia || 0))[0];
  const mostVoted = [...animes].sort((a, b) => (b.qtdVotos || 0) - (a.qtdVotos || 0))[0];

  const memberCards = PEOPLE.map((person) => {
    const watched = animesOf(animes, person);
    const avg = avgNota(animes, person);
    const fav = stripEmoji(favoriteGenre(animes, person));
    const topAnime = watched
      .filter((a) => a[NOTE_FIELDS[person]] !== null)
      .sort((a, b) => Number(b[NOTE_FIELDS[person]]) - Number(a[NOTE_FIELDS[person]]))[0];
    const color = PERSON_LIGHTS[person];
    const colorBase = PERSON_COLORS[person];
    return `
      <div class="tmember" style="--c:${colorBase};--cl:${color}">
        <div class="tmember-name">${person}</div>
        <div class="tmember-stats">
          <div class="ts"><span>Assistidos</span><strong>${watched.length}</strong></div>
          <div class="ts"><span>Média</span><strong>${avg ? Number(avg).toFixed(1) : "—"}</strong></div>
          <div class="ts"><span>Gênero fav.</span><strong>${fav}</strong></div>
          <div class="ts"><span>Exclusivos</span><strong>${watched.filter((a) => (a.quemAssistiu || []).length === 1).length}</strong></div>
        </div>
        ${topAnime ? `<div class="tmember-top"><span>⭐ Favorito</span><strong>${escapeHTML(topAnime.nome)}</strong><em>${formatNota(topAnime[NOTE_FIELDS[person]])}</em></div>` : ""}
      </div>
    `;
  }).join("");

  c.innerHTML = `
    <div class="tl-section">
      <h3 class="tl-title">🏆 Recordes do Grupo</h3>
      <div class="tl-records">
        <div class="tl-record"><div class="tlr-icon">⭐</div><div><small>Melhor avaliado</small><strong>${escapeHTML(top1?.nome ?? "—")}</strong><span>${formatNota(top1?.nota)}</span></div></div>
        <div class="tl-record"><div class="tlr-icon">🌶️</div><div><small>Mais controverso</small><strong>${escapeHTML(hottest?.nome ?? "—")}</strong><span>${hottest?.controversia?.toFixed(1) ?? "—"} de diferença</span></div></div>
        <div class="tl-record"><div class="tlr-icon">👥</div><div><small>Mais assistido</small><strong>${escapeHTML(mostVoted?.nome ?? "—")}</strong><span>${mostVoted?.qtdVotos ?? 0} votos</span></div></div>
        <div class="tl-record"><div class="tlr-icon">📚</div><div><small>Total no acervo</small><strong>${animes.length} animes</strong><span>${allRated.length} com nota</span></div></div>
      </div>
    </div>
    <div class="tl-section">
      <h3 class="tl-title">👤 Perfil dos Membros</h3>
      <div class="tmembers-grid">${memberCards}</div>
    </div>
  `;
}

// ── ⚔️ Batalha ───────────────────────────────────────────────────────────────

const VOTES_KEY = "desafios-batalha-v2";
function getVotes() { try { return JSON.parse(localStorage.getItem(VOTES_KEY)) || {}; } catch { return {}; } }
function saveVotes(v) { try { localStorage.setItem(VOTES_KEY, JSON.stringify(v)); } catch {} }

let pair = null;

function loadBatalha(animes) {
  const pool = animes.filter((a) => a.nota !== null);
  const a = pool[Math.floor(Math.random() * pool.length)];
  let b;
  do { b = pool[Math.floor(Math.random() * pool.length)]; } while (b.id === a.id);
  pair = [a, b];
  renderBatalha(animes);
}

function renderBatalha(animes) {
  if (!pair) return;
  const [a, b] = pair;
  const votes = getVotes();
  const vA = votes[a.id] || 0;
  const vB = votes[b.id] || 0;
  const total = vA + vB;
  const pA = total ? Math.round((vA / total) * 100) : 50;
  const pB = total ? 100 - pA : 50;

  const side = (anime, pct, v, pos) => `
    <div class="bside bside-${pos}" data-id="${anime.id}">
      <div class="bside-top">
        <div class="bside-nota">${formatNota(anime.nota)}</div>
        <div class="bside-genres">${(anime.generos || []).slice(0, 2).map((g) => `<span>${stripEmoji(g)}</span>`).join("")}</div>
      </div>
      <div class="bside-name">${escapeHTML(anime.nome)}</div>
      <div class="bside-watchers">${(anime.quemAssistiu || []).map((p) => `<span class="bwatcher" style="background:${PERSON_COLORS[p]}22;border:1px solid ${PERSON_COLORS[p]}66;color:${PERSON_LIGHTS[p]}">${p[0]}</span>`).join("")}</div>
      <button class="desafio-btn batalha-btn" data-id="${anime.id}">Votar</button>
      <div class="bbar-wrap">
        <div class="bbar" style="width:${pct}%"></div>
      </div>
      <div class="bpct">${pct}% · ${v} voto${v !== 1 ? "s" : ""}</div>
    </div>
  `;

  document.getElementById("batalha-arena").innerHTML = `
    <div class="batalha-grid">
      ${side(a, pA, vA, "left")}
      <div class="batalha-vs"><span>VS</span></div>
      ${side(b, pB, vB, "right")}
    </div>
  `;

  document.querySelectorAll(".batalha-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = getVotes();
      v[btn.dataset.id] = (v[btn.dataset.id] || 0) + 1;
      saveVotes(v);
      renderBatalha(animes);
    });
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const data = await loadData();
  initPrevisao(data);
  initMisterio(data);
  initTimeline(data);
  initBatalha(data);
  document.getElementById("batalha-next").addEventListener("click", () =>
    loadBatalha(data.animes),
  );
}

init().catch(console.error);
