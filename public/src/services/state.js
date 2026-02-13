// =========================
// state.js - Source de verite unique
// =========================

const state = {
  // Excel
  excelData: [],           // Donnees parsees de l'onglet actif [headers, ...rows]
  excelWorkbook: null,      // Workbook SheetJS complet
  excelSheetNames: [],      // Noms de tous les onglets
  selectedSheets: [],       // Onglets selectionnes pour l'import
  excelFileName: "",        // Nom du fichier charge

  // Grist
  gristRecords: [],         // Records actuels de la table liee
  gristSchema: {},          // { ColName: "Text" | "Date" | ... }
  currentTableId: null,     // ID de la table liee au widget

  // Mode
  currentMode: "public",    // "public" | "admin" | "dev"
  adminPanelOpen: false,    // true quand le panneau admin est ouvert via engrenage

  // Metadonnees colonnes Grist
  columnMetadata: {},       // { colId: { isFormula, type, refTable } }
  refCaches: {},            // { tableName: { "valeur visible": rowId } }

  // Import
  importInProgress: false,
  importProgress: { current: 0, total: 0 },
  lastImportResult: null,

  // Rollback (session-scoped)
  sessionId: crypto.randomUUID(),  // Unique par onglet/session navigateur
  lastRollbackData: null,          // Rollback data du dernier import de CETTE session
  lastRollbackLogId: null,         // ID du log IMPORT_LOG correspondant

  // Migrations (pour ne pas re-checker a chaque onRecords)
  rulesConfigMigrated: false,
  importLogMigrated: false,
};

// --- Getters ---
export function getExcelData() { return state.excelData; }
export function getExcelWorkbook() { return state.excelWorkbook; }
export function getExcelSheetNames() { return state.excelSheetNames; }
export function getSelectedSheets() { return state.selectedSheets; }
export function getExcelFileName() { return state.excelFileName; }
export function getGristRecords() { return state.gristRecords; }
export function getGristSchema() { return state.gristSchema; }
export function getCurrentTableId() { return state.currentTableId; }
export function getCurrentMode() { return state.currentMode; }
export function isAdminPanelOpen() { return state.adminPanelOpen; }
export function isImportInProgress() { return state.importInProgress; }
export function getImportProgress() { return state.importProgress; }
export function getLastImportResult() { return state.lastImportResult; }
export function getColumnMetadata() { return state.columnMetadata; }
export function getRefCaches() { return state.refCaches; }
export function getSessionId() { return state.sessionId; }
export function getLastRollbackData() { return state.lastRollbackData; }
export function getLastRollbackLogId() { return state.lastRollbackLogId; }
export function isRulesConfigMigrated() { return state.rulesConfigMigrated; }
export function isImportLogMigrated() { return state.importLogMigrated; }

// --- Setters ---
export function setExcelData(data) { state.excelData = data; }
export function setExcelWorkbook(wb) {
  state.excelWorkbook = wb;
  state.excelSheetNames = wb ? wb.SheetNames : [];
}
export function setSelectedSheets(sheets) { state.selectedSheets = sheets; }
export function setExcelFileName(name) { state.excelFileName = name; }
export function setGristRecords(records) { state.gristRecords = records; }
export function setGristSchema(schema) { state.gristSchema = schema; }
export function setCurrentTableId(id) { state.currentTableId = id; }
export function setCurrentMode(mode) { state.currentMode = mode; }
export function setAdminPanelOpen(open) { state.adminPanelOpen = open; }
export function setImportInProgress(inProgress) { state.importInProgress = inProgress; }
export function setImportProgress(current, total) {
  state.importProgress = { current, total };
}
export function setLastImportResult(result) { state.lastImportResult = result; }
export function setColumnMetadata(meta) { state.columnMetadata = meta; }
export function setLastRollbackData(data) { state.lastRollbackData = data; }
export function setLastRollbackLogId(id) { state.lastRollbackLogId = id; }
export function setRulesConfigMigrated(v) { state.rulesConfigMigrated = v; }
export function setImportLogMigrated(v) { state.importLogMigrated = v; }
export function setRefCache(tableName, cache) { state.refCaches[tableName] = cache; }
export function getRefCache(tableName) { return state.refCaches[tableName] || null; }

// --- Reset ---
export function resetExcelState() {
  state.excelData = [];
  state.excelWorkbook = null;
  state.excelSheetNames = [];
  state.selectedSheets = [];
  state.excelFileName = "";
}

export function resetImportState() {
  state.importInProgress = false;
  state.importProgress = { current: 0, total: 0 };
  state.lastImportResult = null;
  state.lastRollbackData = null;
  state.lastRollbackLogId = null;
}
