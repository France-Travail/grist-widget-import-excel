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
export function renderPlan(plan, container, { applied = false } = {}) {
  container.replaceChildren();
  const columns = Object.fromEntries(plan.columns.map((c) => [c.id, c]));
  const label = (id) => columns[id]?.label || id;
  container.append(
    el("h3", {
      text: applied ? "Import terminé" : "Résultat de la vérification",
    }),
  );
  container.append(
    el("p", {
      class: "muted",
      text: applied
        ? "Les changements ci-dessous ont été enregistrés dans Grist."
        : plan.errors.length
          ? "L’import attend vos corrections. Aucune donnée n’a été modifiée dans Grist."
          : "Rien n’a encore été modifié. Vérifiez le résultat prévu avant de confirmer l’import.",
    }),
  );
  const labels = {
    added: applied ? "lignes ajoutées" : "lignes à ajouter",
    updated: applied ? "lignes mises à jour" : "lignes à mettre à jour",
    unchanged: "lignes conservées",
    errors: "erreurs à corriger",
  };
  container.append(
    el(
      "div",
      { class: "stats" },
      Object.entries(labels).map(([key, text]) =>
        el(
          "div",
          {
            class: `stat ${key === "errors" && plan.stats[key] ? "danger" : ""}`,
          },
          [el("strong", { text: plan.stats[key] }), el("span", { text })],
        ),
      ),
    ),
  );
  if (plan.errors.length) {
    container.append(
      el("div", { class: "notice error", role: "alert" }, [
        el("strong", { text: "À corriger avant l’import" }),
        el("p", {
          text: "Retrouvez la feuille, la ligne et la colonne concernées ci-dessous. Après correction, relancez la vérification.",
        }),
        ...plan.errors
          .slice(0, 50)
          .map((issue) =>
            el("div", { class: "issue" }, [
              el("strong", {
                text: location(issue, label) || "Paramètres de l’import",
              }),
              el("p", { text: issue.message }),
              el("p", {
                class: "issue-help",
                text: correctionHint(issue.message),
              }),
            ]),
          ),
        ...(plan.errors.length > 50
          ? [
              el("p", {
                text: "Les 50 premières erreurs sont affichées. Téléchargez le rapport pour consulter la liste complète.",
              }),
            ]
          : []),
      ]),
    );
  }
  if (plan.warnings.length)
    container.append(
      el("details", { class: "review-notes" }, [
        el("summary", {
          text: `${plan.warnings.length} points à vérifier · l’import reste possible`,
        }),
        el(
          "ul",
          {},
          plan.warnings
            .slice(0, 100)
            .map((issue) =>
              el("li", {
                text: `${location(issue, label)} : ${issue.message}`,
              }),
            ),
        ),
        ...(plan.warnings.length > 100
          ? [
              el("p", {
                text: "Les 100 premiers points sont affichés. Le rapport contient la liste complète.",
              }),
            ]
          : []),
      ]),
    );
  const changed = plan.details.filter((d) => d.status !== "Inchangée");
  if (changed.length) {
    container.append(
      el("h3", {
        text: applied ? "Changements enregistrés" : "Changements prévus",
      }),
    );
    container.append(
      el("p", {
        class: "muted",
        text: "Chaque bloc correspond à une ligne de votre fichier Excel. Seuls les champs à renseigner ou à modifier sont affichés.",
      }),
    );
    for (const d of changed.slice(0, 50)) {
      container.append(
        el(
          "details",
          {
            class: "change-card",
            ...(changed.length <= 5 ? { open: "" } : {}),
          },
          [
            el("summary", {}, [
              el("span", {
                class: "change-badge",
                text: d.status === "Ajout" ? "Nouvelle ligne" : "Modification",
              }),
              el("span", { text: `${d.sheet} · ligne ${d.row}` }),
            ]),
            dataTable(
              [
                "Champ",
                applied ? "Avant l’import" : "Actuellement dans Grist",
                applied ? "Après l’import" : "Après confirmation",
              ],
              Object.entries(d.after).map(([id, value]) => [
                label(id),
                d.status === "Ajout"
                  ? "Nouvelle ligne"
                  : displayValue(d.before[id], columns[id]?.type),
                displayValue(value, columns[id]?.type),
              ]),
            ),
          ],
        ),
      );
    }
    if (changed.length > 50)
      container.append(
        el("p", {
          class: "muted",
          text: "Aperçu limité aux 50 premières lignes. Téléchargez le rapport pour retrouver toutes les lignes concernées.",
        }),
      );
  }
  if (plan.stats.unchanged)
    container.append(
      el("p", {
        class: "muted",
        text: "Les lignes conservées restent telles quelles dans Grist : les règles choisies ne prévoient aucun changement pour ces lignes.",
      }),
    );
}
function displayValue(value, type) {
  return value == null || value === "" ? "Vide" : formatValue(value, type);
}
function location(issue, label = (id) => id) {
  return [
    issue.sheet,
    issue.row && `ligne ${issue.row}`,
    issue.column && label(issue.column),
  ]
    .filter(Boolean)
    .join(" · ");
}
function correctionHint(message) {
  if (/correspondance|associer/i.test(message))
    return "Dans l’étape 2, choisissez la colonne Grist correspondant à chaque identifiant du fichier.";
  if (/réservé aux dates|règle/i.test(message))
    return "Dans l’étape 2, vérifiez la règle choisie pour cette colonne.";
  if (/date|heure/i.test(message))
    return "Vérifiez cette cellule dans Excel (par exemple 10/12/2025 pour une date), enregistrez le fichier puis sélectionnez-le à nouveau.";
  if (/répété|doublon|ambigu/i.test(message))
    return "Vérifiez les identifiants dans le fichier et dans Grist : ils doivent permettre de reconnaître une seule ligne.";
  if (/vide|incomplet/i.test(message))
    return "Complétez la cellule indiquée dans Excel, enregistrez le fichier puis sélectionnez-le à nouveau.";
  return "Vérifiez la valeur indiquée et sa colonne de destination à l’étape 2, puis relancez la vérification.";
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
