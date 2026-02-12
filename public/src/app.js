// =========================
// app.js - Orchestrateur principal
// =========================

import { initGristListener, importToGrist, getGristColumnTypes, validateBeforeImport, logImport, rollbackImport, getLastImportForRollback } from "./services/gristService.js";
import { parseExcelFile, matchExcelToGrist, parseSheetsData } from "./services/excelService.js";
import {
  renderPreview, populateColumnList, populateUniqueKeySelector,
  updateMappingUI, getExcelData, initAdminRulesUI,
  renderSheetSelector, showProgressBar, updateProgressBar, hideProgressBar,
  showValidationReport, hideValidationReport, showImportResult,
} from "./services/uiService.js";
import { fetchImportRules } from "./services/rulesService.js";
import {
  getSelectedSheets, getExcelFileName, setCurrentMode, getCurrentMode,
  setAdminPanelOpen, isAdminPanelOpen, getExcelSheetNames,
} from "./services/state.js";

// =========================
// Variables
// =========================
let gristCols = [];

// =========================
// Detection du mode via URL
// =========================
const urlParams = new URLSearchParams(window.location.search);
const urlMode = urlParams.get("mode");

// =========================
// Gestion des modes
// =========================
function setMode(mode) {
  setCurrentMode(mode);

  document.querySelectorAll("section[data-mode]").forEach((section) => {
    const allowed = section.dataset.mode.split(" ");
    section.style.display = allowed.includes(mode) ? "" : "none";
  });

  // Afficher/masquer le bouton retour admin
  const backBtn = document.getElementById("admin-back-btn");
  if (backBtn) backBtn.style.display = (mode === "admin") ? "" : "none";

  if (mode === "admin" || mode === "dev") {
    initAdminRulesUI();
  }
}

function openAdminPanel() {
  setAdminPanelOpen(true);
  setMode("admin");
  // Afficher l'overlay info
  const overlay = document.getElementById("admin-overlay");
  if (overlay) overlay.style.display = "flex";
}

function closeAdminPanel() {
  setAdminPanelOpen(false);
  // Masquer l'overlay au cas ou
  const overlay = document.getElementById("admin-overlay");
  if (overlay) overlay.style.display = "none";
  setMode(urlMode === "dev" ? "dev" : "public");
}

// =========================
// Init Grist avec onEditOptions
// =========================
initGristListener(
  // onRecordsReceived
  async (records) => {
    const gristSchema = getGristColumnTypes();
    const columnNames = Object.keys(gristSchema);

    if (columnNames.length > 0) {
      gristCols = columnNames;
      populateUniqueKeySelector(columnNames);
      console.log("Colonnes Grist detectees:", columnNames);
    }
  },
  // onEditOptions : ouvre le panneau admin via l'engrenage Grist
  () => {
    openAdminPanel();
  }
);

// Mode initial
if (urlMode === "dev") {
  setMode("dev");
} else {
  setMode("public");
}

// Cacher le selecteur de mode par defaut (remplace par l'engrenage Grist)
const modeSelector = document.getElementById("mode-selector-wrapper");
if (modeSelector) {
  // Visible uniquement en mode dev
  modeSelector.style.display = urlMode === "dev" ? "" : "none";
}

// Listener dropdown mode (mode dev uniquement)
document.getElementById("mode-selector")?.addEventListener("change", (e) => {
  setMode(e.target.value);
});

// Bouton fermer overlay info (garde le mode admin actif)
document.getElementById("admin-close-btn")?.addEventListener("click", () => {
  const overlay = document.getElementById("admin-overlay");
  if (overlay) overlay.style.display = "none";
});

// Bouton retour a l'import (quitte le mode admin)
document.getElementById("admin-back-btn")?.addEventListener("click", () => {
  closeAdminPanel();
});

// =========================
// Upload fichier Excel
// =========================
document.getElementById("file-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  document.getElementById("file-name").textContent = file.name;
  hideValidationReport();

  parseExcelFile(file, ({ sheetNames, firstSheetData }) => {
    try {
      renderPreview(firstSheetData);
      if (firstSheetData.length > 0) {
        populateColumnList(firstSheetData[0]);
      }

      // Afficher le selecteur d'onglets si necessaire
      renderSheetSelector(sheetNames, (selectedSheets) => {
        // Re-render la preview du premier onglet selectionne
        const data = getExcelData();
        renderPreview(data);
        if (data.length > 0) {
          populateColumnList(data[0]);
        }
      });
    } catch (err) {
      console.error("Erreur lors de l'affichage:", err);
      document.getElementById("preview-container").textContent =
        "Erreur lors du rendu des donnees.";
    }
  });
});

// =========================
// Matching colonnes
// =========================
document.getElementById("match-columns-button").addEventListener("click", async () => {
  const excelData = getExcelData();
  const excelCols = excelData?.[0] ?? [];

  if (!excelCols.length || !gristCols.length) {
    console.warn("Impossible de faire le mapping : colonnes manquantes.");
    return;
  }

  const mapping = matchExcelToGrist(excelCols, gristCols);
  updateMappingUI(mapping);

  // Validation automatique
  const validation = await validateBeforeImport({ excelData, mapping });
  showValidationReport(validation);

  // Activer/desactiver les boutons d'import
  const importBtn = document.getElementById("launch-import-btn");
  const dryRunBtn = document.getElementById("dry-run-btn");
  if (importBtn) importBtn.disabled = !validation.valid;
  if (dryRunBtn) dryRunBtn.disabled = !validation.valid;
});

