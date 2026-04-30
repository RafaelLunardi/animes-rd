// js/utils.js

/**
 * Escapa caracteres HTML para evitar XSS.
 */
export function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
}

export function stripEmoji(value) {
  return String(value ?? "")
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2702}-\u{27B0}]/gu, "")
    .trim();
}

/**
 * Corta um texto se ele for maior que o limite.
 */
export function shortText(value, size = 44) {
  const text = String(value ?? "");
  return text.length > size ? `${text.slice(0, size - 1)}...` : text;
}

/**
 * Embaralha um array (Fisher-Yates).
 */
export function shuffleItems(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

/**
 * Converte Hex para RGBA.
 */
export function hexToRgba(hex, alpha = 1) {
  const cleanHex = String(hex).replace("#", "");
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Normaliza texto (remove acentos e caracteres especiais).
 */
export function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function formatDateTimeBR(value) {
  const date = new Date(value);
  return {
    date,
    dateText: date.toLocaleDateString("pt-BR"),
    timeText: date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  /**
   * Carrega a navbar dinamicamente e marca o link ativo.
   * Retorna uma promessa que resolve quando a navbar estiver no DOM.
   */
  export async function loadNavbar() {
    const nav = document.querySelector("nav.nav");
    if (!nav) return;

    try {
      const response = await fetch("navbar.html");
      if (!response.ok) throw new Error("Falha ao carregar navbar.html");
      const html = await response.text();
      nav.innerHTML = html;

      // Marca o link ativo com base na URL atual
      const currentPath = window.location.pathname.split("/").pop() || "index.html";
      const links = nav.querySelectorAll("a");

      links.forEach((link) => {
        const href = link.getAttribute("href");
        if (href === currentPath) {
          link.classList.add("active");
        } else {
          link.classList.remove("active");
        }
      });

      // Dispara um evento customizado para avisar que a navbar carregou
      document.dispatchEvent(new CustomEvent("navbar-loaded"));
    } catch (error) {
      console.error("Erro ao carregar a navbar:", error);
    }
  }

  // Inicializa a navbar automaticamente se o script for carregado
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadNavbar);
  } else {
    loadNavbar();
  }
}
