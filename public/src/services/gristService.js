// =========================
// gristService.js - Communication Grist + import
// =========================

import { fetchImportRules, fetchColumnMetadata } from "./rulesService.js";
import { normalizeName } from "./utils.js";
import { ensureRulesTableExists } from "./rulesSetupService.js";
import {
  setGristRecords, setGristSchema, setCurrentTableId,
  getGristRecords, getGristSchema, getCurrentTableId,
  setImportInProgress, setImportProgress,
  setColumnMetadata, getColumnMetadata,
  setRefCache, getRefCache,
  getSessionId, setLastRollbackData, setLastRollbackLogId,
} from "./state.js";

// =========================
// Init Grist
// =========================
export function initGristListener(onRecordsReceived, onEditOptionsCallback) {
  grist.ready({
    requiredAccess: "full",
    onEditOptions: onEditOptionsCallback || undefined,
  });

  grist.on("message", (e) => {
    if (e.tableId) setCurrentTableId(e.tableId);
  });

  grist.onRecords(async (records) => {
    setGristRecords(records || []);
    const schema = await detectColumnTypesFromRecords(records || []);
    setGristSchema(schema);

    // Charger les metadonnees colonnes (formules, references)
    const tableId = getCurrentTableId();
    if (tableId) {
      const meta = await fetchColumnMetadata(tableId);
      setColumnMetadata(meta);
    }

    const rulesOk = await ensureRulesTableExists();
    if (!rulesOk) {
      console.warn("Table RULES_CONFIG manquante.");
      return;
    }

    onRecordsReceived?.(records || []);
  });
}

// Re-exports
export { getGristSchema as getGristColumnTypes, getCurrentTableId, getGristRecords as getCurrentGristData };

// =========================
// Detection types colonnes
// =========================
async function detectColumnTypesFromRecords(records) {
  const types = {};
  // Utiliser les metadonnees si disponibles
  const tableId = getCurrentTableId();
  if (tableId) {
    try {
      const meta = await fetchColumnMetadata(tableId);
      for (const [colId, info] of Object.entries(meta)) {
        if (colId === "id" || colId === "manualSort") continue;
        const t = info.type;
        if (t.startsWith("Ref:") || t.startsWith("RefList:")) types[colId] = t;
        else if (t === "Date" || t === "DateTime") types[colId] = "Date";
        else if (t === "Int" || t === "Numeric") types[colId] = "Numeric";
        else if (t === "Bool") types[colId] = "Bool";
        else if (t === "Choice" || t === "ChoiceList") types[colId] = t;
        else types[colId] = "Text";
      }
      if (Object.keys(types).length > 0) return types;
    } catch (e) {
      // Fallback a la detection par valeur
    }
  }

  if (!records || records.length === 0) {
    return await getColumnTypesFromEmptyTable();
  }
  const first = records[0];
  for (const [key, value] of Object.entries(first)) {
    if (key === "id" || key === "manualSort") continue;
    if (value === null || value === undefined) types[key] = "Unknown";
    else if (value instanceof Date) types[key] = "Date";
    else if (typeof value === "boolean") types[key] = "Bool";
    else if (typeof value === "number") types[key] = "Numeric";
    else types[key] = "Text";
  }
  return types;
}

async function getColumnTypesFromEmptyTable() {
  try {
    const tableId = getCurrentTableId();
    const tableInfo = await grist.docApi.fetchTable(tableId);
    const types = {};
    for (const colName of Object.keys(tableInfo)) {
      if (colName === "id" || colName === "manualSort") continue;
      types[colName] = "Text";
    }
    return types;
  } catch (error) {
    console.warn("Impossible de recuperer les colonnes de la table vide:", error);
    return {};
  }
}

// =========================
// Reference lookup
// =========================

/**
 * Construit un cache de lookup pour une table referencee.
 * Mappe la colonne visible (premiere colonne texte) vers l'ID.
 */
