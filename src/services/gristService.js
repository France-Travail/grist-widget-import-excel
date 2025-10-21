// src/services/gristService.js
// ===========================
// Communication avec Grist + import Excel
// ===========================

import { fetchImportRules } from "./rulesService.js";
import { normalizeName } from "./utils.js";
import { ensureRulesTableExists } from "./rulesSetupService.js";

// =========================
// 🧠 État interne
// =========================
let tableData = [];
let gristSchema = {}; // { ColName: "Text" | "Date" | ... }
let currentTableId = null;

// =========================
// 📤 Getters
// =========================
export function getCurrentTableId() {
  return currentTableId;
}
export function getGristColumnTypes() {
  return gristSchema;
}
export function getCurrentGristData() {
  return tableData;
}

// =========================
// 🔌 Init Grist
// =========================
export function initGristListener(onRecordsReceived) {
  grist.ready({ requiredAccess: "full" });

  grist.on("message", (e) => {
    if (e.tableId) currentTableId = e.tableId;
  });


// Événement principal : réception des données du tableau sélectionné
  grist.onRecords(async (records) => {
    tableData = records || [];
    gristSchema = detectColumnTypesFromRecords(records || []);

    // 🧩 Vérifie la présence de RULES_CONFIG avant de continuer
    const rulesOk = await ensureRulesTableExists();
    if (!rulesOk) {
      console.warn("⛔ Table RULES_CONFIG manquante — arrêt du chargement widget.");
      return; // ⛔ stoppe le flux, l’UI du setup prend le relais
    }


    // ✅ Si la table est présente, on continue normalement
    onRecordsReceived?.(records || []);
  });


  // grist.onRecords((records) => {
  //   tableData = records || [];
  //   gristSchema = detectColumnTypesFromRecords(records || []);
  //   onRecordsReceived?.(records || []);
  // });

  // Récupère l'ID de la table “active”
}

