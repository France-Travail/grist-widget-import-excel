// =========================
// uiService.js - Rendu UI
// =========================

import { fetchImportRules } from "./rulesService.js";
import { DUPLICATION_RULES } from "../config.js";
import { normalizeName } from "./utils.js";
import {
  getExcelData, setExcelData, getExcelSheetNames,
  getSelectedSheets, setSelectedSheets, getExcelWorkbook,
  getColumnMetadata,
} from "./state.js";
import { parseSheet } from "./excelService.js";
import { getFormulaColumns } from "./gristService.js";

// Re-exports depuis state pour compatibilite
export { getExcelData, setExcelData };

// =========================
// Selecteur d'onglets Excel
// =========================

/**
 * Affiche le selecteur d'onglets si le fichier en contient plusieurs.
 * @param {string[]} sheetNames
 * @param {Function} onSelectionChange - Appelee avec les onglets selectionnes
 */
export function renderSheetSelector(sheetNames, onSelectionChange) {
  const container = document.getElementById("sheet-selector-container");
  const section = document.getElementById("sheet-selector-section");
  if (!container) return;

  // Un seul onglet : pas de selecteur
  if (!sheetNames || sheetNames.length <= 1) {
    if (section) section.style.display = "none";
    container.innerHTML = "";
    return;
  }

  if (section) section.style.display = "";
  container.style.display = "";
  container.innerHTML = `
    <div class="sheet-selector-header">
      <span class="sheet-count">${sheetNames.length} onglets detectes</span>
      <div class="sheet-selector-actions">
        <button type="button" class="btn-link" id="sheet-select-all">Tout selectionner</button>
        <button type="button" class="btn-link" id="sheet-deselect-all">Tout deselectionner</button>
      </div>
    </div>
    <div class="sheet-checkboxes">
      ${sheetNames.map((name, i) => `
        <label class="sheet-checkbox-label">
          <input type="checkbox" class="sheet-checkbox" value="${name}" checked />
          <span class="sheet-name">${name}</span>
          <span class="sheet-badge">#${i + 1}</span>
        </label>
      `).join("")}
    </div>
  `;

  const checkboxes = container.querySelectorAll(".sheet-checkbox");

  function updateSelection() {
    const selected = [...checkboxes]
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);
    setSelectedSheets(selected);

    // Preview du premier onglet selectionne
    if (selected.length > 0) {
      const wb = getExcelWorkbook();
      if (wb) {
        const data = parseSheet(wb, selected[0]);
        setExcelData(data);
        onSelectionChange?.(selected);
      }
    }
  }

  checkboxes.forEach((cb) => cb.addEventListener("change", updateSelection));

  document.getElementById("sheet-select-all")?.addEventListener("click", () => {
    checkboxes.forEach((cb) => { cb.checked = true; });
    updateSelection();
  });

  document.getElementById("sheet-deselect-all")?.addEventListener("click", () => {
    checkboxes.forEach((cb) => { cb.checked = false; });
    updateSelection();
  });
}

