// =========================
// 📦 IMPORTS
// =========================

// Services Grist
import {
  initGristListener,
  importToGrist,
  getGristColumnTypes,
} from "./services/gristService.js";

// Services Excel
import { parseExcelFile, matchExcelToGrist } from "./services/excelService.js";

// Services UI
import {
  renderPreview,
  populateColumnList,
  afficherColonnesGrist,
  populateUniqueKeySelector,
  populateRulesConfig,
  generateRulesSummary,
  updateMappingUI,
  getSelectedUniqueColumn,
  getCurrentRules,
  getExcelData,
  initAdminRulesUI,
} from "./services/uiService.js";

// Règles d'import
import { fetchImportRules } from "./services/rulesService.js";

// =========================
// 🧠 VARIABLES GLOBALES
// =========================

let gristCols = []; // Colonnes détectées dans la table Grist

// =========================
// 🚀 INITIALISATION GRIST
// =========================

initGristListener((records) => {
  if (records.length > 0) {
    const columnNames = Object.keys(records[0]);
    gristCols = columnNames;

    populateUniqueKeySelector(columnNames);
    // populateRulesConfig(columnNames); ← désactivé pour l’instant
  } else {
    console.log("Aucune donnée reçue de Grist");
  }
});

// =========================
// 🎛️ GESTION DES MODES
// =========================

function setMode(mode) {
  document.querySelectorAll("section[data-mode]").forEach((section) => {
    const allowed = section.dataset.mode.split(" ");
    section.style.display = allowed.includes(mode) ? "" : "none";
  });

  if (mode !== "public") {
    initAdminRulesUI(); // Affiche les options d’administration
  }
}

// Mode par défaut (dev)
setMode("public");

document.getElementById("mode-selector").addEventListener("change", (e) => {
  const mode = e.target.value;
  setMode(mode);
});

// =========================
// 📂 UPLOAD DU FICHIER EXCEL
// =========================

document.getElementById("file-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  document.getElementById("file-name").textContent = file.name;

  parseExcelFile(file, (data) => {
    try {
      renderPreview(data);
      populateColumnList(data[0]);
    } catch (err) {
      console.error("Erreur lors de l'affichage :", err);
      document.getElementById("preview-container").textContent =
        "Erreur lors du rendu des données.";
    }
  });
});

// =========================
// 🔁 MATCHING COLONNES Excel ↔ Grist
// =========================

document
  .getElementById("match-columns-button")
  .addEventListener("click", () => {
    const excelCols = getExcelData()?.[0] ?? [];

    if (!excelCols.length || !gristCols.length) {
      console.warn("Impossible de faire le mapping : colonnes manquantes.");
      return;
    }

    const mapping = matchExcelToGrist(excelCols, gristCols);
    console.log("🔁 Mapping détecté :", mapping);
    updateMappingUI(mapping);
  });

// =========================
// 🚚 IMPORT DES DONNÉES
// =========================

document
  .getElementById("launch-import-btn")
  .addEventListener("click", async () => {
    console.log("🚀 Début de l'import...");

    const status = document.getElementById("import-status");
    const { rules, uniqueKey } = await fetchImportRules();
    const excelData = getExcelData();

    // ✅ Vérifications préalables
    if (!uniqueKey) {
      alert(
        "Merci de sélectionner une colonne unique pour détecter les doublons."
      );
      return;
    }

    if (!excelData || excelData.length === 0) {
      alert("Merci de charger un fichier Excel valide.");
      return;
    }

    // 🟠 Indication de progression
    status.textContent = "⏳ Import en cours...";
    status.style.color = "#f0ad4e";

    try {
      console.log("🔑 Clé unique :", uniqueKey);
      console.log("📜 Règles utilisées :", rules);

      // Sécurité : la clé unique ne peut pas être "ignore"
      if (rules[uniqueKey] === "ignore") {
        console.warn(
          `🔁 Correction : "${uniqueKey}" est passé de "ignore" à "match"`
        );
        rules[uniqueKey] = "match";
      }

      const mapping = matchExcelToGrist(excelData[0], gristCols);
      const resume = await importToGrist({ excelData, mapping });

      // ✅ Affichage d’un résumé visuel
      const htmlSummary = resume.map((line) => `<li>${line}</li>`).join("");

      status.innerHTML = `
        <p style="color:#5cb85c"><strong>✅ Import terminé avec succès.</strong></p>
        <ul style="margin-top: 0.5em; font-size: 0.9em; padding-left: 1em;">
          ${htmlSummary}
        </ul>`;
    } catch (err) {
      console.error("❌ Échec de l'import :", err);
      status.textContent =
        "❌ Échec de l'import. Voir la console pour plus d'informations.";
      status.style.color = "#d9534f";
    }
  });