function detectColumnTypesFromRecords(records) {
  const types = {};
  if (!records || records.length === 0) return types;
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

// =========================
// 🚀 Import principal
// =========================
export async function importToGrist({ excelData, mapping }) {
  console.log("Import vers Grist lancé");

  if (!currentTableId) {
    console.error(
      "currentTableId introuvable (grist.on('message') non déclenché)."
    );
    alert(
      "Impossible d'identifier la table cible (currentTableId). Ouvre le widget dans une vue liée à une table."
    );
    return;
  }

  // 1) Récupération des règles (tolère ancien format & nouveau format)
  const { rules: rawRules, uniqueKey: rawUniqueKey } = await fetchImportRules();
  if (!rawUniqueKey) {
    alert("Aucune clé unique définie dans RULES_CONFIG !");
    return;
  }

  // 2) Colonnes Grist et dictionnaire de résolution
  const gristColTypes = getGristColumnTypes(); // { "Prenom": "Text", ... }
  const gristCols = Object.keys(gristColTypes); // ["Prenom","Nom","Age","Actif","A",...]
  const normToGristCol = Object.fromEntries(
    gristCols.map((c) => [normalizeName(c), c])
  );

  // 3) Normaliser rules (accepte 2 shapes : {col: "rule"} ou {norm: {original, rule}})
  // -> on force une structure { [norm]: { rule, gristCol } } uniquement si la colonne existe dans Grist.
  const normalizedRules = {};
  const looksLikeNewShape =
    rawRules &&
    typeof Object.values(rawRules)[0] === "object" &&
    "rule" in Object.values(rawRules)[0];

  if (looksLikeNewShape) {
    for (const [norm, data] of Object.entries(rawRules)) {
      const gristCol =
        normToGristCol[norm] ||
        (data.original && normToGristCol[normalizeName(data.original)]);
      if (!gristCol) {
        console.warn(
          `Règle ignorée: colonne introuvable dans Grist pour "${
            data.original || norm
          }"`
        );
        continue;
      }
      normalizedRules[norm] = { rule: data.rule, gristCol };
    }
  } else {
    // Ancien format: { "Prenom": "overwrite", ... } ou {"Prénom": "overwrite", ...}
    for (const [maybeGristOrLabel, rule] of Object.entries(rawRules || {})) {
      const norm = normalizeName(maybeGristOrLabel);
      const gristCol = normToGristCol[norm];
      if (!gristCol) {
        console.warn(
          `Règle ignorée: colonne introuvable dans Grist pour "${maybeGristOrLabel}"`
        );
        continue;
      }
      normalizedRules[norm] = { rule, gristCol };
    }
  }

  const uniqueKeyNorm = normalizeName(rawUniqueKey);
  const uniqueKeyGristCol = normToGristCol[uniqueKeyNorm];
  if (!uniqueKeyGristCol) {
    console.error(
      `La clé unique "${rawUniqueKey}" ne correspond à aucune colonne Grist.`
    );
    alert(
      `Clé unique "${rawUniqueKey}" invalide (colonne inconnue dans Grist).`
    );
    return;
  }

  // 4) Déballer Excel
  const header = excelData?.[0] || [];
  const rows = (excelData || []).slice(1);

  // DEBUG — Excel brut
  console.group("DEBUG EXCEL BRUT");
  console.log("Colonnes Excel :", header);
  console.table(rows.slice(0, 10));
  console.groupEnd();

  // DEBUG — Normalisation Excel / Grist / Rules / Dictionnaire
  console.group("DEBUG NORMALISATION");
  console.table(
    header.map((h) => ({ excelHeader: h, norm: normalizeName(h) }))
  );
  console.table(
    gristCols.map((g) => ({
      gristCol: g,
      norm: normalizeName(g),
      type: gristColTypes[g],
    }))
  );
  console.table(
    Object.entries(normalizedRules).map(([n, v]) => ({
      norm: n,
      gristCol: v.gristCol,
      rule: v.rule,
    }))
  );
  console.table(
    Object.entries(normToGristCol).map(([n, g]) => ({ norm: n, gristCol: g }))
  );
  console.log("uniqueKey:", {
    raw: rawUniqueKey,
    norm: uniqueKeyNorm,
    gristCol: uniqueKeyGristCol,
  });
  console.groupEnd();

  // 5) Construire index Grist par clé unique (valeur brute, trim)
  const gristData = getCurrentGristData();
  const gristIndex = {};
  for (const rec of gristData) {
    const val = rec[uniqueKeyGristCol];
    const keyStr = val === null || val === undefined ? "" : String(val).trim();
    if (keyStr) gristIndex[keyStr] = rec;
  }

  // 6) Appliquer le mapping Excel→Grist pour construire des lignes normalisées
  // mapping: { "Prénom" -> "Prenom", ... }
  const actions = [];
  const resume = [];

  // Pre-calc : type Date par colonne (via nom Grist réel)
  const gristColIsDate = new Set(
    gristCols.filter((c) => gristColTypes[c] === "Date")
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const excelRowByNorm = Object.create(null);
    header.forEach((col, idx) => {
      excelRowByNorm[normalizeName(col)] = row[idx];
    });

    // Construire une ligne par colonnes grist normalisées -> valeurs Excel
    const lineByNorm = Object.create(null);
    for (const [excelCol, gristCol] of Object.entries(mapping || {})) {
      if (!gristCol) continue;
      const val = excelRowByNorm[normalizeName(excelCol)];
      const gristColNorm = normalizeName(gristCol);

      let finalVal = val;
      if (gristColIsDate.has(gristCol)) {
        finalVal = normalizeDate(val);
      }
      lineByNorm[gristColNorm] = finalVal;
    }

    // Clé unique
    const keyValRaw = lineByNorm[uniqueKeyNorm];
    const key =
      keyValRaw === null || keyValRaw === undefined
        ? ""
        : String(keyValRaw).trim();
    if (!key) {
      resume.push(
        `Ligne ${i + 1} : IGNORÉE (clé "${uniqueKeyGristCol}" vide)`
      );
      continue;
    }

    const existing = gristIndex[key];

    if (existing) {
      // UPDATE
      const updates = {};
      let hasUpdate = false;

      for (const [norm, { rule, gristCol }] of Object.entries(
        normalizedRules
      )) {
        if (rule === "ignore" || rule === "match") continue;

        const excelVal = lineByNorm[norm];
        const gristVal = existing[gristCol];

        console.log("DEBUG champ:", {
          norm,
          gristCol,
          excelVal,
          gristVal,
          rule,
        });

        if (rule === "overwrite") {
          if (
            excelVal !== undefined &&
            excelVal !== null &&
            excelVal !== "" &&
            !areEqual(excelVal, gristVal)
          ) {
            updates[gristCol] = normalizeDate(excelVal) || excelVal;
            hasUpdate = true;
          }
        } else if (rule === "update_if_newer") {
          if (excelVal) {
            const exDate = new Date(excelVal);
            const grDate = new Date(gristVal);
            if (!isNaN(exDate) && (isNaN(grDate) || exDate > grDate)) {
              updates[gristCol] = normalizeDate(excelVal) || excelVal;
              hasUpdate = true;
            }
          }
        } else if (rule === "fill_if_empty") {
          if (
            (gristVal === null || gristVal === undefined || gristVal === "") &&
            excelVal !== null &&
            excelVal !== undefined &&
            excelVal !== ""
          ) {
            updates[gristCol] = normalizeDate(excelVal) || excelVal;
            hasUpdate = true;
          }
        } else if (rule === "append_if_different") {
          if (
            excelVal !== null &&
            excelVal !== undefined &&
            excelVal !== "" &&
            !areEqual(excelVal, gristVal)
          ) {
            const sep = gristVal ? " | " : "";
            updates[gristCol] = (gristVal || "") + sep + excelVal;
            hasUpdate = true;
          }
        }
      }
      if (hasUpdate) {
        actions.push(["UpdateRecord", currentTableId, existing.id, updates]);
        resume.push(`Ligne ${i + 1} : UPDATE → ${JSON.stringify(updates)}`);
      } else {
        resume.push(`Ligne ${i + 1} : IGNORÉ (aucun changement)`);
      }
    } else {
      // ADD
      const newRecord = {};
      for (const [norm, { gristCol }] of Object.entries(normalizedRules)) {
        // On insère uniquement les colonnes connues de Grist
        if (norm in lineByNorm) newRecord[gristCol] = lineByNorm[norm];
      }
      actions.push(["AddRecord", currentTableId, null, newRecord]);
      resume.push(`Ligne ${i + 1} : ADD → ${JSON.stringify(newRecord)}`);
    }
  }

  // 7) Debug actions & simulation
  console.group("DEBUG TABLE AVANT IMPORT");
  console.table(
    actions.map(([type, , id, payload]) => ({ action: type, id, ...payload }))
  );
  console.groupEnd();

  if (actions.length === 0) {
    console.log("Aucun changement à appliquer.");
    console.log("Résumé final :", resume);
    return resume;
  }

  const simulatedTable = [...gristData.map((r) => ({ ...r }))];
  for (const [kind, , rowId, payload] of actions) {
    if (kind === "UpdateRecord") {
      const r = simulatedTable.find((rr) => rr.id === rowId);
      if (r) Object.assign(r, payload);
    } else if (kind === "AddRecord") {
      simulatedTable.push({
        id: `tmp_${Math.random().toString(36).slice(2, 8)}`,
        ...payload,
      });
    }
  }
  console.group("DEBUG TABLE APRES IMPORT (simulation)");
  console.table(simulatedTable);
  console.groupEnd();

  // 8) Apply
  await grist.docApi.applyUserActions(actions);
  console.log(`${actions.length} action(s) envoyée(s) à Grist`);
  console.log("Résumé final :", resume);
  return resume;
}

// =========================
// Helpers
// =========================
function areEqual(a, b) {
  // comparaison douce pour éviter les faux positifs
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  // Dates → forcer comparaison en YYYY-MM-DD
  const aDate = normalizeDate(a);
  const bDate = normalizeDate(b);
  if (aDate && bDate && isValidDateString(aDate) && isValidDateString(bDate)) {
    return aDate === bDate;
  }

  if (typeof a === "number" || typeof b === "number") {
    return Number(a) === Number(b);
  }
  return String(a).trim() === String(b).trim();
}

function normalizeDate(value) {
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    return new Date(Date.UTC(date.y, date.m - 1, date.d))
      .toISOString()
      .split("T")[0]; // YYYY-MM-DD
  }
  if (typeof value === "string") {
    const s = value.trim();
    // formats acceptés
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // déjà bon
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split("/");
      return new Date(`${y}-${m}-${d}`).toISOString().split("T")[0];
    }
    return null;
  }
  if (value instanceof Date && !isNaN(value)) {
    return value.toISOString().split("T")[0];
  }
  return null;
}

function isValidDateString(str) {
  return typeof str === "string" && /^\d{4}-\d{2}-\d{2}$/.test(str);
}
