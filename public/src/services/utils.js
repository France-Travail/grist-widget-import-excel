// =========================
// 🔧 UTILITAIRE : Normalisation
// =========================

/**
 * Normalise un nom de colonne pour matcher Excel ↔ Grist ↔ Rules.
 * - met en minuscule
 * - enlève les accents
 * - supprime espaces, tirets, underscores
 * - supprime les caractères spéciaux
 *
 * @param {string} str
 * @returns {string}
 */
export function normalizeName(str) {
  return str
    ?.toLowerCase()
    .normalize("NFD") // enlève les accents
    .replace(/[\u0300-\u036f]/g, "") // caractères spéciaux Unicode
    .replace(/[\s_-]/g, "") // espaces, underscores, tirets supprimés
    .replace(/[^a-z0-9]/g, ""); // garde uniquement lettres/chiffres
}

/**
 * Variante : nettoyage soft (espaces multiples → un seul espace).
 * Utile si tu veux juste "rendre lisible" un label.
 *
 * @param {string} str
 * @returns {string}
 */
export function cleanLabel(str) {
  return str?.trim().replace(/\s+/g, " ");
}