async function buildRefCache(refTableId) {
  const existing = getRefCache(refTableId);
  if (existing) return existing;

  try {
    const tableData = await grist.docApi.fetchTable(refTableId);
    const ids = tableData.id || [];
    const cache = {};

    // Trouver la premiere colonne non-id pour le lookup
    const cols = Object.keys(tableData).filter(c => c !== "id" && c !== "manualSort");
    if (cols.length === 0) return cache;

    // Utiliser la premiere colonne comme colonne de display
    const displayCol = cols[0];
    for (let i = 0; i < ids.length; i++) {
      const val = tableData[displayCol][i];
      if (val !== null && val !== undefined && val !== "") {
        cache[String(val).trim().toLowerCase()] = ids[i];
      }
    }

    setRefCache(refTableId, cache);
    return cache;
  } catch (err) {
    console.warn(`Impossible de charger la table reference ${refTableId}:`, err);
    return {};
  }
}

/**
 * Resout une valeur Excel en ID de reference Grist.
 */
async function resolveReference(value, refTableId) {
  if (value === null || value === undefined || value === "") return 0;

  // Si c'est deja un nombre (ID direct), le garder
  if (typeof value === "number") return value;

  const cache = await buildRefCache(refTableId);
  const key = String(value).trim().toLowerCase();
  return cache[key] || 0; // 0 = reference vide dans Grist
}

// =========================
// Colonnes formules
// =========================

/**
 * Retourne le Set des noms de colonnes qui sont des formules.
 */
export function getFormulaColumns() {
  const meta = getColumnMetadata();
  const formulas = new Set();
  for (const [colId, info] of Object.entries(meta)) {
    if (info.isFormula) formulas.add(colId);
  }
  return formulas;
}

/**
 * Retourne les colonnes Reference avec leur table cible.
 */
export function getReferenceColumns() {
  const meta = getColumnMetadata();
  const refs = {};
  for (const [colId, info] of Object.entries(meta)) {
    if (info.refTable) refs[colId] = { type: info.type, refTable: info.refTable };
  }
  return refs;
}

// =========================
// Validation pre-import
// =========================
export async function validateBeforeImport({ excelData, mapping }) {
  const warnings = [];
  const errors = [];
  const gristColTypes = getGristSchema();
  const formulaCols = getFormulaColumns();

  if (!excelData || excelData.length < 2) {
    errors.push("Le fichier est vide ou ne contient que des en-tetes.");
    return { valid: false, warnings, errors };
  }

  const header = excelData[0];
  const rows = excelData.slice(1);

  const mappedCount = Object.values(mapping).filter(Boolean).length;
  if (mappedCount === 0) {
    errors.push("Aucune colonne du fichier ne correspond a une colonne Grist.");
    return { valid: false, warnings, errors };
  }

  // Avertir sur les colonnes formules mappees
  const formulaMapped = [];
  for (const [excelCol, gristCol] of Object.entries(mapping)) {
    if (gristCol && formulaCols.has(gristCol)) {
      formulaMapped.push(gristCol);
    }
  }
  if (formulaMapped.length > 0) {
    warnings.push(`${formulaMapped.length} colonne(s) formule exclue(s) de l'import : ${formulaMapped.join(", ")}`);
  }

  // Verifier types par echantillon
  const sampleSize = Math.min(rows.length, 50);
  let invalidDates = 0;
  let invalidNumbers = 0;

  const dateColIndexes = [];
  const numericColIndexes = [];

  header.forEach((col, idx) => {
    const gristCol = mapping[col];
    if (!gristCol) return;
    const type = gristColTypes[gristCol];
    if (type === "Date") dateColIndexes.push({ idx, col });
    if (type === "Numeric" || type === "Int") numericColIndexes.push({ idx, col });
  });

  for (let i = 0; i < sampleSize; i++) {
    const row = rows[i];
    for (const { idx } of dateColIndexes) {
      const val = row[idx];
      if (val === "" || val == null) continue;
      if (typeof val === "number") continue;
      if (typeof val === "string" && val.trim() && !isDateParseable(val.trim())) invalidDates++;
    }
    for (const { idx } of numericColIndexes) {
      const val = row[idx];
      if (val === "" || val == null) continue;
      if (typeof val === "number") continue;
      if (typeof val === "string" && isNaN(Number(val.trim()))) invalidNumbers++;
    }
  }

  if (invalidDates > 0) warnings.push(`${invalidDates} valeur(s) de date au format non reconnu.`);
  if (invalidNumbers > 0) warnings.push(`${invalidNumbers} valeur(s) non numerique(s) dans des colonnes numeriques.`);

  const unmapped = Object.entries(mapping).filter(([, v]) => !v).map(([k]) => k);
  if (unmapped.length > 0) warnings.push(`${unmapped.length} colonne(s) sans correspondance : ${unmapped.join(", ")}`);

  return { valid: errors.length === 0, warnings, errors };
}

