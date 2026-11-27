(() => {
  "use strict";

  const versionElement = document.querySelector("#app-version");
  const statusElement = document.querySelector("#version-status");
  const updateButton = document.querySelector("#version-update");
  const gameShell = document.querySelector("#game-shell");
  const version = document.querySelector('meta[name="application-version"]')?.content;

  function versionParts(value) {
    if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) return null;
    const parts = value.split(".").map(Number);
    return parts.every(Number.isSafeInteger) ? parts : null;
  }

  const currentParts = versionParts(version);
  if (!currentParts) {
    versionElement.textContent = "Versão indisponível";
    console.error("Versão da aplicação inválida ou ausente.");
    return;
  }
  versionElement.textContent = `v${version}`;

  updateButton.addEventListener("click", () => {
    if (!gameShell.hidden && !window.confirm("Atualizar a página encerrará a partida em andamento. Continuar?")) return;
    window.location.reload();
  });

  if (window.location.protocol === "file:") {
    statusElement.textContent = "Verificação indisponível offline";
    return;
  }

  let checking = false;
  async function checkForUpdates() {
    if (checking) return;
    checking = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(new URL("index.html", window.location.href), {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const latest = new DOMParser().parseFromString(html, "text/html")
        .querySelector('meta[name="application-version"]')?.content;
      const latestParts = versionParts(latest);
      if (!latestParts) throw new Error("Versão publicada inválida ou ausente");
      const difference = latestParts.findIndex((part, index) => part !== currentParts[index]);
      const newer = difference !== -1 && latestParts[difference] > currentParts[difference];
      updateButton.hidden = !newer;
      updateButton.textContent = newer ? `Nova versão v${latest} · Atualizar` : "";
      statusElement.textContent = "";
    } catch (error) {
      statusElement.textContent = "Não foi possível verificar atualizações";
      console.warn(`Não foi possível verificar atualizações: ${error.message}`);
    } finally {
      window.clearTimeout(timeout);
      checking = false;
    }
  }

  checkForUpdates();
  window.setInterval(checkForUpdates, 5 * 60 * 1000);
  window.addEventListener("online", checkForUpdates);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdates();
  });
})();
