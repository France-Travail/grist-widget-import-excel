// gristService.js
import { fetchImportRules } from "./rulesService.js";

// =========================
// 🧠 Variables internes
// =========================
let tableData = [];
let gristSchema = {}; // Stocke les types de colonnes Grist
let currentTableId = null;

// =========================
// 📤 Fonctions d'accès aux données
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
// 🧩 Initialisation de la communication avec Grist
// =========================
export function initGristListener(onRecordsReceived) {
  grist.ready({ requiredAccess: "full" });

  grist.onRecords((records) => {
    tableData = records;
    console.log("📥 Grist → Données reçues :", records);

    gristSchema = detectColumnTypesFromRecords(records);
    console.log("🧠 Types de colonnes (déduits) :", gristSchema);

    onRecordsReceived(records);
  });

  grist.on("message", (e) => {
    if (e.tableId) {
      currentTableId = e.tableId;
      console.log("📌 Table ID détecté automatiquement :", currentTableId);
    }
  });
}

function detectColumnTypesFromRecords(records) {
  const types = {};
  if (records.length === 0) return types;

  const first = records[0];
  for (const [key, value] of Object.entries(first)) {
    if (value === null || value === undefined) {
      types[key] = "Unknown";
    } else if (value instanceof Date) {
      types[key] = "Date";
    } else if (typeof value === "boolean") {
      types[key] = "Bool";
    } else if (typeof value === "number") {
      types[key] = "Numeric";
    } else {
      types[key] = "Text";
    }
  }

  return types;
}

// =========================
// 🚀 Fonction principale d'import vers Grist
// =========================
export async function importToGrist({ excelData, mapping }) {
  console.log("🚀 Import vers Grist lancé");

  const { rules, uniqueKey } = await fetchImportRules();
  if (!uniqueKey) {
    alert("❌ Aucune clé unique définie dans la table RULES_CONFIG !");
    return;
  }

  const gristData = getCurrentGristData();
  const header = excelData[0];
  const rows = excelData.slice(1);
  const gristColumnTypes = getGristColumnTypes();

  const gristIndex = {};
  for (const record of gristData) {
    gristIndex[record[uniqueKey]] = record;
  }

  const actions = [];
  const resume = [];

  let ligneIndex = 0;
  for (const row of rows) {
    ligneIndex++;
    const excelRow = {};
    header.forEach((col, i) => {
      excelRow[col] = row[i];
    });

    const gristRow = {};
    Object.entries(mapping).forEach(([excelCol, gristCol]) => {
      if (gristCol) {
        let val = excelRow[excelCol];
        const typeGrist = gristColumnTypes[gristCol];
        if (typeGrist === "Date") val = normalizeDate(val);
        gristRow[gristCol] = val;
      }
    });

    const key = gristRow[uniqueKey];
    if (!key || key.toString().trim() === "") {
      resume.push(
        `Ligne ${ligneIndex} : 🚫 IGNORÉE car \"${uniqueKey}\" est vide`
      );
      continue;
    }

    const isEmpty = Object.values(gristRow).every(
      (val) => val === null || val === undefined || val === ""
    );
    if (isEmpty) {
      resume.push(`Ligne ${ligneIndex} : 🚫 IGNORÉE (ligne vide)`);
      continue;
    }

    const existing = gristIndex[key];
    if (existing) {
      const updates = {};
      const changements = [];
      let hasUpdate = false;

      for (const [field, rule] of Object.entries(rules)) {
        const excelVal = gristRow[field];
        const gristVal = existing[field];

        if (rule === "update_if_newer") {
          const exDate = new Date(excelVal);
          const grDate = new Date(gristVal);
          if (exDate > grDate) {
            updates[field] = excelVal;
            changements.push(`${field} : \"${gristVal}\" → \"${excelVal}\"`);
            hasUpdate = true;
          }
        } else if (rule === "overwrite") {
          if (excelVal !== gristVal) {
            updates[field] = excelVal;
            changements.push(`${field} : \"${gristVal}\" → \"${excelVal}\"`);
            hasUpdate = true;
          }
        }
      }

      if (hasUpdate) {
        actions.push(["UpdateRecord", currentTableId, existing.id, updates]);
        resume.push(
          `Ligne ${ligneIndex} : ✏️ MODIFICATION → ${JSON.stringify(updates)}`
        );
      } else {
        resume.push(`Ligne ${ligneIndex} : 🟢 IGNORÉ (aucune modification)`);
      }
    } else {
      const newRecord = {};
      Object.entries(rules).forEach(([field]) => {
        newRecord[field] = gristRow[field];
      });
      actions.push(["AddRecord", currentTableId, null, newRecord]);
      resume.push(
        `Ligne ${ligneIndex} : 🆕 AJOUT → ${JSON.stringify(newRecord)}`
      );
    }
  }

  if (actions.length > 0) {
    const simulatedTable = [...gristData.map((r) => ({ ...r }))];
    for (const action of actions) {
      const [type, _tableId, rowId, payload] = action;
      if (type === "UpdateRecord") {
        const row = simulatedTable.find((r) => r.id === rowId);
        if (row) Object.assign(row, payload);
      } else if (type === "AddRecord") {
        const fakeId = `nouveau_${Math.random().toString(36).slice(2, 8)}`;
        simulatedTable.push({ id: fakeId, ...payload });
      }
    }
    console.log("🧪 Prévisualisation de la table finale après import :");
    console.table(simulatedTable);

    await grist.docApi.applyUserActions(actions);
    console.log(`✅ ${actions.length} action(s) envoyée(s) à Grist`);
  } else {
    console.log("📭 Aucun changement à appliquer.");
  }

  console.log("📋 Résumé de l'import :\n" + resume.join("\n"));
  return resume;
}

// =========================
// 📅 Conversion de date Excel → ISO
// =========================
function normalizeDate(value) {
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    const iso = new Date(Date.UTC(date.y, date.m - 1, date.d)).toISOString();
    return iso.split("T")[0];
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.split("T")[0];
  }
  if (value instanceof Date && !isNaN(value)) {
    return value.toISOString().split("T")[0];
  }
  return value;
}
