// uiService.js
// ===========================
// Gère l'affichage, la prévisualisation et les interactions utilisateur
// avec les règles d'import entre Excel et Grist

import { fetchImportRules } from "./rulesService.js";
import { DUPLICATION_RULES } from "../config.js";
import { normalizeName } from "./utils.js";

// === Stockage local des données Excel ===
let currentExcelData = [];

export function setExcelData(data) {
  currentExcelData = data;
}

export function getExcelData() {
  return currentExcelData;
}

// === Prévisualisation des données Excel ===
export function renderPreview(data) {
  const container = document.getElementById("preview-container");
  container.innerHTML = "";

  if (!data || data.length === 0) {
    container.textContent = "Aucune donnée trouvée dans le fichier.";
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.classList.add("table-wrapper");

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  // En-têtes
  const headerRow = document.createElement("tr");
  data[0].forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // Données
  data.slice(1).forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

// === Remplissage des listes déroulantes ===
export function populateColumnList(headers) {
  const select = document.getElementById("column-list");
  select.innerHTML = "";

  headers.forEach((colName) => {
    const option = document.createElement("option");
    option.value = normalizeName(colName); // 🔧 normalisation
    option.textContent = colName; // affichage original
    select.appendChild(option);
  });
}

export async function populateUniqueKeySelector(columnNames) {
  const { uniqueKey } = await fetchImportRules();
  const select = document.getElementById("unique-key-dropdown");
  select.innerHTML = "";

  columnNames.forEach((col) => {
    const normCol = normalizeName(col);
    const option = document.createElement("option");
    option.value = normCol;
    option.textContent = col;
    if (normCol === normalizeName(uniqueKey)) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

// === Affichage des colonnes Grist dans la config des règles ===
export function afficherColonnesGrist(columns) {
  const container = document.getElementById("rules-container");
  container.innerHTML = "";

  columns.forEach((col) => {
    const div = document.createElement("div");
    div.textContent = `${col}`;
    container.appendChild(div);
  });
}

// === Génère les champs de configuration des règles ===
export async function populateRulesConfig(columns) {
  const { rules } = await fetchImportRules();
  const container = document.getElementById("rules-container");
  container.innerHTML = "";

  columns.forEach((col) => {
    const normCol = normalizeName(col);
    const currentRule = rules[normCol]?.rule || "ignore";

    const div = document.createElement("div");
    div.style.marginBottom = "1em";

    const label = document.createElement("label");
    label.textContent = col;
    label.setAttribute("for", `rule-${normCol}`);
    label.style.marginRight = "1em";
    label.style.fontWeight = "bold";

    const select = document.createElement("select");
    select.id = `rule-${normCol}`;
    select.name = `rule-${normCol}`;
    select.dataset.col = normCol;
    select.style.marginRight = "0.5em";

    DUPLICATION_RULES.forEach((rule) => {
      const option = document.createElement("option");
      option.value = rule.value;
      option.textContent = rule.label;
      option.title = rule.description;
      if (currentRule === rule.value) option.selected = true;
      select.appendChild(option);
    });

    const description = document.createElement("small");
    description.className = "rule-description";
    const selected = DUPLICATION_RULES.find((r) => r.value === currentRule);
    description.textContent =
      selected?.description || DUPLICATION_RULES[0].description;

    select.addEventListener("change", (e) => {
      const selectedRule = DUPLICATION_RULES.find(
        (r) => r.value === e.target.value
      );
      description.textContent = selectedRule?.description || "";
    });

    div.appendChild(label);
    div.appendChild(select);
    div.appendChild(description);
    container.appendChild(div);
  });
}

// === Retourne la colonne sélectionnée comme clé unique ===
export function getSelectedUniqueColumn() {
  const select = document.getElementById("unique-key-selector");
  return normalizeName(select?.value || null);
}

// === Résumé des règles sélectionnées (affichage UI) ===
export function generateRulesSummary() {
  const container = document.getElementById("rules-summary");
  container.innerHTML = "";

  const rules = [...document.querySelectorAll("#rules-container select")].map(
    (select) => {
      const field = select.dataset.col; // déjà normalisé
      const rule = select.options[select.selectedIndex].textContent;
      return `Champ ${field} : ${rule}`;
    }
  );

  const ul = document.createElement("ul");
  rules.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r;
    ul.appendChild(li);
  });

  container.appendChild(ul);
}

// === Affiche le mapping Excel ↔ Grist dans l'UI ===
export function updateMappingUI(mapping) {
  const container = document.getElementById("mapping-preview");
  if (!container) return;

  container.innerHTML = `
    <h4>Correspondances Excel ↔ Grist</h4>
    <ul>
      ${Object.entries(mapping)
        .map(
          ([excelCol, gristCol]) =>
            `<li><strong>${excelCol}</strong> → ${
              gristCol || "Aucun match"
            }</li>`
        )
        .join("")}
    </ul>
  `;
}

// === Récupère les règles d'import actuelles depuis Grist ===
export async function getCurrentRules() {
  return await fetchImportRules(); // déjà normalisé côté rulesService
}

// === Initialisation de l'interface Admin (mode Admin) ===
export async function initAdminRulesUI() {
  const { rules, uniqueKey } = await fetchImportRules();

  const rulesContainer = document.getElementById("grist-rules-table");
  const uniqueKeyDropdown = document.getElementById("unique-key-dropdown");

  rulesContainer.innerHTML = "";
  uniqueKeyDropdown.innerHTML = "";

  for (const [normCol, ruleObj] of Object.entries(rules)) {
    const row = document.createElement("div");
    row.className = "rule-row";
    row.style.display = "flex";
    row.style.gap = "1rem";
    row.style.alignItems = "center";
    row.style.marginBottom = "0.5rem";

    const label = document.createElement("label");
    label.textContent = ruleObj.original; // affichage lisible
    label.style.flex = "1";

    const select = document.createElement("select");
    select.name = normCol;
    select.style.flex = "2";

    for (const rule of DUPLICATION_RULES) {
      const option = document.createElement("option");
      option.value = rule.value;
      option.textContent = rule.label;
      if (rule.value === ruleObj.rule) option.selected = true;
      select.appendChild(option);
    }

    select.addEventListener("change", async (event) => {
      const newRule = event.target.value;
      try {
        const tableData = await grist.docApi.fetchTable("RULES_CONFIG");
        const idx = tableData.col_name.findIndex(
          (name) => normalizeName(name) === normCol
        );
        if (idx === -1) return;
        const rowId = tableData.id[idx];
        await grist.docApi.applyUserActions([
          ["UpdateRecord", "RULES_CONFIG", rowId, { rule: newRule }],
        ]);
        console.log(`Règle "${ruleObj.original}" mise à jour → ${newRule}`);
      } catch (err) {
        console.error("Erreur lors de la mise à jour de la règle :", err);
      }
    });

    row.appendChild(label);
    row.appendChild(select);
    rulesContainer.appendChild(row);

    const optionKey = document.createElement("option");
    optionKey.value = normCol;
    optionKey.textContent = ruleObj.original;
    if (normCol === normalizeName(uniqueKey)) optionKey.selected = true;
    uniqueKeyDropdown.appendChild(optionKey);
  }

  uniqueKeyDropdown.addEventListener("change", async (event) => {
    const selectedKey = event.target.value;
    try {
      const tableData = await grist.docApi.fetchTable("RULES_CONFIG");
      const actions = tableData.col_name.map((col, i) => [
        "UpdateRecord",
        "RULES_CONFIG",
        tableData.id[i],
        { is_key: normalizeName(col) === selectedKey },
      ]);
      await grist.docApi.applyUserActions(actions);
      console.log(`Clé unique mise à jour → ${selectedKey}`);
    } catch (err) {
      console.error("Erreur lors de la mise à jour de la clé unique :", err);
    }
  });

  console.log("UI admin pré-remplie depuis Grist");
}