function isDateParseable(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s);
}

// =========================
// Import principal
// =========================

/**
 * @param {Object} params
 * @param {any[][]} params.excelData
 * @param {Object} params.mapping
 * @param {boolean} [params.dryRun=false]
 * @param {Function} [params.onProgress]
 * @returns {Promise<{ resume, stats, dryRun, rollbackData }>}
 */
export async function importToGrist({ excelData, mapping, dryRun = false, onProgress }) {
  const currentTableId = getCurrentTableId();
  if (!currentTableId) {
    throw new Error("Impossible d'identifier la table cible.");
  }

  setImportInProgress(true);

  try {
    // 1) Regles + cles composites/fallback
    const { rules: rawRules, uniqueKeys, keyMode } = await fetchImportRules();
    if (!uniqueKeys || uniqueKeys.length === 0) {
      throw new Error("Aucune cle unique definie dans RULES_CONFIG.");
    }
    console.log(`Mode cles: ${keyMode}, cles: [${uniqueKeys.join(", ")}]`);

    // 2) Colonnes Grist
    const gristColTypes = getGristSchema();
    const gristCols = Object.keys(gristColTypes);
    const normToGristCol = Object.fromEntries(
      gristCols.map((c) => [normalizeName(c), c])
    );

    // 3) Colonnes formules (a exclure)
    const formulaCols = getFormulaColumns();

    // 4) Colonnes Reference
    const refCols = getReferenceColumns();

    // 5) Normaliser les regles
    const normalizedRules = {};
    const looksLikeNewShape =
      rawRules && Object.values(rawRules).length > 0 &&
      typeof Object.values(rawRules)[0] === "object" &&
      "rule" in Object.values(rawRules)[0];

    if (looksLikeNewShape) {
      for (const [norm, data] of Object.entries(rawRules)) {
        const gristCol = normToGristCol[norm] ||
          (data.original && normToGristCol[normalizeName(data.original)]);
        if (!gristCol) continue;
        if (formulaCols.has(gristCol)) continue; // Exclure formules
        normalizedRules[norm] = { rule: data.rule, gristCol };
      }
    } else {
      for (const [key, rule] of Object.entries(rawRules || {})) {
        const norm = normalizeName(key);
        const gristCol = normToGristCol[norm];
        if (!gristCol) continue;
        if (formulaCols.has(gristCol)) continue;
        normalizedRules[norm] = { rule, gristCol };
      }
    }

    // 6) Resoudre les cles composites vers colonnes Grist
    const uniqueKeyGristCols = uniqueKeys.map(norm => {
      const col = normToGristCol[norm];
      if (!col) throw new Error(`Cle unique "${norm}" invalide (colonne inconnue).`);
      return { norm, gristCol: col };
    });

    // 7) Donnees Excel
    const header = excelData?.[0] || [];
    const rows = (excelData || []).slice(1);
    const total = rows.length;

    // 8) Index Grist par cle (composite ou fallback)
    const gristData = getGristRecords();
    const gristIndex = {};         // Pour mode composite
    const gristFallbackIndexes = {}; // Pour mode fallback: { norm: { val: rec } }

    if (keyMode === "fallback") {
      // Mode fallback : un index par cle
      for (const { norm, gristCol } of uniqueKeyGristCols) {
        gristFallbackIndexes[norm] = {};
        for (const rec of gristData) {
          const val = rec[gristCol];
          const key = val === null || val === undefined ? "" : String(val).trim();
          if (key) gristFallbackIndexes[norm][key] = rec;
        }
      }
    } else {
      // Mode composite : une seule cle jointe
      for (const rec of gristData) {
        const keyParts = uniqueKeyGristCols.map(({ gristCol }) => {
          const val = rec[gristCol];
          return val === null || val === undefined ? "" : String(val).trim();
        });
        const compositeKey = keyParts.join("|||");
        if (compositeKey && !keyParts.every(p => p === "")) {
          gristIndex[compositeKey] = rec;
        }
      }
    }

    // 9) Colonnes Date
    const gristColIsDate = new Set(
      gristCols.filter((c) => {
        const t = gristColTypes[c];
        return t === "Date" || t === "DateTime";
      })
    );

    // 10) Detecter les colonnes Grist absentes du mapping Excel
    const mappedGristCols = new Set(Object.values(mapping || {}).filter(Boolean));
    const unmappedGristCols = gristCols.filter(c =>
      c !== "id" && c !== "manualSort" && !formulaCols.has(c) && !mappedGristCols.has(c)
    );

    // 11) Traitement ligne par ligne
    const actions = [];
    const resume = [];
    const stats = { added: 0, updated: 0, skipped: 0, errors: 0 };
    const rollbackData = { added: [], updated: [] }; // Pour rollback
    let emptyRowsCount = 0;       // Lignes completement vides (pas de donnees)
    let noKeyRowsCount = 0;       // Lignes avec donnees mais sans cle

    if (unmappedGristCols.length > 0) {
      resume.push(`WARNING: ${unmappedGristCols.length} colonne(s) Grist sans correspondance Excel (ignorees) : ${unmappedGristCols.join(", ")}`);
      console.warn("Colonnes Grist non mappees:", unmappedGristCols);
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (onProgress) onProgress(i + 1, total);
      setImportProgress(i + 1, total);

      // Construire la ligne normalisee
      const excelRowByNorm = Object.create(null);
      header.forEach((col, idx) => {
        excelRowByNorm[normalizeName(col)] = row[idx];
      });

      const lineByNorm = Object.create(null);
      for (const [excelCol, gristCol] of Object.entries(mapping || {})) {
        if (!gristCol) continue;
        if (formulaCols.has(gristCol)) continue; // Skip formules
        const val = excelRowByNorm[normalizeName(excelCol)];
        const gristColNorm = normalizeName(gristCol);

        let finalVal = val;

        // Resoudre les references
        if (refCols[gristCol]) {
          finalVal = await resolveReference(val, refCols[gristCol].refTable);
        } else if (gristColIsDate.has(gristCol)) {
          const nd = normalizeDate(val);
          if (nd !== null) finalVal = nd;
        }

        lineByNorm[gristColNorm] = finalVal;
      }

      // Recherche de doublon (composite ou fallback)
      let existing = null;
      let keyParts = [];
      let usedKeyLabel = "";

      if (keyMode === "fallback") {
        // Mode fallback : essayer chaque cle dans l'ordre de priorite
        for (const { norm, gristCol } of uniqueKeyGristCols) {
          const val = lineByNorm[norm];
          const key = val === null || val === undefined ? "" : String(val).trim();
          if (key && gristFallbackIndexes[norm]?.[key]) {
            existing = gristFallbackIndexes[norm][key];
            keyParts = [key];
            usedKeyLabel = gristCol;
            break;
          }
        }

        // Verifier si TOUTES les cles sont vides
        const allKeysEmpty = uniqueKeyGristCols.every(({ norm }) => {
          const val = lineByNorm[norm];
          return val === null || val === undefined || String(val).trim() === "";
        });

        if (allKeysEmpty) {
          // Distinguer ligne completement vide vs ligne avec donnees mais sans cle
          const hasAnyData = Object.values(lineByNorm).some(v =>
            v !== null && v !== undefined && v !== "" && String(v).trim() !== ""
          );
          if (hasAnyData) {
            noKeyRowsCount++;
          } else {
            emptyRowsCount++;
          }
          stats.skipped++;
          continue;
        }
      } else {
        // Mode composite : cle jointe classique
        keyParts = uniqueKeyGristCols.map(({ norm }) => {
          const val = lineByNorm[norm];
          return val === null || val === undefined ? "" : String(val).trim();
        });
        const compositeKey = keyParts.join("|||");

        if (keyParts.every(p => p === "")) {
          // Distinguer ligne completement vide vs ligne avec donnees mais sans cle
          const hasAnyData = Object.values(lineByNorm).some(v =>
            v !== null && v !== undefined && v !== "" && String(v).trim() !== ""
          );
          if (hasAnyData) {
            noKeyRowsCount++;
          } else {
            emptyRowsCount++;
          }
          stats.skipped++;
          continue;
        }

        existing = gristIndex[compositeKey];
        usedKeyLabel = uniqueKeyGristCols.map(k => k.gristCol).join(" + ");
      }

      if (existing) {
        // UPDATE
        const updates = {};
        const previousValues = {}; // Pour rollback
        let hasUpdate = false;

        for (const [norm, { rule, gristCol }] of Object.entries(normalizedRules)) {
          if (rule === "ignore" || rule === "match") continue;

          const excelVal = lineByNorm[norm];
          const gristVal = existing[gristCol];

          if (rule === "overwrite") {
            if (excelVal !== undefined && excelVal !== null && excelVal !== "" && !areEqual(excelVal, gristVal)) {
              previousValues[gristCol] = gristVal;
              updates[gristCol] = gristColIsDate.has(gristCol) ? (normalizeDate(excelVal) || excelVal) : excelVal;
              hasUpdate = true;
            }
          } else if (rule === "update_if_newer") {
            if (excelVal) {
              const exDate = new Date(excelVal);
              const grDate = new Date(gristVal);
              if (!isNaN(exDate) && (isNaN(grDate) || exDate > grDate)) {
                previousValues[gristCol] = gristVal;
                updates[gristCol] = gristColIsDate.has(gristCol) ? (normalizeDate(excelVal) || excelVal) : excelVal;
                hasUpdate = true;
              }
            }
          } else if (rule === "fill_if_empty" || rule === "preserve_if_not_empty") {
            if ((gristVal === null || gristVal === undefined || gristVal === "") &&
                excelVal !== null && excelVal !== undefined && excelVal !== "") {
              previousValues[gristCol] = gristVal;
              updates[gristCol] = gristColIsDate.has(gristCol) ? (normalizeDate(excelVal) || excelVal) : excelVal;
              hasUpdate = true;
            }
          } else if (rule === "append_if_different") {
            if (excelVal !== null && excelVal !== undefined && excelVal !== "" && !areEqual(excelVal, gristVal)) {
              previousValues[gristCol] = gristVal;
              const sep = gristVal ? " | " : "";
              updates[gristCol] = (gristVal || "") + sep + excelVal;
              hasUpdate = true;
            }
          }
        }

        const keyInfo = keyMode === "fallback" ? `${usedKeyLabel}=${keyParts.join(" | ")}` : keyParts.join(" | ");

        if (hasUpdate) {
          actions.push(["UpdateRecord", currentTableId, existing.id, updates]);
          rollbackData.updated.push({ id: existing.id, previousValues });
          resume.push(`Ligne ${i + 1} : UPDATE [${keyInfo}]`);
          stats.updated++;
        } else {
          resume.push(`Ligne ${i + 1} : IGNORE [${keyInfo}]`);
          stats.skipped++;
        }
      } else {
        // ADD
        const newRecord = {};
        for (const [norm, { gristCol }] of Object.entries(normalizedRules)) {
          if (norm in lineByNorm) {
            const excelVal = lineByNorm[norm];
            newRecord[gristCol] = gristColIsDate.has(gristCol) ? (normalizeDate(excelVal) || excelVal) : excelVal;
          }
        }
        actions.push(["AddRecord", currentTableId, null, newRecord]);
        resume.push(`Ligne ${i + 1} : ADD [${keyParts.join(" | ")}]`);
        stats.added++;
      }
    }

    // Resume des lignes exclues (pas de detail ligne par ligne pour le bruit)
    if (emptyRowsCount > 0) {
      resume.push(`${emptyRowsCount} ligne(s) vide(s) en fin de fichier exclue(s)`);
    }
    if (noKeyRowsCount > 0) {
      const keyLabels = uniqueKeyGristCols.map(k => k.gristCol).join(keyMode === "fallback" ? " / " : " + ");
      resume.push(`${noKeyRowsCount} ligne(s) ignoree(s) : donnees presentes mais cle "${keyLabels}" manquante`);
    }

    // 12) Appliquer par batch avec gestion d'erreur par batch
    if (actions.length > 0 && !dryRun) {
      const BATCH_SIZE = 100;
      const addedIds = [];

      for (let b = 0; b < actions.length; b += BATCH_SIZE) {
        const batch = actions.slice(b, b + BATCH_SIZE);
        try {
          const result = await grist.docApi.applyUserActions(batch);
          // Collecter les IDs des records ajoutes pour le rollback
          if (result && result.retValues) {
            for (const ret of result.retValues) {
              if (typeof ret === "number") addedIds.push(ret);
            }
          }
        } catch (err) {
          const startLine = b + 1;
          const endLine = Math.min(b + BATCH_SIZE, actions.length);
          console.error(`Erreur batch lignes ${startLine}-${endLine}:`, err);
          resume.push(`ERREUR batch lignes ${startLine}-${endLine}: ${err.message}`);
          stats.errors += batch.length;
          // Continuer avec le batch suivant
        }
      }
      rollbackData.added = addedIds;
      console.log(`${actions.length} action(s) envoyee(s) a Grist (${stats.errors} erreur(s))`);
    } else if (dryRun) {
      console.log(`[DRY-RUN] ${actions.length} action(s) simulee(s)`);
    }

    // Ajuster les stats : retirer les lignes vides du compteur "ignorees"
    stats.emptyRows = emptyRowsCount;
    stats.noKeyRows = noKeyRowsCount;
    stats.skipped = stats.skipped - emptyRowsCount - noKeyRowsCount;

    return { resume, stats, dryRun, rollbackData };
  } finally {
    setImportInProgress(false);
  }
}

