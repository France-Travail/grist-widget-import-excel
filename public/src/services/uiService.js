import { formatValue } from "./dateService.js";

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "class") node.className = value;
    else if (key === "checked" || key === "disabled" || key === "hidden")
      node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}
export const option = (value, text) => el("option", { value, text });
export function dataTable(headers, rows) {
  return el("div", { class: "table-scroll", tabindex: "0" }, [
    el("table", {}, [
      el("thead", {}, [
        el(
          "tr",
          {},
          headers.map((text) => el("th", { scope: "col", text })),
        ),
      ]),
      el(
        "tbody",
        {},
        rows.map((row) =>
          el(
            "tr",
            {},
            row.map((text) => el("td", { text })),
          ),
        ),
      ),
    ]),
  ]);
}
export function renderPlan(plan, container) {
  container.replaceChildren();
  const labels = {
    added: "ajouts",
    updated: "modifications",
    unchanged: "inchangées",
    errors: "erreurs",
  };
  container.append(
    el(
      "div",
      { class: "stats" },
      Object.entries(labels).map(([key, label]) =>
        el(
          "div",
          {
            class: `stat ${key === "errors" && plan.stats[key] ? "danger" : ""}`,
          },
          [
            el("strong", { text: plan.stats[key] }),
            el("span", { text: label }),
          ],
        ),
      ),
    ),
  );
  if (plan.errors.length)
    container.append(
      el("div", { class: "notice error", role: "alert" }, [
        el("strong", {
          text: "L’import est bloqué. Aucune donnée n’a été écrite.",
        }),
        el(
          "ul",
          {},
          plan.errors
            .slice(0, 50)
            .map((e) => el("li", { text: location(e) + e.message })),
        ),
        ...(plan.errors.length > 50
          ? [
              el("p", {
                text: "Seules les 50 premières erreurs sont affichées. Le rapport contient toutes les erreurs.",
              }),
            ]
          : []),
      ]),
    );
  if (plan.warnings.length)
    container.append(
      el("details", {}, [
        el("summary", { text: `${plan.warnings.length} points à vérifier` }),
        el(
          "ul",
          {},
          plan.warnings
            .slice(0, 100)
            .map((e) => el("li", { text: location(e) + e.message })),
        ),
      ]),
    );
  const types = Object.fromEntries(plan.columns.map((c) => [c.id, c.type]));
  const lines = plan.details
    .filter((d) => d.status !== "Inchangée")
    .slice(0, 50)
    .flatMap((d) =>
      Object.entries(d.after).map(([id, value]) => [
        d.sheet,
        d.row,
        d.status,
        id,
        formatValue(d.before[id], types[id]),
        formatValue(value, types[id]),
      ]),
    );
  if (lines.length) {
    container.append(
      el("p", {
        class: "muted",
        text: "Aperçu des changements · 50 premières lignes modifiées",
      }),
    );
    container.append(
      dataTable(
        ["Feuille", "Ligne Excel", "Action", "Colonne", "Avant", "Après"],
        lines,
      ),
    );
  }
}
function location(issue) {
  return (
    [issue.sheet, issue.row && `ligne ${issue.row}`, issue.column]
      .filter(Boolean)
      .join(" · ") + " : "
  );
}
export function downloadReport(plan) {
  const rows = [["Feuille", "Ligne Excel", "Statut", "Message"]];
  rows.push(
    ...plan.details.map((d) => [
      d.sheet,
      d.row,
      d.status,
      Object.keys(d.after).join(", "),
    ]),
  );
  rows.push(
    ...plan.errors.map((e) => [
      e.sheet,
      e.row,
      "Erreur",
      (e.column ? e.column + " : " : "") + e.message,
    ]),
  );
  rows.push(
    ...plan.warnings.map((e) => [
      e.sheet,
      e.row,
      "Information",
      (e.column ? e.column + " : " : "") + e.message,
    ]),
  );
  // Neutralize spreadsheet formulas in user-controlled sheet and column names.
  const escape = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const url = URL.createObjectURL(
    new Blob(
      ["\ufeff" + rows.map((row) => row.map(escape).join(";")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const a = el("a", { href: url, download: "rapport-import.csv" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
