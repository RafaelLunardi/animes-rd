/**
 * batalha.js — Sistema completo de Batalha de Animes
 * Backend: Firebase Firestore (validações via transactions)
 * 5 rodadas fixas, apenas animes assistidos por ambos, 1 voto por usuário/rodada
 */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";
import { PEOPLE, PERSON_COLORS, PERSON_LIGHTS, animesOf, formatNota } from "./data.js?v=ciel-gold-3";
import { escapeHTML } from "./utils.js";

const app = getApps()[0] || initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

const ROUNDS_TOTAL = 5;
const SESSIONS_COL = "battle_sessions";
const VOTES_COL    = "battle_votes";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStoredName(uid) {
  return localStorage.getItem(`user-${uid}-personName`);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRounds(animes, name1, name2) {
  const watched1 = new Set(animesOf(animes, name1).map((a) => a.id));
  const watched2 = new Set(animesOf(animes, name2).map((a) => a.id));
  const common = animes.filter((a) => watched1.has(a.id) && watched2.has(a.id) && a.nota !== null);
  if (common.length < ROUNDS_TOTAL * 2) return null;
  const pool = shuffle(common).slice(0, ROUNDS_TOTAL * 2);
  const rounds = [];
  for (let i = 0; i < ROUNDS_TOTAL; i++) {
    rounds.push({
      animeA: { id: pool[i * 2].id, nome: pool[i * 2].nome, nota: pool[i * 2].nota },
      animeB: { id: pool[i * 2 + 1].id, nome: pool[i * 2 + 1].nome, nota: pool[i * 2 + 1].nota },
    });
  }
  return rounds;
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Cria uma nova sessão de batalha.
 * Verifica se já existe sessão ativa entre os dois jogadores.
 */
async function createBattleSession(animes, currentUser, opponentName) {
  const p1id   = currentUser.uid;
  const p1name = currentUser.personName;
  const p2user = PEOPLE.find((p) => p === opponentName);
  if (!p2user) throw new Error("Oponente inválido");
  if (p1name === opponentName) throw new Error("Você não pode batalhar contra si mesmo");

  // Verifica sessão ativa existente
  const existing = await getDocs(
    query(
      collection(db, SESSIONS_COL),
      where("player1_name", "in", [p1name, opponentName]),
      where("status", "in", ["waiting", "active"]),
      limit(5),
    ),
  );
  for (const d of existing.docs) {
    const s = d.data();
    const names = [s.player1_name, s.player2_name];
    if (names.includes(p1name) && names.includes(opponentName)) {
      return d.id; // retorna sessão existente
    }
  }

  const rounds = buildRounds(animes, p1name, opponentName);
  if (!rounds) throw new Error(`Animes em comum insuficientes entre ${p1name} e ${opponentName} (mínimo ${ROUNDS_TOTAL * 2})`);

  const ref = await addDoc(collection(db, SESSIONS_COL), {
    player1_id:   p1id,
    player1_name: p1name,
    player2_id:   null,
    player2_name: opponentName,
    status:        "waiting",
    current_round: 1,
    rounds,
    round_results: [],
    scores:        { [p1name]: 0, [opponentName]: 0 },
    winner:        null,
    created_at:    serverTimestamp(),
    updated_at:    serverTimestamp(),
  });
  return ref.id;
}

/**
 * Jogador 2 entra na sessão existente.
 */
async function joinBattleSession(sessionId, currentUser) {
  const ref  = doc(db, SESSIONS_COL, sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Sessão não encontrada");
  const s = snap.data();
  if (s.status !== "waiting") throw new Error("Batalha já iniciada ou finalizada");
  if (s.player2_name !== currentUser.personName) throw new Error("Você não é o oponente desta batalha");
  await updateDoc(ref, {
    player2_id: currentUser.uid,
    status:     "active",
    updated_at: serverTimestamp(),
  });
}

/**
 * Submete voto com validações via transaction.
 */
async function submitVote(sessionId, round, currentUser, chosenAnimeId) {
  const uid  = currentUser.uid;
  const name = currentUser.personName;

  // Verifica voto duplicado
  const dupCheck = await getDocs(
    query(
      collection(db, VOTES_COL),
      where("session_id", "==", sessionId),
      where("round", "==", round),
      where("user_id", "==", uid),
      limit(1),
    ),
  );
  if (!dupCheck.empty) throw new Error("Você já votou nesta rodada");

  const sessionRef = doc(db, SESSIONS_COL, sessionId);

  return runTransaction(db, async (tx) => {
    const snap = tx.get(sessionRef);
    const s    = (await snap).data();

    if (!s) throw new Error("Sessão não encontrada");
    if (s.status !== "active") throw new Error("Batalha não está ativa");
    if (s.current_round !== round) throw new Error("Rodada inválida");

    const roundData = s.rounds[round - 1];
    if (![roundData.animeA.id, roundData.animeB.id].includes(chosenAnimeId)) {
      throw new Error("Anime inválido para esta rodada");
    }

    // Registra voto
    const voteRef = doc(collection(db, VOTES_COL));
    tx.set(voteRef, {
      session_id:      sessionId,
      round,
      user_id:         uid,
      player_name:     name,
      chosen_anime_id: chosenAnimeId,
      created_at:      serverTimestamp(),
    });

    return { voted: true };
  });
}

/**
 * Verifica se ambos votaram e resolve a rodada.
 * Chamado após qualquer voto.
 */
async function tryResolveRound(sessionId, round) {
  const votes = await getDocs(
    query(
      collection(db, VOTES_COL),
      where("session_id", "==", sessionId),
      where("round", "==", round),
    ),
  );
  if (votes.size < 2) return false; // ainda esperando

  const sessionRef = doc(db, SESSIONS_COL, sessionId);
  const snap = await getDoc(sessionRef);
  const s = snap.data();
  if (!s || s.current_round !== round) return false;

  const roundData = s.rounds[round - 1];
  const voteMap = {};
  votes.forEach((v) => {
    const d = v.data();
    voteMap[d.player_name] = d.chosen_anime_id;
  });

  const votesA = Object.values(voteMap).filter((v) => v === roundData.animeA.id).length;
  const votesB = Object.values(voteMap).filter((v) => v === roundData.animeB.id).length;

  // Vencedor da rodada = anime mais votado
  let roundWinner = null;
  let roundWinnerAnime = null;
  if (votesA > votesB) {
    roundWinnerAnime = roundData.animeA.nome;
    // Quem votou no anime A ganha ponto
    const winner = Object.entries(voteMap).find(([, v]) => v === roundData.animeA.id)?.[0];
    roundWinner = winner;
  } else if (votesB > votesA) {
    roundWinnerAnime = roundData.animeB.nome;
    const winner = Object.entries(voteMap).find(([, v]) => v === roundData.animeB.id)?.[0];
    roundWinner = winner;
  }

  const result = {
    round,
    votes: voteMap,
    winner: roundWinner,
    winnerAnime: roundWinnerAnime,
    votesA,
    votesB,
  };

  const newScores = { ...s.scores };
  if (roundWinner) newScores[roundWinner] = (newScores[roundWinner] || 0) + 1;

  const newResults = [...(s.round_results || []), result];
  const isLast = round === ROUNDS_TOTAL;

  const update = {
    round_results: newResults,
    scores:        newScores,
    updated_at:    serverTimestamp(),
  };

  if (isLast) {
    const [n1, n2] = [s.player1_name, s.player2_name];
    let winner = null;
    if (newScores[n1] > newScores[n2]) winner = n1;
    else if (newScores[n2] > newScores[n1]) winner = n2;
    else winner = "tie";
    update.status = "finished";
    update.winner = winner;
  } else {
    update.current_round = round + 1;
  }

  await updateDoc(sessionRef, update);
  return true;
}

/**
 * Cancela / exclui uma sessão waiting.
 */
async function cancelSession(sessionId) {
  await deleteDoc(doc(db, SESSIONS_COL, sessionId));
}

// ── UI ────────────────────────────────────────────────────────────────────────

let currentSession = null;
let unsubSession = null;
let currentUser = null;
let allAnimes = [];

export function initBatalha(container, animes) {
  allAnimes = animes;

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      renderLogin(container);
      return;
    }
    currentUser = { uid: user.uid, personName: getStoredName(user.uid) };
    if (!currentUser.personName) {
      container.innerHTML = `<p style="color:var(--muted);text-align:center;padding:32px">Associe seu nome de membro para jogar. <a href="#" onclick="showUserSelectionModal();return false" style="color:#818cf8">Clique aqui</a></p>`;
      return;
    }
    renderLobby(container);
  });
}

