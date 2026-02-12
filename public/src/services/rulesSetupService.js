// ============================
// rulesSetupService.js
// ============================

import { getCurrentTableId, getCurrentGristData, getGristColumnTypes } from "./gristService.js";

/**
 * Verifie la presence de la table RULES_CONFIG.
 * Si absente, tente de la creer automatiquement.
 * Si presente, migre la colonne is_key si necessaire.
 * @returns {boolean} true si prete, false sinon
 */
export async function ensureRulesTableExists() {
  try {
    const allTables = await grist.docApi.listTables();
    console.log("Tables existantes :", allTables);

    if (allTables.includes("RULES_CONFIG")) {
      console.log("Table RULES_CONFIG trouvee.");
      await migrateIsKeyColumn();
      return true;
    }

    // Table absente : tenter la creation automatique
    console.warn("Table RULES_CONFIG absente, tentative de creation automatique...");
    const created = await autoCreateRulesConfig();
    if (created) {
      console.log("Table RULES_CONFIG creee automatiquement.");
      return true;
    }

    // Fallback : UI manuelle
    showMissingRulesUI();
    return false;
  } catch (err) {
    console.error("Erreur lors de la verification des tables :", err);
    showMissingRulesUI("Impossible de recuperer la liste des tables.");
    return false;
  }
}

/**
 * Cree automatiquement la table RULES_CONFIG dans Grist
 * en se basant sur les colonnes de la table liee au widget.
 * @returns {boolean} true si cree avec succes
 */
async function autoCreateRulesConfig() {
  try {
    const schema = getGristColumnTypes();
    const cols = Object.keys(schema).filter((c) => c !== "id" && c !== "manualSort");

    if (cols.length === 0) {
      console.warn("Aucune colonne detectee, impossible de creer RULES_CONFIG automatiquement.");
      return false;
    }

    // Afficher un indicateur de chargement
    showCreatingUI();

    // 1) Creer la table avec ses colonnes
    const actions = [
      ["AddTable", "RULES_CONFIG", [
        { id: "col_name", type: "Text" },
        { id: "is_key", type: "Bool" },
        { id: "rule", type: "Text" },
      ]],
    ];

    // 2) Ajouter une ligne par colonne de la table liee
    cols.forEach((col, i) => {
      actions.push([
        "AddRecord", "RULES_CONFIG", null, {
          col_name: col,
          is_key: i === 0, // Premiere colonne = cle unique par defaut
          rule: "ignore",
        },
      ]);
    });

    await grist.docApi.applyUserActions(actions);
    console.log(`RULES_CONFIG creee avec ${cols.length} colonne(s).`);

    // Masquer l'indicateur
    hideCreatingUI();

    return true;
  } catch (err) {
    console.error("Erreur lors de la creation automatique de RULES_CONFIG:", err);
    hideCreatingUI();
    return false;
  }
}

/**
 * Ajoute la colonne is_key a RULES_CONFIG si elle n'existe pas.
 * Par defaut, la premiere ligne obtient is_key=true (compat ascendante).
 */
async function migrateIsKeyColumn() {
  try {
    const data = await grist.docApi.fetchTable("RULES_CONFIG");

    // Si is_key existe deja, rien a faire
    if (data.is_key !== undefined) return;

    console.warn("Migration: colonne is_key absente dans RULES_CONFIG, ajout automatique...");

    await grist.docApi.applyUserActions([
      ["AddColumn", "RULES_CONFIG", "is_key", { type: "Bool" }],
    ]);

    if (data.id?.length > 0) {
      const actions = data.id.map((rowId, i) => [
        "UpdateRecord", "RULES_CONFIG", rowId, { is_key: i === 0 },
      ]);
      await grist.docApi.applyUserActions(actions);
      console.log("Migration: is_key ajoute, premiere colonne definie comme cle unique.");
    }
  } catch (err) {
    console.warn("Migration is_key impossible (peut-etre deja presente):", err);
  }
}

