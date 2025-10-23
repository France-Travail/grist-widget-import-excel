// ===============================================
// 🛠️ PATCH : Log toutes les actions Grist (debug)
// ===============================================
const originalApply = grist.docApi.applyUserActions;

grist.docApi.applyUserActions = async function (actions, options = {}) {
  console.group("📤 applyUserActions appelé");
  console.log("🧾 Actions :", JSON.stringify(actions, null, 2));
  console.trace("📍 Trace de l'appel");
  console.groupEnd();

  try {
    const result = await originalApply.call(grist.docApi, actions, options);
    console.log("✅ applyUserActions OK ✅");
    return result;
  } catch (e) {
    console.error("🔥 applyUserActions ERREUR 🔥", e);
    throw e; // laisse remonter l'erreur
  }
};

// ===============================================
// 📦 ensureRulesConfigTableExists
// - Crée la table RULES_CONFIG si absente
// - Initialise avec une ligne par colonne du formulaire
// ===============================================
// export async function ensureRulesConfigTableExists(
//   formTableName = "Nom_Table",
//   configTableName = "RULES_CONFIG"
// ) {
//   // 1. Vérifie les tables existantes
//   const allTables = await grist.docApi.listTables();
//   console.log("📋 Tables existantes : ", allTables);

//   const tableExists = allTables.includes(configTableName);
//   if (tableExists) {
//     console.log("✅ RULES_CONFIG existe déjà.");
//     return;
//   }

//   // 2. Crée la table RULES_CONFIG
//   console.log("⚙ Création de la table RULES_CONFIG…");
//   await grist.docApi.applyUserActions([
//     ["AddTable", configTableName, null],
//     ["AddColumn", configTableName, "col_name", { type: "Text" }],
//     ["AddColumn", configTableName, "rule", { type: "Text" }],
//     ["AddColumn", configTableName, "is_key", { type: "Bool" }],
//   ]);
//   console.log("✅ Table RULES_CONFIG créée.");

//   // 3. Récupère les colonnes de la table du formulaire
//   const tableData = await grist.docApi.fetchTable(formTableName);
//   if (!tableData || tableData.length === 0) {
//     console.warn("❌ Table source vide ou introuvable :", formTableName);
//     return;
//   }

//   const firstRow = tableData[0];
//   const fieldNames = Object.keys(firstRow).filter(
//     (name) => name !== "id" && name !== "manualSort"
//   );
//   console.log("🧱 Colonnes détectées :", fieldNames);

//   // 4. Initialise les règles par défaut pour chaque colonne
//   const actions = fieldNames.map((colName) => [
//     "AddRecord",
//     configTableName,
//     null,
//     {
//       col_name: colName,
//       rule: "ignore",
//       is_key: false,
//     },
//   ]);

//   if (actions.length > 0) {
//     await grist.docApi.applyUserActions(actions);
//     console.log(`✅ ${actions.length} règles insérées.`);
//   } else {
//     console.log("ℹ Aucune colonne détectée.");
//   }
// }