// =========================
// Rollback
// =========================

/**
 * Annule un import en supprimant les records ajoutes et restaurant les modifies.
 * Valide l'existence des IDs avant d'agir pour eviter les erreurs.
 * @param {Object} rollbackData - { added: number[], updated: { id, previousValues }[] }
 * @returns {Promise<{ message: string, count: number, warnings: string[] }>}
 */
export async function rollbackImport(rollbackData) {
  const currentTableId = getCurrentTableId();
  if (!currentTableId) throw new Error("Table cible introuvable.");

  // Valider que les records existent encore dans Grist
  const currentData = await grist.docApi.fetchTable(currentTableId);
  const existingIds = new Set(currentData.id || []);
  const warnings = [];

  const actions = [];

  // Supprimer les records ajoutes (seulement ceux qui existent encore)
  if (rollbackData.added?.length > 0) {
    for (const id of rollbackData.added) {
      if (existingIds.has(id)) {
        actions.push(["RemoveRecord", currentTableId, id]);
      } else {
        warnings.push(`Record #${id} deja supprime, ignore.`);
      }
    }
  }

  // Restaurer les valeurs precedentes des records modifies
  if (rollbackData.updated?.length > 0) {
    for (const { id, previousValues } of rollbackData.updated) {
      if (Object.keys(previousValues).length > 0) {
        if (existingIds.has(id)) {
          actions.push(["UpdateRecord", currentTableId, id, previousValues]);
        } else {
          warnings.push(`Record #${id} supprime, restauration impossible.`);
        }
      }
    }
  }

  if (actions.length === 0 && warnings.length === 0) {
    return { message: "Rien a annuler.", count: 0, warnings };
  }

  if (actions.length > 0) {
    const BATCH_SIZE = 100;
    for (let b = 0; b < actions.length; b += BATCH_SIZE) {
      await grist.docApi.applyUserActions(actions.slice(b, b + BATCH_SIZE));
    }
  }

  // Marquer le log comme rolled back
  await markImportAsRolledBack();

  // Vider le rollback data en memoire
  setLastRollbackData(null);
  setLastRollbackLogId(null);

  const deletedCount = rollbackData.added?.length || 0;
  const restoredCount = rollbackData.updated?.length || 0;
  return {
    message: `Rollback termine : ${deletedCount} suppression(s), ${restoredCount} restauration(s).`,
    count: actions.length,
    warnings,
  };
}