// =========================
// UI : indicateur de creation
// =========================

function showCreatingUI() {
  const container = document.querySelector(".container");
  if (!container) return;

  const banner = document.createElement("div");
  banner.id = "rules-creating-banner";
  banner.style.cssText = "padding: 1rem 1.5rem; background: #dbeafe; color: #1e40af; border-bottom: 1px solid #93c5fd; text-align: center; font-weight: 500; font-size: 0.9rem;";
  banner.textContent = "Creation automatique de la table RULES_CONFIG en cours...";
  container.prepend(banner);
}

function hideCreatingUI() {
  const banner = document.getElementById("rules-creating-banner");
  if (banner) banner.remove();
}

// =========================
// UI : fallback manuel (si auto-creation echoue)
// =========================

function showMissingRulesUI(message) {
  let container = document.getElementById("app");

  if (!container) {
    container = document.createElement("div");
    container.id = "app";
    document.body.innerHTML = "";
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
          <p class="subtitle">La creation automatique a echoue. Vous pouvez creer la table manuellement.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Configuration manquante</h2>
          <p>Ce widget necessite une table <strong>RULES_CONFIG</strong> pour stocker les regles d'importation.</p>
        </div>

        <div class="form-group">
          <div style="background: #dbeafe; color: #1e40af; padding: 0.75rem; border-radius: 4px; margin: 0.75rem 0; border: 1px solid #93c5fd;">
            <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; font-weight: 600;">Instructions :</h3>
            <ol style="margin: 0; padding-left: 1.5rem;">
              <li><strong>Telechargez</strong> le modele de table ci-dessous</li>
              <li><strong>Importez</strong> ce fichier dans votre document Grist</li>
              <li><strong>Conservez</strong> le nom de table par defaut : <code>RULES_CONFIG</code></li>
              <li><strong>Retournez</strong> dans ce widget pour definir vos regles d'importation</li>
            </ol>
          </div>

          <p style="margin-top: 1rem;">Le modele genere sera adapte aux colonnes de la table actuellement liee a ce widget.</p>
          ${message ? `<div style="background: #fef2f2; color: #991b1b; padding: 0.75rem; border-radius: 4px; margin: 0.75rem 0; border: 1px solid #fecaca;">${message}</div>` : ""}

          <div class="import-actions">
            <button id="generate-rules-template" class="btn btn-primary btn-large">
              Telecharger modele RULES_CONFIG
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
 * Genere dynamiquement un fichier Excel RULES_CONFIG.xlsx
 * contenant une ligne par colonne de la table Grist active.
 * Utilise en fallback si la creation auto a echoue.
 */
async function generateRulesTemplate() {
  try {
    const tableId = getCurrentTableId();
    if (!tableId) {
      alert("Impossible d'identifier la table active. Ouvrez le widget dans une vue liee a une table.");
      return;
    }

    const schema = getGristColumnTypes();
    if (Object.keys(schema).length === 0) {
      alert("Impossible de detecter les colonnes. Assurez-vous qu'une table est liee et contient au moins une ligne.");
      return;
    }

    const cols = Object.keys(schema).filter((c) => c !== "id" && c !== "manualSort");
    if (!cols.length) {
      alert("Aucune colonne detectee dans la table liee.");
      return;
    }

    const data = [["col_name", "is_key", "rule"]];
    cols.forEach((col, i) => data.push([col, i === 0 ? true : false, "ignore"]));

    if (typeof XLSX === "undefined") {
      alert("Le module XLSX n'est pas charge.");
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RULES_CONFIG");
    XLSX.writeFile(wb, "RULES_CONFIG.xlsx");

    alert("Modele RULES_CONFIG telecharge avec succes !");
  } catch (err) {
    console.error("Erreur generation modele RULES_CONFIG:", err);
    alert("Erreur lors de la generation du modele RULES_CONFIG.");
  }
}

export { generateRulesTemplate };
