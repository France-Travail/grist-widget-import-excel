// Keep this entry stable: a fresh manifest selects one coherent release for all assets.
const root = new URL(".", import.meta.url);
const manifestUrl = () => new URL(`version.json?t=${Date.now()}`, root);
async function manifest() {
  const response = await fetch(manifestUrl(), { cache: "no-store" });
  if (!response.ok) throw new Error("Version du widget indisponible.");
  const data = await response.json();
  if (
    !/^[a-f0-9]{12}$/.test(data.revision) ||
    data.path !== `releases/${data.revision}/`
  )
    throw new Error("Version du widget invalide.");
  return data;
}
function script(url) {
  return new Promise((resolve, reject) => {
    const element = document.createElement("script");
    element.src = url;
    element.onload = resolve;
    element.onerror = () =>
      reject(new Error("Une dépendance du widget n’a pas pu être chargée."));
    document.head.append(element);
  });
}
try {
  const current = await manifest();
  const base = new URL(current.path, root);
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = new URL("styles/style.css", base);
  document.head.append(style);
  await Promise.all([
    script(new URL("vendor/grist-plugin-api.js", base)),
    script(new URL("vendor/xlsx.full.min.js", base)),
  ]);
  const { start } = await import(new URL("src/app.js", base));
  await start({ version: current.version, revision: current.revision });
  async function check() {
    try {
      if ((await manifest()).revision !== current.revision)
        document.dispatchEvent(new Event("widget-update-available"));
    } catch {
      /* A transient offline state must not interrupt an import. */
    }
  }
  setInterval(check, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
} catch (error) {
  const main = document.getElementById("app");
  main.replaceChildren();
  const text = document.createElement("p");
  text.textContent = `${error.message} Vérifier la connexion puis réessayer.`;
  const retry = document.createElement("button");
  retry.textContent = "Réessayer";
  retry.onclick = () => location.reload();
  main.append(text, retry);
}
