export const DUPLICATION_RULES = [
  {
    value: "ignore",
    label: "❌ Ne jamais modifier",
    description:
      "La valeur Grist est toujours conservée, même si différente d’Excel.",
  },
  {
    value: "overwrite",
    label: "✏️ Écraser systématiquement",
    description: "La valeur Excel remplace celle de Grist à chaque import.",
  },
  {
    value: "update_if_newer",
    label: "📅 Mettre à jour si plus récent",
    description:
      "La valeur Excel remplace celle de Grist uniquement si elle est plus récente (date).",
  },
  {
    value: "fill_if_empty",
    label: "🧩 Remplir uniquement si vide",
    description:
      "La valeur Excel est utilisée uniquement si la cellule Grist est vide.",
  },
  {
    value: "preserve_if_not_empty",
    label: "🔒 Ne modifier que si vide",
    description:
      "La valeur Excel est utilisée seulement si la cellule Grist est vide.",
  },
  {
    value: "append_if_different",
    label: "➕ Ajouter si différent",
    description:
      "La valeur Excel est ajoutée à la suite si elle est différente de celle de Grist.",
  },
];
