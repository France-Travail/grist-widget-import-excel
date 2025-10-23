// =========================
// 📦 IMPORT
// =========================

import { setExcelData } from "./uiService.js"; // 🧠 stockage global des données
import { normalizeName } from "./utils.js"; // 🔧 normalisation unique

// =========================
// 📄 PARSE DU FICHIER EXCEL
// =========================

/**
 * Parse un fichier Excel (première feuille uniquement)
 * Nettoie les colonnes vides et normalise les lignes.
 *
 * @param {File} file - Fichier Excel sélectionné
 * @param {Function} callback - Fonction appelée avec les données corrigées
 */
export function parseExcelFile(file, callback) {
  const reader = new FileReader();

  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const raw = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (!raw.length) {
      console.warn("⚠️ Fichier Excel vide ou illisible");
      return callback([]);
    }

    // === Étape 1 : Nettoyer les headers ===
    const header = raw[0].map((h) => (h ? String(h).trim() : ""));
    const validIndexes = header
      .map((h, i) => (h !== "" ? i : null))
      .filter((i) => i !== null);

    const cleaned = raw.map((row) => validIndexes.map((i) => row[i] ?? ""));

    // === Étape 2 : Normaliser la longueur des lignes ===
    const maxLength = cleaned[0]?.length || 0;
    const fixed = cleaned.map((row) => {
      const newRow = Array.from(row);
      while (newRow.length < maxLength) newRow.push("");
      return newRow;
    });

    setExcelData(fixed); // 🧠 Stockage global dans le state UI
    callback(fixed); // ↩️ Envoi au callback pour suite de traitement
  };

  reader.readAsArrayBuffer(file);
}

// =========================
// 🔁 MATCHING COLONNES Excel ↔ Grist
// =========================

/**
 * Essaie de faire correspondre chaque colonne Excel avec une colonne Grist
 * via comparaison normalisée (insensible aux accents, casses, etc.)
 *
 * @param {string[]} excelCols - Titres des colonnes du fichier Excel
 * @param {string[]} gristCols - Titres des colonnes de Grist
 * @returns {Object} mapping Excel → Grist
 */
export function matchExcelToGrist(excelCols, gristCols) {
  const mapping = {};

  const normalizedGristCols = gristCols.map((col) => ({
    original: col,
    norm: normalizeName(col),
  }));

  excelCols.forEach((col) => {
    if (!col || col.trim() === "") return; // ⚠️ skip colonnes vides
    const normCol = normalizeName(col);
    const match = normalizedGristCols.find((g) => g.norm === normCol);
    mapping[col] = match?.original || ""; // vide si aucun match
  });

  // Debug clair 🔎
  console.group("📊 DEBUG MATCHING Excel ↔ Grist");
  console.table(
    excelCols.map((excelCol) => ({
      "Excel column": excelCol || "(colonne vide)",
      Normalized: normalizeName(excelCol || ""),
      "Matched Grist column": mapping[excelCol] || "❌ Aucun match",
    }))
  );
  console.groupEnd();

  return mapping;
}


