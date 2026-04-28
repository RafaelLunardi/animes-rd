const currentPage = window.location.pathname.split("/").pop() || "index.html";

if (currentPage !== "nyx.html") {
  const link = document.createElement("a");
  link.className = "nyx-floating-link";
  link.href = "nyx.html";
  link.setAttribute("aria-label", "Abrir Blog da Nyx");
  link.title = "Blog da Nyx";
  link.innerHTML = `
    <img src="assets/nyx-icon.png" alt="" />
    <span>Nyx</span>
  `;
  document.body.appendChild(link);
}