/**
 * Marque le dernier import de cette session comme rolled back dans IMPORT_LOG.
 */
async function markImportAsRolledBack() {
  try {
    const { getLastRollbackLogId } = await import("./state.js");
    const logId = getLastRollbackLogId();
    if (!logId) return;

    await grist.docApi.applyUserActions([
      ["UpdateRecord", "IMPORT_LOG", logId, { rolled_back: true, rollback_data: "" }],
    ]);
  } catch (err) {
    console.warn("Impossible de marquer l'import comme annule:", err);
  }
}

// =========================
// Import Log (enrichi avec rollback data)
// =========================
export async function logImport({ fileName, sheetName, stats, dryRun, rollbackData }) {
  try {
    const allTables = await grist.docApi.listTables();
    if (!allTables.includes("IMPORT_LOG")) {
      await grist.docApi.applyUserActions([
        ["AddTable", "IMPORT_LOG", [
          { id: "timestamp", type: "Text" },
          { id: "file_name", type: "Text" },
          { id: "sheet_name", type: "Text" },
          { id: "rows_added", type: "Int" },
          { id: "rows_updated", type: "Int" },
          { id: "rows_skipped", type: "Int" },
          { id: "rows_errors", type: "Int" },
          { id: "dry_run", type: "Bool" },
          { id: "rollback_data", type: "Text" },
          { id: "session_id", type: "Text" },
          { id: "rolled_back", type: "Bool" },
        ]],
      ]);
    } else {
      // Migration : ajouter les nouvelles colonnes si absentes
      await migrateImportLogColumns();
    }

    const result = await grist.docApi.applyUserActions([
      ["AddRecord", "IMPORT_LOG", null, {
        timestamp: new Date().toISOString(),
        file_name: fileName || "inconnu",
        sheet_name: sheetName || "inconnu",
        rows_added: stats.added,
        rows_updated: stats.updated,
        rows_skipped: stats.skipped,
        rows_errors: stats.errors || 0,
        dry_run: dryRun || false,
        rollback_data: rollbackData ? JSON.stringify(rollbackData) : "",
        session_id: getSessionId(),
        rolled_back: false,
      }],
    ]);

    // Stocker le rollback data en memoire pour cette session
    if (rollbackData && !dryRun) {
      setLastRollbackData(rollbackData);
      // Recuperer l'ID du log cree
      if (result?.retValues?.[0]) {
        setLastRollbackLogId(result.retValues[0]);
      }
    }
  } catch (err) {
    console.warn("Impossible d'ecrire le log d'import:", err);
  }
}

