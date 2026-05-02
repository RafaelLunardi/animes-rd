import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";
import { PEOPLE, PERSON_COLORS, PERSON_LIGHTS } from "./data.js?v=modal-notes-line-2";
import { escapeHTML } from "./utils.js";

const isConfigured = firebaseConfig.apiKey !== "SUA_API_KEY";
const app = isConfigured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

const container = document.getElementById("historico-container");

function getVoteLabel(vote) {
  if (!vote) return "—";
  if (vote.score === null || vote.score === undefined) return "Não assisti";
  return Number(vote.score).toFixed(1);
}

function renderHistorico(animes, currentUser) {
  if (!container) return;

  const voted = animes.filter((a) => a.votedUserIds?.includes(currentUser.uid));

  if (!voted.length) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px; color:var(--muted)">
        <div style="font-size:48px; margin-bottom:16px">📭</div>
        <p style="font-size:16px; font-weight:700; color:var(--paper)">Nenhum voto ainda</p>
        <p>Você ainda não votou em nenhum anime da fila de aprovação.</p>
        <a href="pending.html" style="color:var(--hacksuya-light); font-weight:800; margin-top:16px; display:inline-block">← Ir para a fila</a>
      </div>`;
    return;
  }

  const person = currentUser.personName;
  const color = PERSON_LIGHTS[person] || "#a78bfa";

  container.innerHTML = `
    <div style="margin-bottom:20px; color:var(--muted); font-size:14px">
      ${voted.length} anime${voted.length !== 1 ? "s" : ""} votado${voted.length !== 1 ? "s" : ""} por <strong style="color:${color}">${person}</strong>
    </div>
    <div id="pending-animes-container">
      ${voted
        .map((anime) => {
          const myVote = person ? anime.votes?.[person] : null;
          const myLabel = getVoteLabel(myVote);
          const myColor =
            myVote?.score !== null && myVote?.score !== undefined ? "#86efac" : "#fde68a";

          const dots = PEOPLE.map((p) => {
            const hasVoted = anime.votes && anime.votes[p];
            const c = PERSON_COLORS[p] || "#ccc";
            const lc = PERSON_LIGHTS[p] || "rgba(255,255,255,0.1)";
            return `<span title="${p}: ${hasVoted ? "Já votou" : "Pendente"}"
            style="display:inline-flex;width:22px;height:22px;border-radius:50%;
                   align-items:center;justify-content:center;font-size:11px;font-weight:bold;
                   margin-right:4px;border:1px solid ${hasVoted ? c : "rgba(255,255,255,0.1)"};
                   background:${hasVoted ? lc : "transparent"};color:${hasVoted ? c : "rgba(255,255,255,0.2)"};
                   opacity:${hasVoted ? "1" : "0.5"}">${p[0]}</span>`;
          }).join("");

          const otherVotes = PEOPLE.filter((p) => p !== person && anime.votes?.[p])
            .map((p) => {
              const v = anime.votes[p];
              const lbl = getVoteLabel(v);
              return `<span class="pending-genre-chip" style="color:${PERSON_LIGHTS[p]}">${p}: ${lbl}</span>`;
            })
            .join("");

          return `
          <div class="vote-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <h3 style="margin:0">${escapeHTML(anime.nome)}</h3>
              <div style="display:flex">${dots}</div>
            </div>
            <div class="pending-genres">${(anime.generos || []).map((g) => `<span class="pending-genre-chip">${g}</span>`).join("")}</div>
            <div style="font-size:12px;color:var(--faint);margin-bottom:12px">
              Sugerido por <strong style="color:${PERSON_LIGHTS[anime.submittedByName] || "var(--paper)"}">${escapeHTML(anime.submittedByName || "")}</strong>
            </div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(134,239,172,0.1);border-radius:16px;padding:14px">
              <div style="color:${myColor};font-weight:800;font-size:14px;margin-bottom:${otherVotes ? "12px" : "0"}">
                ✓ Meu voto: ${myLabel}
                ${myVote?.comment ? `<div style="color:var(--muted);font-size:12px;font-weight:600;margin-top:6px">"${escapeHTML(myVote.comment)}"</div>` : ""}
              </div>
              ${otherVotes ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${otherVotes}</div>` : ""}
            </div>
          </div>`;
        })
        .join("")}
    </div>
  `;
}

function init() {
  if (!auth) {
    container.innerHTML = `<p style="text-align:center;padding:40px;color:var(--faint)">Firebase não configurado.</p>`;
    return;
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      container.innerHTML = `<p style="text-align:center;padding:40px;color:var(--faint)">Faça login para ver seu histórico.</p>`;
      return;
    }

    const storedName = localStorage.getItem(`user-${user.uid}-personName`);
    const currentUser = { uid: user.uid, personName: storedName };

    const pendingRef = collection(db, "pending_animes");
    const q = query(pendingRef, orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
      const animes = [];
      snapshot.forEach((doc) => animes.push({ ...doc.data(), id: doc.id }));
      renderHistorico(animes, currentUser);
    });
  });
}

init();
