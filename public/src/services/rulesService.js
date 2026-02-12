// =========================
// rulesService.js - Lecture RULES_CONFIG + metadonnees colonnes
// =========================

import { normalizeName, cleanLabel } from "./utils.js";

/**
 * Recupere les regles depuis RULES_CONFIG.
 * Supporte la cle composite (plusieurs is_key=true).
 *
 * @returns {Promise<{rules: Object, uniqueKeys: string[], uniqueKey: string|null}>}
 */
export async function fetchImportRules(tableName = "RULES_CONFIG") {
  try {
    const result = await grist.docApi.fetchTable(tableName);
    const rules = {};
    const uniqueKeys = [];

    const nbRows = result.col_name?.length || 0;

    for (let i = 0; i < nbRows; i++) {
      const rawColName = result.col_name[i];
      const rule = result.rule[i];
      const isKey = result.is_key?.[i];

      if (!rawColName || !rule) continue;

      const normalized = normalizeName(rawColName);
      const clean = cleanLabel(rawColName);

      if (isKey) {
        uniqueKeys.push(normalized);
      }

      rules[normalized] = {
        rule,
        original: rawColName,
        label: clean,
      };
    }

    if (uniqueKeys.length === 0) {
      console.warn("Aucune cle unique definie dans RULES_CONFIG !");
    }

    // Compatibilite ascendante : uniqueKey = premiere cle ou null
    const uniqueKey = uniqueKeys.length > 0 ? uniqueKeys[0] : null;

    return { rules, uniqueKeys, uniqueKey };
  } catch (e) {
    console.error("Erreur lors du chargement des regles :", e);
    return { rules: {}, uniqueKeys: [], uniqueKey: null };
  }
}

/**
 * Recupere les metadonnees des colonnes Grist (formules, types reels, references).
 * Utilise la table interne _grist_Tables_column.
 *
 * @param {string} tableId - ID de la table cible
 * @returns {Promise<Object>} { colId: { isFormula, type, refTable } }
 */
export async function fetchColumnMetadata(tableId) {
  try {
    // Recuperer les metadonnees des tables pour trouver le tableRef
    const tablesData = await grist.docApi.fetchTable("_grist_Tables");
    const tableIdx = tablesData.tableId?.indexOf(tableId);
    if (tableIdx === -1 || tableIdx === undefined) {
      console.warn("Table non trouvee dans _grist_Tables:", tableId);
      return {};
    }
    const tableRef = tablesData.id[tableIdx];

    // Recuperer les colonnes de cette table
    const colsData = await grist.docApi.fetchTable("_grist_Tables_column");
    const metadata = {};

    for (let i = 0; i < (colsData.colId?.length || 0); i++) {
      // Filtrer par parentId = tableRef
      if (colsData.parentId[i] !== tableRef) continue;

      const colId = colsData.colId[i];
      const isFormula = colsData.isFormula?.[i] || false;
      const formula = colsData.formula?.[i] || "";
      const colType = colsData.type?.[i] || "Any";

      // Determiner si c'est une colonne Reference
      let refTable = null;
      if (colType.startsWith("Ref:")) {
        refTable = colType.replace("Ref:", "");
      } else if (colType.startsWith("RefList:")) {
        refTable = colType.replace("RefList:", "");
      }

      metadata[colId] = {
        isFormula: isFormula && formula !== "",
        type: colType,
        refTable,
        formula,
      };
    }

    return metadata;
  } catch (err) {
    console.warn("Impossible de lire les metadonnees colonnes:", err);
    return {};
  }
}