function renderLogin(container) {
  container.innerHTML = `<p style="color:var(--muted);text-align:center;padding:32px">Faça login para jogar a Batalha.</p>`;
}

function renderLobby(container) {
  if (unsubSession) { unsubSession(); unsubSession = null; }

  // Verifica se tem sessão ativa
  const q = query(
    collection(db, SESSIONS_COL),
    where("status", "in", ["waiting", "active"]),
    limit(10),
  );

  const unsub = onSnapshot(q, (snap) => {
    const sessions = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    const mySession = sessions.find((s) =>
      s.player1_name === currentUser.personName || s.player2_name === currentUser.personName,
    );

    if (mySession) {
      renderBattle(container, mySession);
    } else {
      renderCreateForm(container);
    }
  });
  unsubSession = unsub;
}

function renderCreateForm(container) {
  const opponents = PEOPLE.filter((p) => p !== currentUser.personName);
  container.innerHTML = `
    <div class="batalha-lobby">
      <div class="batalha-lobby-title">
        <span class="batalha-lobby-icon">⚔️</span>
        <div>
          <h3>Iniciar uma batalha</h3>
          <p>Escolha seu oponente. Serão 5 rodadas com animes que vocês dois assistiram.</p>
        </div>
      </div>
      <div class="batalha-create-form">
        <select id="batalha-opponent" class="batalha-select">
          <option value="">Selecionar oponente...</option>
          ${opponents.map((p) => `<option value="${p}" style="color:${PERSON_LIGHTS[p]}">${p}</option>`).join("")}
        </select>
        <button class="batalha-action-btn" id="batalha-create-btn">Criar batalha →</button>
      </div>
      <div id="batalha-lobby-error" class="batalha-error hidden"></div>
      <div class="batalha-lobby-info">
        <span>👤 Jogando como <strong style="color:${PERSON_LIGHTS[currentUser.personName]}">${currentUser.personName}</strong></span>
      </div>
    </div>
  `;

  document.getElementById("batalha-create-btn").addEventListener("click", async () => {
    const opp = document.getElementById("batalha-opponent").value;
    const errEl = document.getElementById("batalha-lobby-error");
    errEl.classList.add("hidden");
    if (!opp) { errEl.textContent = "Selecione um oponente."; errEl.classList.remove("hidden"); return; }
    try {
      const btn = document.getElementById("batalha-create-btn");
      btn.disabled = true;
      btn.textContent = "Criando...";
      const sessionId = await createBattleSession(allAnimes, currentUser, opp);
      // Listener vai capturar e renderizar automaticamente
    } catch (e) {
      const errEl2 = document.getElementById("batalha-lobby-error");
      if (errEl2) { errEl2.textContent = e.message; errEl2.classList.remove("hidden"); }
      const btn = document.getElementById("batalha-create-btn");
      if (btn) { btn.disabled = false; btn.textContent = "Criar batalha →"; }
    }
  });
}

