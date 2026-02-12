// =========================
// excelService.js - Parsing Excel multi-onglets
// =========================

import {
  setExcelData, setExcelWorkbook, setExcelFileName, setSelectedSheets,
  getExcelWorkbook
} from "./state.js";
import { normalizeName } from "./utils.js";

/**
 * Parse un fichier Excel et stocke le workbook complet.
 * Retourne la liste des noms d'onglets.
 *
 * @param {File} file - Fichier Excel selectionne
 * @param {Function} callback - Appelee avec { sheetNames: string[], firstSheetData: any[][] }
 */
export function parseExcelFile(file, callback) {
  const reader = new FileReader();

  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    // SheetJS gere automatiquement .xlsx, .xls et .csv
    const workbook = XLSX.read(data, { type: "array", codepage: 65001 });

    setExcelWorkbook(workbook);
    setExcelFileName(file.name);

    const sheetNames = workbook.SheetNames;

    if (!sheetNames.length) {
      console.warn("Fichier Excel vide ou illisible");
      callback({ sheetNames: [], firstSheetData: [] });
      return;
    }

    // Par defaut, selectionne tous les onglets
    setSelectedSheets([...sheetNames]);

    // Parse le premier onglet pour la preview
    const firstSheetData = parseSheet(workbook, sheetNames[0]);
    setExcelData(firstSheetData);

    callback({ sheetNames, firstSheetData });
  };

  reader.readAsArrayBuffer(file);
}

/**
 * Parse un onglet specifique du workbook en memoire.
 *
 * @param {Object} workbook - Workbook SheetJS
 * @param {string} sheetName - Nom de l'onglet
 * @returns {any[][]} Donnees nettoyees [headers, ...rows]
 */
export function parseSheet(workbook, sheetName) {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];

  const raw = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (!raw.length) return [];

  // Nettoyer les headers
  const header = raw[0].map((h) => (h ? String(h).trim() : ""));
  const validIndexes = header
    .map((h, i) => (h !== "" ? i : null))
    .filter((i) => i !== null);

  const cleaned = raw.map((row) => validIndexes.map((i) => row[i] ?? ""));

  // Normaliser la longueur des lignes
  const maxLength = cleaned[0]?.length || 0;
  const fixed = cleaned.map((row) => {
    const newRow = Array.from(row);
    while (newRow.length < maxLength) newRow.push("");
    return newRow;
  });

  return fixed;
}

/**
 * Retourne les donnees parsees pour les onglets selectionnes.
 *
 * @param {string[]} sheetNames - Noms des onglets a parser
 * @returns {{ sheetName: string, data: any[][] }[]}
 */
export function parseSheetsData(sheetNames) {
  const workbook = getExcelWorkbook();
  if (!workbook) return [];

  return sheetNames.map((name) => ({
    sheetName: name,
    data: parseSheet(workbook, name),
  }));
}

/**
 * Matching colonnes Excel <-> Grist via normalisation.
 *
 * @param {string[]} excelCols - Titres des colonnes Excel
 * @param {string[]} gristCols - Titres des colonnes Grist
 * @returns {Object} mapping Excel -> Grist
 */
export function matchExcelToGrist(excelCols, gristCols) {
  const mapping = {};

  const normalizedGristCols = gristCols.map((col) => ({
    original: col,
    norm: normalizeName(col),
  }));

  excelCols.forEach((col) => {
    if (!col || col.trim() === "") return;
    const normCol = normalizeName(col);
    const match = normalizedGristCols.find((g) => g.norm === normCol);
    mapping[col] = match?.original || "";
  });

  console.group("Matching Excel <-> Grist");
  console.table(
    excelCols.map((excelCol) => ({
      "Excel": excelCol || "(vide)",
      "Normalise": normalizeName(excelCol || ""),
      "Grist": mapping[excelCol] || "Aucun match",
    }))
  );
  console.groupEnd();

  return mapping;
}
