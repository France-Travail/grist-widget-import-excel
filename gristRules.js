// =========================
// 🔧 UTILITAIRE : Nettoyage d’un nom de colonne
// =========================

/**
 * Normalise un nom de colonne Grist :
 * supprime les retours à la ligne, tabulations, espaces en double…
 *
 * @param {string} str
 * @returns {string} Chaîne nettoyée
 */
function normalizeColName(str) {
  return str?.trim().replace(/\s+/g, " ");
}

// =========================
// 📥 FETCH DES RÈGLES D’IMPORT DEPUIS LA TABLE "RULES_CONFIG"
// =========================

/**
 * Récupère les règles de traitement pour chaque colonne depuis la table RULES_CONFIG
 * ainsi que la clé unique choisie par l'utilisateur (colonne `is_key`)
 *
 * @param {string} tableName - Nom de la table Grist contenant les règles (défaut : RULES_CONFIG)
 * @returns {Promise<{rules: Object, uniqueKey: string|null}>}
 */
export async function fetchImportRules(tableName = "RULES_CONFIG") {
  try {
    const result = await grist.docApi.fetchTable(tableName);
    const rules = {};
    let uniqueKey = null;

    const nbRows = result.col_name?.length || 0;

    for (let i = 0; i < nbRows; i++) {
      const rawColName = result.col_name[i];
      const rule = result.rule[i];
      const isKey = result.is_key?.[i];

      const colName = normalizeColName(rawColName);

      if (!colName || !rule) continue;

      if (isKey) {
        uniqueKey = colName;
      }

      rules[colName] = rule;
    }

    console.log("📄 Règles d’import récupérées depuis Grist :", rules);

    if (!uniqueKey) {
      console.warn(
        "⚠️ Aucune clé unique définie dans rules_config (colonne is_key)"
      );
    } else {
      console.log("🗝️ Clé unique :", uniqueKey);
    }

    return { rules, uniqueKey };
  } catch (e) {
    console.error("❌ Erreur lors du chargement des règles depuis Grist :", e);
    return { rules: {}, uniqueKey: null };
  }
}
