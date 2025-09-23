// =========================
// 📥 FETCH DES RÈGLES D’IMPORT DEPUIS LA TABLE "RULES_CONFIG"
// =========================

import { normalizeName, cleanLabel } from "./utils.js";

/**
 * Récupère les règles de traitement pour chaque colonne depuis RULES_CONFIG.
 * Les noms de colonnes sont normalisés pour être cohérents avec Excel et Grist.
 *
 * @param {string} tableName - Nom de la table (défaut : RULES_CONFIG)
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

      if (!rawColName || !rule) continue;

      const normalized = normalizeName(rawColName);
      const clean = cleanLabel(rawColName);

      if (isKey) {
        uniqueKey = normalized; // ⚠️ clé unique aussi en version normalisée
      }

      rules[normalized] = {
        rule,
        original: rawColName,
        label: clean,
      };
    }

    if (!uniqueKey) {
      console.warn("⚠️ Aucune clé unique définie dans rules_config !");
    }

    return { rules, uniqueKey };
  } catch (e) {
    console.error("❌ Erreur lors du chargement des règles :", e);
    return { rules: {}, uniqueKey: null };
  }
}
