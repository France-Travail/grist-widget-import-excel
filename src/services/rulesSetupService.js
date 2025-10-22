// ============================
// 🧩 rulesSetupService.js
// ============================

import { getCurrentTableId, getCurrentGristData, getGristColumnTypes } from "./gristService.js";

// Liste officielle des règles disponibles
const DUPLICATION_RULES = [
  "ignore",
  "overwrite",
  "update_if_newer",
  "fill_if_empty",
  "append_if_different",
];


/**
 * Vérifie la présence de la table RULES_CONFIG
 * @returns {boolean} true si présente, false sinon
 */
export async function ensureRulesTableExists() {
  try {
    const allTables = await grist.docApi.listTables(); // ✅ méthode supportée
    console.log("Tables existantes :", allTables);

    const hasRules = allTables.includes("RULES_CONFIG");
    if (!hasRules) {
      console.warn("Table RULES_CONFIG absente — affichage du message utilisateur.");
      showMissingRulesUI();
      return false;
    }

    console.log("Table RULES_CONFIG trouvée.");
    return true;
  } catch (err) {
    console.error("Erreur lors de la vérification des tables :", err);
    showMissingRulesUI("Impossible de récupérer la liste des tables.");
    return false;
  }
}
/**
 * Affiche un message clair si la table RULES_CONFIG est absente
 */
function showMissingRulesUI(message) {
  let container = document.getElementById("app");

  // Si le conteneur n'existe pas encore, on le crée
  if (!container) {
    container = document.createElement("div");
    container.id = "app";
    document.body.innerHTML = ""; // on nettoie le reste si nécessaire
    document.body.appendChild(container);
  }

  container.innerHTML = `
    <div class="container">
      <div class="main-header">
        <div class="header-content">
          <div class="header-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <h1>Table RULES_CONFIG absente</h1>
          <p class="subtitle">Configuration requise pour le fonctionnement du widget</p>
        </div>
      </div>
      
      <div class="card">
        <div class="card-header">
          <h2>Configuration manquante</h2>
          <p>Ce widget nécessite une table <strong>RULES_CONFIG</strong> pour stocker les règles d'importation.</p>
        </div>
        
        <div class="form-group">
          <div style="background: var(--info-light); color: var(--info-dark); padding: var(--spacing); border-radius: var(--radius-sm); margin: var(--spacing) 0; border: 1px solid var(--info);">
            <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; font-weight: 600;">📋 Instructions d'installation :</h3>
            <ol style="margin: 0; padding-left: 1.5rem;">
              <li><strong>Téléchargez</strong> le modèle de table ci-dessous</li>
              <li><strong>Importez</strong> ce fichier dans votre document Grist</li>
              <li><strong>Conservez</strong> le nom de table par défaut : <code>RULES_CONFIG</code></li>
              <li><strong>Retournez</strong> dans ce widget pour définir vos règles d'importation</li>
            </ol>
          </div>
          
          <p style="margin-top: 1rem;">Le modèle généré sera adapté aux colonnes de la table actuellement liée à ce widget.</p>
          ${message ? `<div style="background: var(--error-light); color: var(--error-dark); padding: var(--spacing); border-radius: var(--radius-sm); margin: var(--spacing) 0; border: 1px solid var(--error);">${message}</div>` : ""}
          
          <div class="import-actions">
            <button id="generate-rules-template" class="btn btn-primary btn-large">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
              </svg>
              Télécharger modèle RULES_CONFIG
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document
    .getElementById("generate-rules-template")
    .addEventListener("click", generateRulesTemplate);
}
/**
 * Génère dynamiquement un fichier Excel RULES_CONFIG_TEMPLATE.xlsx
 * contenant une ligne par colonne de la table Grist active.
 */
async function generateRulesTemplate() {
  try {
    console.log("📦 Génération du modèle RULES_CONFIG_TEMPLATE.xlsx...");

    const tableId = getCurrentTableId();
    if (!tableId) {
      alert("❌ Impossible d'identifier la table active. Ouvrez le widget dans une vue liée à une table.");
      return;
    }

    const records = getCurrentGristData();
    const schema = getGristColumnTypes();

    if (!records?.length && Object.keys(schema).length === 0) {
      alert("❌ Impossible de détecter les colonnes. Assurez-vous qu'une table est liée et contient au moins une ligne.");
      return;
    }

    const cols = Object.keys(schema).filter((c) => c !== "id" && c !== "manualSort");
    if (!cols.length) {
      alert("❌ Aucune colonne détectée dans la table liée.");
      return;
    }

    // ✅ Table Excel brute sans superflu
    const data = [["col_name", "is_key", "rule"]];
    cols.forEach((col, i) => data.push([col, i === 0 ? true : false, "ignore"]));

    if (typeof XLSX === "undefined") {
      alert("❌ Le module XLSX n'est pas chargé. Vérifiez que le script CDN est bien inclus.");
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RULES_CONFIG");
    XLSX.writeFile(wb, "RULES_CONFIG.xlsx");

    console.log("✅ RULES_CONFIG_TEMPLATE.xlsx généré avec succès.");
    alert("✅ Modèle RULES_CONFIG téléchargé avec succès !");
  } catch (err) {
    console.error("🔥 Erreur génération modèle RULES_CONFIG:", err);
    alert("❌ Erreur lors de la génération du modèle RULES_CONFIG.");
  }
}

export { generateRulesTemplate };