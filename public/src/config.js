export const DUPLICATION_RULES = [
  {
    value: "ignore",
    label: "❌ Ne jamais modifier",
    description:
      "La valeur Grist est toujours conservée, même si différente d'Excel. (Champs calculés ou validés manuellement)",
  },
  {
    value: "overwrite",
    label: "✏️ Écraser systématiquement",
    description: "La valeur Excel remplace celle de Grist à chaque import. (Données de référence provenant d'Excel)",
  },
  {
    value: "update_if_newer",
    label: "📅 Mettre à jour si plus récent",
    description:
      "La valeur Excel remplace celle de Grist uniquement si elle est plus récente. (Uniquement pour les champs de type Date - horodatages, dates de modification)",
  },
  {
    value: "fill_if_empty",
    label: "🧩 Remplir uniquement si vide",
    description:
      "La valeur Excel est utilisée uniquement si la cellule Grist est vide. (Valeurs par défaut, complétion automatique)",
  },
  {
    value: "append_if_different",
    label: "➕ Ajouter si différent",
    description:
      "La valeur Excel est ajoutée à la suite si elle est différente de celle de Grist. (Champs de type Choix/Liste - commentaires, historique, tags multiples)",
  },
];