async function renderBattle(container, session) {
  // Se status waiting e eu sou player2, entro automaticamente
  if (session.status === "waiting" && session.player2_name === currentUser.personName && !session.player2_id) {
    try { await joinBattleSession(session.id, currentUser); } catch {}
    return;
  }

  if (session.status === "waiting") {
    renderWaiting(container, session);
    return;
  }

  if (session.status === "finished") {
    renderFinished(container, session);
    return;
  }

  // Active
  const round = session.current_round;
  const roundData = session.rounds[round - 1];
  const myName = currentUser.personName;

  // Verifica se já votei
  const myVotes = await getDocs(
    query(
      collection(db, VOTES_COL),
      where("session_id", "==", session.id),
      where("round", "==", round),
      where("user_id", "==", currentUser.uid),
      limit(1),
    ),
  );
  const alreadyVoted = !myVotes.empty;
  const myChoiceId = alreadyVoted ? myVotes.docs[0].data().chosen_anime_id : null;

  // Conta votos desta rodada
  const allVotes = await getDocs(
    query(
      collection(db, VOTES_COL),
      where("session_id", "==", session.id),
      where("round", "==", round),
    ),
  );
  const votedNames = allVotes.docs.map((v) => v.data().player_name);

  const colorP1 = PERSON_LIGHTS[session.player1_name] || "#a78bfa";
  const colorP2 = PERSON_LIGHTS[session.player2_name] || "#f9a8d4";
  const colorMe = PERSON_LIGHTS[myName] || "#a78bfa";

  container.innerHTML = `
    <div class="batalha-active">
      <div class="batalha-header">
        <div class="batalha-players">
          <span class="bplayer" style="color:${colorP1}">${session.player1_name}</span>
          <span class="bscore" style="color:${colorP1}">${session.scores[session.player1_name] || 0}</span>
          <span class="bvs">vs</span>
          <span class="bscore" style="color:${colorP2}">${session.scores[session.player2_name] || 0}</span>
          <span class="bplayer" style="color:${colorP2}">${session.player2_name}</span>
        </div>
        <div class="batalha-round-badge">Rodada ${round} / ${ROUNDS_TOTAL}</div>
      </div>

      <div class="batalha-round-progress">
        ${Array.from({ length: ROUNDS_TOTAL }, (_, i) => {
          const r = session.round_results?.[i];
          const state = i < round - 1 ? "done" : i === round - 1 ? "active" : "pending";
          return `<div class="bpip bpip-${state}" title="Rodada ${i + 1}">${r?.winner ? (r.winner === myName ? "✓" : "✗") : ""}</div>`;
        }).join("")}
      </div>

      <div class="batalha-arena-v2">
        ${[
          { anime: roundData.animeA, side: "A" },
          { anime: roundData.animeB, side: "B" },
        ].map(({ anime, side }) => {
          const isChosen = myChoiceId === anime.id;
          return `
            <div class="bcard ${isChosen ? "bcard-chosen" : ""}">
              <div class="bcard-nota">${formatNota(anime.nota)}</div>
              <div class="bcard-name">${escapeHTML(anime.nome)}</div>
              <button class="bvote-btn ${alreadyVoted ? "disabled" : ""}"
                data-id="${anime.id}"
                ${alreadyVoted ? "disabled" : ""}
              >${isChosen ? "✓ Seu voto" : "Votar"}</button>
            </div>
          `;
        }).join(`<div class="bvs-divider">VS</div>`)}
      </div>

      <div class="batalha-status">
        ${alreadyVoted
          ? `<span class="bstatus-waiting">⏳ Aguardando ${votedNames.length === 1 ? "o outro jogador" : "..."}</span>`
          : `<span class="bstatus-act" style="color:${colorMe}">Sua vez de votar, ${myName}!</span>`
        }
        <div class="bvoters">
          ${[session.player1_name, session.player2_name].map((p) => `
            <span class="bvoter ${votedNames.includes(p) ? "voted" : ""}" style="border-color:${PERSON_COLORS[p]}66;color:${votedNames.includes(p) ? PERSON_LIGHTS[p] : "var(--muted)"}">
              ${p[0]} ${votedNames.includes(p) ? "✓" : ""}
            </span>
          `).join("")}
        </div>
      </div>

      <div class="batalha-last-rounds">
        ${(session.round_results || []).slice(-3).reverse().map((r) => `
          <div class="blast-round">
            <span>Rodada ${r.round}</span>
            <span>${escapeHTML(r.winnerAnime || "Empate")}</span>
            <span style="color:${r.winner ? PERSON_LIGHTS[r.winner] : "var(--muted)"}">
              ${r.winner ? `+1 ${r.winner}` : "empate"}
            </span>
          </div>
        `).join("")}
      </div>

      <button class="batalha-cancel-btn" id="batalha-cancel">Abandonar batalha</button>
    </div>
  `;

  // Vote buttons
  document.querySelectorAll(".bvote-btn:not(.disabled)").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await submitVote(session.id, round, currentUser, btn.dataset.id);
        await tryResolveRound(session.id, round);
      } catch (e) {
        btn.disabled = false;
        alert(e.message);
      }
    });
  });

  document.getElementById("batalha-cancel")?.addEventListener("click", async () => {
    if (!confirm("Abandonar a batalha?")) return;
    await cancelSession(session.id);
  });
}