/**
 * Ajoute session_id et rolled_back a IMPORT_LOG si absentes.
 */
async function migrateImportLogColumns() {
  try {
    const data = await grist.docApi.fetchTable("IMPORT_LOG");
    const actions = [];
    if (data.session_id === undefined) {
      actions.push(["AddColumn", "IMPORT_LOG", "session_id", { type: "Text" }]);
    }
    if (data.rolled_back === undefined) {
      actions.push(["AddColumn", "IMPORT_LOG", "rolled_back", { type: "Bool" }]);
    }
    if (actions.length > 0) {
      await grist.docApi.applyUserActions(actions);
      console.log("Migration IMPORT_LOG: colonnes session_id/rolled_back ajoutees.");
    }
  } catch (err) {
    console.warn("Migration IMPORT_LOG impossible:", err);
  }
}

/**
 * Recupere le dernier import pour rollback.
 * Priorite : rollback data en memoire (session), sinon fallback IMPORT_LOG filtre par session_id.
 */
export async function getLastImportForRollback() {
  // Priorite 1 : rollback data en memoire (isole par session)
  const { getLastRollbackData, getLastRollbackLogId } = await import("./state.js");
  const memoryData = getLastRollbackData();
  if (memoryData) {
    return {
      id: getLastRollbackLogId(),
      timestamp: new Date().toISOString(),
      fileName: "session courante",
      rollbackData: memoryData,
    };
  }

  // Priorite 2 : IMPORT_LOG filtre par session_id
  try {
    const data = await grist.docApi.fetchTable("IMPORT_LOG");
    if (!data.id?.length) return null;

    const sessionId = getSessionId();

    for (let i = data.id.length - 1; i >= 0; i--) {
      // Filtre par session + non dry-run + non deja rolled back
      const matchesSession = data.session_id?.[i] === sessionId;
      const notDryRun = !data.dry_run[i];
      const hasRollbackData = data.rollback_data[i];
      const notRolledBack = !data.rolled_back?.[i];

      if (matchesSession && notDryRun && hasRollbackData && notRolledBack) {
        try {
          const rollbackData = JSON.parse(data.rollback_data[i]);
          return {
            id: data.id[i],
            timestamp: data.timestamp[i],
            fileName: data.file_name[i],
            rollbackData,
          };
        } catch (parseErr) {
          console.warn(`Rollback data corrompue pour l'import #${data.id[i]}, ignore.`);
          continue;
        }
      }
    }
    return null;
  } catch (err) {
    console.warn("Impossible de lire IMPORT_LOG:", err);
    return null;
  }
}

// =========================
// Helpers
// =========================
function areEqual(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const aDate = normalizeDate(a);
  const bDate = normalizeDate(b);
  if (aDate && bDate && isValidDateString(aDate) && isValidDateString(bDate)) return aDate === bDate;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return String(a).trim() === String(b).trim();
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (value < 1 || value > 2958465) return null;
    if (typeof XLSX === "undefined" || !XLSX.SSF) return null;
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    return new Date(Date.UTC(date.y, date.m - 1, date.d)).toISOString().split("T")[0];
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split("/");
      const day = parseInt(d, 10);
      const month = parseInt(m, 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      return null;
    }
    return null;
  }
  if (value instanceof Date && !isNaN(value)) return value.toISOString().split("T")[0];
  return null;
}

function isValidDateString(str) {
  return typeof str === "string" && /^\d{4}-\d{2}-\d{2}$/.test(str);
}