// =========================
// Import (reel ou dry-run)
// =========================
async function runImport(dryRun = false) {
  const { uniqueKeys } = await fetchImportRules();
  const excelData = getExcelData();
  const selectedSheets = getSelectedSheets();
  const fileName = getExcelFileName();
  const status = document.getElementById("import-status");

  if (!uniqueKeys || uniqueKeys.length === 0) {
    alert("Merci de selectionner au moins une colonne cle pour detecter les doublons.");
    return;
  }

  if (!excelData || excelData.length === 0) {
    alert("Merci de charger un fichier Excel valide.");
    return;
  }

  // Determiner les onglets a importer
  const sheetsToImport = selectedSheets.length > 0 ? selectedSheets : [null];
  const allSheetNames = getExcelSheetNames();

  // Si un seul onglet ou pas de multi-sheet, import direct
  if (sheetsToImport.length <= 1 || allSheetNames.length <= 1) {
    await importSingleSheet({ excelData, dryRun, fileName, sheetName: sheetsToImport[0] || allSheetNames[0] || "Sheet1" });
    return;
  }

  // Multi-sheet : import sequentiel
  const sheetsData = parseSheetsData(sheetsToImport);
  const totalStats = { added: 0, updated: 0, skipped: 0, errors: 0 };
  const allResume = [];
  const mergedRollbackData = { added: [], updated: [] };

  status.innerHTML = "";

  for (let s = 0; s < sheetsData.length; s++) {
    const { sheetName, data } = sheetsData[s];
    if (!data || data.length < 2) {
      allResume.push(`Onglet "${sheetName}" : vide, ignore.`);
      continue;
    }

    status.innerHTML += `<p>Import de l'onglet <strong>${sheetName}</strong> (${s + 1}/${sheetsData.length})...</p>`;

    const mapping = matchExcelToGrist(data[0], gristCols);

    showProgressBar();
    try {
      const result = await importToGrist({
        excelData: data,
        mapping,
        dryRun,
        onProgress: updateProgressBar,
      });

      totalStats.added += result.stats.added;
      totalStats.updated += result.stats.updated;
      totalStats.skipped += result.stats.skipped;
      totalStats.errors += result.stats.errors || 0;
      allResume.push(`--- Onglet: ${sheetName} ---`);
      allResume.push(...result.resume);

      // Fusionner les rollbackData de tous les onglets
      if (result.rollbackData) {
        mergedRollbackData.added.push(...(result.rollbackData.added || []));
        mergedRollbackData.updated.push(...(result.rollbackData.updated || []));
      }

      // Log par onglet (stats uniquement, sans rollback data)
      if (!dryRun) {
        await logImport({ fileName, sheetName, stats: result.stats, dryRun, rollbackData: null });
      }
    } catch (err) {
      console.error(`Erreur import onglet "${sheetName}":`, err);
      allResume.push(`Onglet "${sheetName}" : ERREUR - ${err.message}`);
    }
    hideProgressBar();
  }

  showImportResult({
    resume: allResume,
    stats: totalStats,
    dryRun,
    sheetName: sheetsToImport.join(", "),
  });

  // Log combine avec le rollback data fusionne de tous les onglets
  const hasRollbackData = mergedRollbackData.added.length > 0 || mergedRollbackData.updated.length > 0;
  if (!dryRun && hasRollbackData) {
    await logImport({
      fileName,
      sheetName: sheetsToImport.join(", "),
      stats: totalStats,
      dryRun,
      rollbackData: mergedRollbackData,
    });
    showRollbackButton();
  }
}

async function importSingleSheet({ excelData, dryRun, fileName, sheetName }) {
  const status = document.getElementById("import-status");
  status.textContent = dryRun ? "Simulation en cours..." : "Import en cours...";
  status.style.color = "#f59e0b";

  const mapping = matchExcelToGrist(excelData[0], gristCols);

  showProgressBar();
  try {
    const result = await importToGrist({
      excelData,
      mapping,
      dryRun,
      onProgress: updateProgressBar,
    });

    hideProgressBar();
    showImportResult({ ...result, sheetName });

    // Log
    if (!dryRun) {
      await logImport({ fileName, sheetName, stats: result.stats, dryRun, rollbackData: result.rollbackData });

      // Afficher le bouton rollback si import reel
      if (result.rollbackData) {
        showRollbackButton();
      }
    }
  } catch (err) {
    hideProgressBar();
    console.error("Echec de l'import:", err);
    status.textContent = `Echec : ${err.message}`;
    status.style.color = "#ef4444";
  }
}

// Bouton import reel
document.getElementById("launch-import-btn").addEventListener("click", () => runImport(false));

// Bouton dry-run
document.getElementById("dry-run-btn")?.addEventListener("click", () => runImport(true));

// =========================
// Rollback
// =========================
function showRollbackButton() {
  const btn = document.getElementById("rollback-btn");
  if (btn) btn.style.display = "";
}

document.getElementById("rollback-btn")?.addEventListener("click", async () => {
  const status = document.getElementById("import-status");

  if (!confirm("Etes-vous sur de vouloir annuler le dernier import ? Cette action est irreversible.")) {
    return;
  }

  const lastImport = await getLastImportForRollback();
  if (!lastImport || !lastImport.rollbackData) {
    alert("Aucun import annulable trouve.");
    return;
  }

  status.textContent = "Rollback en cours...";
  status.style.color = "#f59e0b";

  try {
    const result = await rollbackImport(lastImport.rollbackData);
    status.innerHTML = `<p style="color:#10b981"><strong>${result.message}</strong></p>`;
    document.getElementById("rollback-btn").style.display = "none";
  } catch (err) {
    console.error("Erreur rollback:", err);
    status.textContent = `Erreur rollback : ${err.message}`;
    status.style.color = "#ef4444";
  }
});