// =========================
// Preview donnees Excel
// =========================
export function renderPreview(data) {
  const container = document.getElementById("preview-container");
  container.innerHTML = "";

  if (!data || data.length === 0) {
    container.textContent = "Aucune donnee trouvee dans le fichier.";
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.classList.add("table-wrapper");

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  const headerRow = document.createElement("tr");
  data[0].forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // Limiter la preview a 50 lignes
  const maxPreviewRows = Math.min(data.length - 1, 50);
  data.slice(1, maxPreviewRows + 1).forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  if (data.length - 1 > maxPreviewRows) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = data[0].length;
    td.textContent = `... et ${data.length - 1 - maxPreviewRows} lignes supplementaires`;
    td.style.textAlign = "center";
    td.style.fontStyle = "italic";
    td.style.color = "var(--text-muted)";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

// =========================
// Colonnes Excel
// =========================
export function populateColumnList(headers) {
  const select = document.getElementById("column-list");
  if (!select) return;
  select.innerHTML = "";

  headers.forEach((colName) => {
    const option = document.createElement("option");
    option.value = normalizeName(colName);
    option.textContent = colName;
    select.appendChild(option);
  });
}

// =========================
// Selecteur cle(s) unique(s) composite
// =========================
export async function populateUniqueKeySelector(columnNames) {
  const { uniqueKeys } = await fetchImportRules();
  const container = document.getElementById("unique-key-checkboxes");
  if (!container) return;
  container.innerHTML = "";

  const formulaCols = getFormulaColumns();
  const normalizedUniqueKeys = (uniqueKeys || []).map(k => normalizeName(k));

  columnNames.forEach((col) => {
    const normCol = normalizeName(col);
    const isFormula = formulaCols.has(col);

    const label = document.createElement("label");
    label.className = "unique-key-checkbox-label" + (isFormula ? " formula-col" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "unique-key-checkbox";
    checkbox.value = normCol;
    checkbox.dataset.original = col;
    checkbox.checked = normalizedUniqueKeys.includes(normCol);
    if (isFormula) checkbox.disabled = true;

    const span = document.createElement("span");
    span.textContent = col + (isFormula ? " (formule)" : "");

    label.appendChild(checkbox);
    label.appendChild(span);
    container.appendChild(label);

    checkbox.addEventListener("change", async () => {
      const checked = [...container.querySelectorAll(".unique-key-checkbox:checked")]
        .map(cb => cb.value);
      try {
        const tableData = await grist.docApi.fetchTable("RULES_CONFIG");
        const actions = tableData.col_name.map((ruleCol, i) => [
          "UpdateRecord",
          "RULES_CONFIG",
          tableData.id[i],
          { is_key: checked.includes(normalizeName(ruleCol)) },
        ]);
        await grist.docApi.applyUserActions(actions);
        console.log("Cle(s) unique(s) mise(s) a jour :", checked);
      } catch (err) {
        console.error("Erreur lors de la mise a jour des cles uniques:", err);
      }
    });
  });
}

// =========================
// Mapping Excel <-> Grist
// =========================
export function updateMappingUI(mapping) {
  const container = document.getElementById("mapping-preview");
  if (!container || !mapping) return;

  const matched = Object.entries(mapping).filter(([, v]) => v);
  const unmatched = Object.entries(mapping).filter(([, v]) => !v);

  container.innerHTML = `
    <h4>Correspondances Excel <-> Grist</h4>
    <div class="mapping-stats">
      <span class="mapping-stat-matched">${matched.length} correspondance(s)</span>
      ${unmatched.length > 0 ? `<span class="mapping-stat-unmatched">${unmatched.length} sans correspondance</span>` : ""}
    </div>
    <ul>
      ${matched.map(([excelCol, gristCol]) =>
        `<li><strong>${excelCol}</strong> -> ${gristCol}</li>`
      ).join("")}
      ${unmatched.map(([excelCol]) =>
        `<li class="mapping-unmatched"><strong>${excelCol}</strong> -> Aucun match</li>`
      ).join("")}
    </ul>
  `;
}

// =========================
// Barre de progression
// =========================
export function showProgressBar() {
  const container = document.getElementById("progress-container");
  if (!container) return;
  container.style.display = "";
  container.innerHTML = `
    <div class="progress-bar-wrapper">
      <div class="progress-bar-track">
        <div class="progress-bar-fill" id="progress-bar-fill" style="width: 0%"></div>
      </div>
      <div class="progress-bar-text" id="progress-bar-text">Preparation...</div>
    </div>
  `;
}

export function updateProgressBar(current, total) {
  const fill = document.getElementById("progress-bar-fill");
  const text = document.getElementById("progress-bar-text");
  if (!fill || !text) return;

  const pct = Math.round((current / total) * 100);
  fill.style.width = `${pct}%`;
  text.textContent = `${current} / ${total} lignes (${pct}%)`;
}

export function hideProgressBar() {
  const container = document.getElementById("progress-container");
  if (!container) return;
  container.style.display = "none";
}

// =========================
// Rapport de validation
// =========================
export function showValidationReport({ valid, warnings, errors }) {
  const container = document.getElementById("validation-report");
  if (!container) return;
  container.style.display = "";

  let html = "";

  if (errors.length > 0) {
    html += `<div class="validation-errors">
      <strong>Erreurs bloquantes :</strong>
      <ul>${errors.map((e) => `<li>${e}</li>`).join("")}</ul>
    </div>`;
  }

  if (warnings.length > 0) {
    html += `<div class="validation-warnings">
      <strong>Avertissements :</strong>
      <ul>${warnings.map((w) => `<li>${w}</li>`).join("")}</ul>
    </div>`;
  }

  if (valid && warnings.length === 0) {
    html = `<div class="validation-ok">Validation OK - Pret pour l'import.</div>`;
  }

  container.innerHTML = html;
}

export function hideValidationReport() {
  const container = document.getElementById("validation-report");
  if (container) container.style.display = "none";
}

// =========================
// Resume d'import
// =========================
export function showImportResult({ resume, stats, dryRun, sheetName }) {
  const status = document.getElementById("import-status");
  if (!status) return;

  const prefix = dryRun ? "[SIMULATION] " : "";
  const color = dryRun ? "#f59e0b" : "#10b981";
  const hasErrors = stats.errors && stats.errors > 0;

  status.innerHTML = `
    <p style="color:${hasErrors ? '#ef4444' : color}"><strong>${prefix}Import termine${sheetName ? ` (onglet: ${sheetName})` : ""}.</strong></p>
    <div class="import-stats">
      <span class="stat-added">${stats.added} ajoutee(s)</span>
      <span class="stat-updated">${stats.updated} mise(s) a jour</span>
      <span class="stat-skipped">${stats.skipped} ignoree(s)</span>
      ${hasErrors ? `<span class="stat-errors">${stats.errors} erreur(s)</span>` : ""}
    </div>
    <details>
      <summary>Details (${resume.length} lignes)</summary>
      <ul style="margin-top: 0.5em; font-size: 0.85em; padding-left: 1em; max-height: 300px; overflow-y: auto;">
        ${resume.map((line) => `<li>${line}</li>`).join("")}
      </ul>
    </details>`;
}

// =========================
// Admin Rules UI
// =========================
export async function initAdminRulesUI() {
  const { rules, uniqueKeys } = await fetchImportRules();

  const rulesContainer = document.getElementById("grist-rules-table");
  if (!rulesContainer) return;

  rulesContainer.innerHTML = "";

  const formulaCols = getFormulaColumns();
  const colMeta = getColumnMetadata();

  // Construire un index normalise pour matcher les colonnes RULES_CONFIG vs metadata
  const metaByNorm = {};
  for (const [colId, info] of Object.entries(colMeta)) {
    metaByNorm[normalizeName(colId)] = { colId, ...info };
  }

  for (const [normCol, ruleObj] of Object.entries(rules)) {
    // Trouver la metadata par colId direct ou par normalization
    const meta = colMeta[ruleObj.original] || metaByNorm[normCol];
    const isFormula = meta?.isFormula || formulaCols.has(ruleObj.original);
    const isRef = meta?.refTable;

    const row = document.createElement("div");
    row.className = "rule-row" + (isFormula ? " rule-row-formula" : "");

    const labelEl = document.createElement("label");
    let labelText = ruleObj.original;
    if (isFormula) labelText += " (formule)";
    if (isRef) labelText += ` (ref: ${meta.refTable})`;
    labelEl.textContent = labelText;

    const select = document.createElement("select");
    select.name = normCol;
    if (isFormula) select.disabled = true;

    for (const rule of DUPLICATION_RULES) {
      const option = document.createElement("option");
      option.value = rule.value;
      option.textContent = rule.label;
      option.title = rule.description;
      if (isFormula) {
        if (rule.value === "ignore") option.selected = true;
      } else {
        if (rule.value === ruleObj.rule) option.selected = true;
      }
      select.appendChild(option);
    }

    const description = document.createElement("small");
    description.className = "rule-description-text";
    if (isFormula) {
      description.textContent = "Colonne formule - exclue automatiquement de l'import";
    } else {
      const selectedRule = DUPLICATION_RULES.find(r => r.value === ruleObj.rule);
      description.textContent = selectedRule?.description || "";
    }

    select.addEventListener("change", async (event) => {
      const newRule = event.target.value;
      const selectedRuleObj = DUPLICATION_RULES.find(r => r.value === newRule);
      description.textContent = selectedRuleObj?.description || "";

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
        console.log(`Regle "${ruleObj.original}" mise a jour -> ${newRule}`);
      } catch (err) {
        console.error("Erreur lors de la mise a jour de la regle:", err);
      }
    });

    row.appendChild(labelEl);
    row.appendChild(select);
    row.appendChild(description);
    rulesContainer.appendChild(row);
  }

  // Composite key checkboxes are handled by populateUniqueKeySelector
}