function renderWaiting(container, session) {
  const colorOpp = PERSON_LIGHTS[session.player2_name] || "#f9a8d4";
  container.innerHTML = `
    <div class="batalha-waiting">
      <div class="batalha-waiting-icon">⏳</div>
      <h3>Aguardando <span style="color:${colorOpp}">${session.player2_name}</span> entrar</h3>
      <p>Quando ${session.player2_name} abrir a página de Desafios, a batalha começa automaticamente.</p>
      <div class="batalha-session-id">ID: <code>${session.id.slice(0, 8)}</code></div>
      <button class="batalha-cancel-btn" id="batalha-cancel">Cancelar</button>
    </div>
  `;
  document.getElementById("batalha-cancel")?.addEventListener("click", async () => {
    await cancelSession(session.id);
  });
}

function renderFinished(container, session) {
  const isWinner = session.winner === currentUser.personName;
  const isTie    = session.winner === "tie";
  const color1   = PERSON_LIGHTS[session.player1_name] || "#a78bfa";
  const color2   = PERSON_LIGHTS[session.player2_name] || "#f9a8d4";

  container.innerHTML = `
    <div class="batalha-finished">
      <div class="batalha-finished-banner">
        <div class="bfin-icon">${isTie ? "🤝" : isWinner ? "🏆" : "💔"}</div>
        <h2 class="bfin-title">${isTie ? "Empate!" : isWinner ? "Você venceu!" : `${escapeHTML(session.winner)} venceu!`}</h2>
      </div>

      <div class="batalha-final-scores">
        <div class="bfin-player ${session.winner === session.player1_name ? "bfin-winner" : ""}">
          <div class="bfin-name" style="color:${color1}">${session.player1_name}</div>
          <div class="bfin-score">${session.scores[session.player1_name] || 0}</div>
          <div class="bfin-label">pontos</div>
        </div>
        <div class="bfin-vs">vs</div>
        <div class="bfin-player ${session.winner === session.player2_name ? "bfin-winner" : ""}">
          <div class="bfin-name" style="color:${color2}">${session.player2_name}</div>
          <div class="bfin-score">${session.scores[session.player2_name] || 0}</div>
          <div class="bfin-label">pontos</div>
        </div>
      </div>

      <div class="bfin-rounds">
        <h4>Histórico das rodadas</h4>
        ${(session.round_results || []).map((r) => {
          const votes = r.votes || {};
          return `
            <div class="bfin-round-row">
              <span class="bfin-round-num">R${r.round}</span>
              <span class="bfin-round-anime">${escapeHTML(r.winnerAnime || "Empate")}</span>
              <div class="bfin-round-votes">
                ${Object.entries(votes).map(([player, animeId]) => {
                  const rndData = session.rounds[r.round - 1];
                  const animeName = animeId === rndData.animeA.id ? rndData.animeA.nome : rndData.animeB.nome;
                  return `<span style="color:${PERSON_LIGHTS[player] || "var(--muted)"}">
                    ${player}: ${escapeHTML(animeName)}
                  </span>`;
                }).join("")}
              </div>
              <span class="bfin-round-winner" style="color:${r.winner ? PERSON_LIGHTS[r.winner] : "var(--muted)"}">
                ${r.winner ? `+1 ${r.winner}` : "empate"}
              </span>
            </div>
          `;
        }).join("")}
      </div>

      <button class="batalha-action-btn" id="batalha-rematch">Nova batalha →</button>
    </div>
  `;

  document.getElementById("batalha-rematch")?.addEventListener("click", async () => {
    await cancelSession(session.id);
  });
}
