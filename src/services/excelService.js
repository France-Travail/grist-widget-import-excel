// =========================
// 📦 IMPORT
// =========================

import { setExcelData } from "./uiService.js"; // 🧠 stockage global des données

// =========================
// 📄 PARSE DU FICHIER EXCEL
// =========================

/**
 * Parse un fichier Excel (première feuille uniquement)
 * et normalise les lignes pour avoir la même longueur.
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

    // ✅ Corriger les lignes incomplètes pour avoir le même nombre de colonnes
    const maxLength = raw[0]?.length || 0;
    const fixed = raw.map((row) => {
      const newRow = Array.from(row);
      while (newRow.length < maxLength) {
        newRow.push("");
      }
      return newRow;
    });

    setExcelData(fixed); // 🧠 Stockage global dans le state UI
    callback(fixed); // ↩️ Envoi au callback pour suite de traitement
  };

  reader.readAsArrayBuffer(file);
}

// =========================
// 🧽 NORMALISATION DE CHAÎNE
// =========================

/**
 * Nettoie une chaîne pour matcher des noms de colonnes.
 * Supprime accents, espaces, caractères spéciaux, majuscules, etc.
 *
 * @param {string} str
 * @returns {string} chaîne normalisée
 */
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD") // enlève les accents
    .replace(/[\u0300-\u036f]/g, "") // caractères spéciaux Unicode
    .replace(/[^a-z0-9]/g, "") // tout sauf lettres/chiffres
    .replace(/_/g, ""); // optionnel : supprime les underscores
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
    norm: normalize(col),
  }));

  excelCols.forEach((col) => {
    const normCol = normalize(col);
    const match = normalizedGristCols.find((g) => g.norm === normCol);
    mapping[col] = match?.original || ""; // vide si aucun match
  });

  return mapping;
}
