import { resolveSourceDuplicates } from "./duplicateService.js";
import { normalizeName, isEmpty, equal } from "./utils.js";
import { parseDate } from "./dateService.js";

export const RULES = {
  ignore: [
    "Conserver Grist",
    "Conserver les valeurs des lignes existantes ; renseigner ce champ lors d’une création.",
  ],
  overwrite: [
    "Remplacer si renseigné",
    "Remplacer par Excel ; une cellule Excel vide conserve Grist.",
  ],
  fill_if_empty: [
    "Compléter si vide",
    "Renseigner seulement les cellules Grist vides. Faux et zéro sont des valeurs.",
  ],
  update_if_newer: [
    "Garder la date la plus récente",
    "Dates uniquement. Remplacer si la date Excel est plus récente.",
  ],
  append_if_different: [
    "Ajouter sans répéter",
    "Ajouter au texte ou à la liste les éléments encore absents.",
  ],
  match: [
    "Identifier uniquement",
    "Conserver sur les lignes existantes ; renseigner à la création.",
  ],
};

export function matchColumns(headers, columns) {
  return Object.fromEntries(
    headers.map((header) => {
      const exact = columns.filter((c) => !c.isFormula && c.id === header);
      const matches = exact.length
        ? exact
        : columns.filter(
            (c) =>
              !c.isFormula &&
              [c.id, c.label].some(
                (name) => normalizeName(name) === normalizeName(header),
              ),
          );
      return [header, matches.length === 1 ? matches[0].id : ""];
    }),
  );
}

export function convertValue(value, column, options = {}) {
  if (isEmpty(value)) return null;
  const type = column.type;
  if (type === "Date" || type.startsWith("DateTime:")) {
    return parseDate(value, {
      ...options,
      dateTime: type.startsWith("DateTime:"),
      timeZone: type.slice(9) || "UTC",
    });
  }
  if (type === "Bool") {
    if ([true, 1, "1"].includes(value)) return true;
    if ([false, 0, "0"].includes(value)) return false;
    const str = String(value).trim().toLowerCase();
    if (["true", "vrai", "oui", "yes"].includes(str)) return true;
    if (["false", "faux", "non", "no"].includes(str)) return false;
    throw new Error("Booléen attendu : oui/non, vrai/faux ou 1/0.");
  }
  if (type === "Numeric" || type === "Int") {
    const text = String(value)
      .trim()
      .replace(/[\s\u00a0\u202f]/g, "")
      .replace(",", ".");
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text))
      throw new Error("Nombre invalide.");
    const number = Number(text);
    if (
      !Number.isFinite(number) ||
      (type === "Int" && !Number.isSafeInteger(number))
    )
      throw new Error("Nombre hors limites ou entier attendu.");
    return number;
  }
  if (type.startsWith("Ref:") || type.startsWith("RefList:")) {
    const ref = options.references?.[column.id];
    if (!ref)
      throw new Error(
        "Références indisponibles : vérifier l’accès à la table liée.",
      );
    const resolve = (v) => {
      const hits = ref.labels[String(v).trim()] ?? [];
      if (hits.length === 1) return hits[0];
      if (hits.length > 1)
        throw new Error(
          "Référence ambiguë : plusieurs lignes portent cette valeur.",
        );
      // Without a visible column, the spreadsheet must explicitly provide a row ID.
      if (
        !ref.visibleCol &&
        /^\d+$/.test(String(v)) &&
        ref.ids.includes(Number(v))
      )
        return Number(v);
      throw new Error("Référence introuvable dans la table liée.");
    };
    if (type.startsWith("RefList:"))
      return [
        "L",
        ...new Set(
          String(value)
            .split(";")
            .map((v) => resolve(v.trim())),
        ),
      ];
    return resolve(value);
  }
  if (type === "ChoiceList")
    return [
      "L",
      ...new Set(
        String(value)
          .split(";")
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ];
  if (type === "Text" || type === "Choice") return String(value).trim();
  if (type === "Any") return value;
  throw new Error(`Le type ${type} n’est pas pris en charge pour l’import.`);
}

function nextValue(rule, incoming, existing, type) {
  if (isEmpty(incoming)) return existing;
  if (rule === "overwrite") return incoming;
  if (rule === "fill_if_empty")
    return isEmpty(existing) ||
      (Array.isArray(existing) && existing.length === 1) ||
      (type.startsWith("Ref:") && existing === 0)
      ? incoming
      : existing;
  if (rule === "update_if_newer") {
    if (isEmpty(existing)) return incoming;
    if (typeof existing !== "number")
      throw new Error(
        "La date déjà présente dans Grist est invalide ; corriger la cellule.",
      );
    return incoming > existing ? incoming : existing;
  }
  if (rule === "append_if_different") {
    if (type === "ChoiceList" || type.startsWith("RefList:")) {
      return [
        "L",
        ...new Set([
          ...(Array.isArray(existing) ? existing.slice(1) : []),
          ...incoming.slice(1),
        ]),
      ];
    }
    const parts = isEmpty(existing) ? [] : String(existing).split(" | ");
    for (const part of String(incoming).split(" | "))
      if (!parts.includes(part)) parts.push(part);
    return parts.join(" | ");
  }
  return existing;
}

/** Pure preparation: no Grist calls, no writes, no logging of workbook contents. */
export function buildImportPlan(input) {
  const duplicates = resolveSourceDuplicates(input, convertValue);
  const plan = buildBasePlan({ ...input, sheets: duplicates.sheets });
  plan.duplicateGroups = duplicates.groups;
  plan.errors.push(...duplicates.errors);
  plan.details.push(...duplicates.excluded);
  plan.stats.excluded = duplicates.excluded.length;
  plan.stats.errors = plan.errors.length;
  return plan;
}
function buildBasePlan({
  tableId,
  sheets,
  columns,
  records,
  rules,
  keys,
  keyMode = "composite",
  references = {},
}) {
  const errors = [],
    warnings = [],
    changes = [],
    details = [];
  const stats = { added: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0 };
  const error = (message, location = {}) =>
    errors.push({ ...location, message });
  const columnById = Object.assign(
    Object.create(null),
    Object.fromEntries(columns.map((c) => [c.id, c])),
  );
  if (!tableId) error("Aucune table cible sélectionnée.");
  if (!keys?.length)
    error("Choisir au moins une colonne clé pour identifier les lignes.");
  for (const key of keys ?? [])
    if (!columnById[key] || columnById[key].isFormula)
      error(`Clé invalide : ${key}.`);
  if (!["composite", "fallback"].includes(keyMode))
    error("Mode de clé inconnu.");
  if (!sheets?.length) error("Sélectionner une feuille Excel.");
  if (sheets?.reduce((count, sheet) => count + sheet.rows.length, 0) > 100000)
    error("L’import est limité à 100 000 lignes au total.");
  if (errors.length)
    return {
      tableId,
      errors,
      warnings,
      changes,
      details,
      stats: { ...stats, errors: errors.length },
    };
  const keyValue = (row, key) =>
    isEmpty(row[key])
      ? null
      : JSON.stringify(
          typeof row[key] === "string" ? row[key].trim() : row[key],
        );
  const composite = (row) =>
    keys.every((k) => keyValue(row, k) !== null)
      ? JSON.stringify(keys.map((k) => keyValue(row, k)))
      : null;
  const indices = keys.map((key) => {
    const index = new Map();
    for (const record of records) {
      const value = keyValue(record, key);
      if (value !== null)
        index.set(value, [...(index.get(value) ?? []), record]);
    }
    return index;
  });
  const compositeIndex = new Map();
  for (const record of records) {
    const value = composite(record);
    if (value)
      compositeIndex.set(value, [...(compositeIndex.get(value) ?? []), record]);
  }
  const seenSource = new Set(),
    seenTargets = new Set();
  for (const sheet of sheets) {
    const targets = Object.values(sheet.mapping).filter(Boolean);
    if (new Set(targets).size !== targets.length) {
      error("Plusieurs colonnes Excel ciblent la même colonne Grist.", {
        sheet: sheet.name,
      });
      continue;
    }
    const availableKeys = keys.filter((k) => targets.includes(k));
    if (
      keyMode === "composite"
        ? availableKeys.length !== keys.length
        : !availableKeys.length
    ) {
      error(
        `La correspondance des colonnes clés est incomplète : associer une colonne Excel à ${keys
          .filter((k) => !targets.includes(k))
          .map((k) => columnById[k].label || k)
          .join(", ")}.`,
        {
          sheet: sheet.name,
        },
      );
      continue;
    }
    for (const header of sheet.headers) {
      const target = sheet.mapping[header];
      if (!target) {
        warnings.push({
          sheet: sheet.name,
          column: header,
          message: "Colonne non importée.",
        });
        continue;
      }
      const col = columnById[target],
        rule = rules[target] ?? "ignore";
      if (!col || col.isFormula)
        error("Colonne cible absente ou calculée.", {
          sheet: sheet.name,
          column: header,
        });
      else if (!Object.hasOwn(RULES, rule))
        error("Règle inconnue.", { sheet: sheet.name, column: header });
      else if (
        rule === "update_if_newer" &&
        col.type !== "Date" &&
        !col.type.startsWith("DateTime:")
      )
        error(
          "« Plus récent » est réservé aux dates. Choisir « Remplacer si renseigné » pour un booléen.",
          { sheet: sheet.name, column: header },
        );
      else if (
        rule === "append_if_different" &&
        !["Text", "ChoiceList"].includes(col.type) &&
        !col.type.startsWith("RefList:")
      )
        error("« Ajouter sans répéter » exige une colonne Texte ou Liste.", {
          sheet: sheet.name,
          column: header,
        });
      else if (rule === "ignore" && !keys.includes(target))
        warnings.push({
          sheet: sheet.name,
          column: header,
          message:
            "La règle conserve les valeurs existantes ; elle autorise le renseignement des nouvelles lignes.",
        });
    }
    for (let i = 0; i < sheet.rows.length; i++) {
      const raw = sheet.rows[i];
      const location = {
        sheet: sheet.name,
        row: sheet.rowNumbers?.[i] ?? i + 2,
      };
      if (raw.every(isEmpty)) {
        stats.skipped++;
        continue;
      }
      const line = Object.create(null),
        errorsBefore = errors.length;
      sheet.headers.forEach((header, index) => {
        const target = sheet.mapping[header],
          col = columnById[target];
        if (
          !col ||
          col.isFormula ||
          (!keys.includes(target) &&
            ["ignore", "match"].includes(rules[target] ?? "ignore"))
        )
          return;
        try {
          line[target] = convertValue(raw[index], col, {
            date1904: sheet.date1904,
            references,
          });
        } catch (e) {
          error(e.message, { ...location, column: header });
        }
      });
      if (errors.length > errorsBefore) continue;
      let existing;
      const signature =
        keyMode === "composite"
          ? composite(line)
          : keys
              .map((k) => [k, keyValue(line, k)])
              .filter(([, v]) => v !== null);
      if (keyMode === "composite" ? !signature : !signature.length) {
        error(
          `Identifiant vide ou incomplet : ${keys
            .filter((k) => isEmpty(line[k]))
            .map((k) => columnById[k].label || k)
            .join(
              ", ",
            )}. La colonne est associée, mais la cellule Excel est vide.`,
          location,
        );
        continue;
      }
      const sourceTokens =
        keyMode === "composite"
          ? [signature]
          : signature.map((v) => JSON.stringify(v));
      if (sourceTokens.some((t) => seenSource.has(t))) {
        error("Identifiant répété dans les feuilles sélectionnées.", location);
        continue;
      }
      sourceTokens.forEach((t) => seenSource.add(t));
      if (keyMode === "composite") {
        const hits = compositeIndex.get(signature) ?? [];
        if (hits.length > 1) {
          error(
            "Identifiant ambigu : plusieurs lignes Grist correspondent.",
            location,
          );
          continue;
        }
        existing = hits[0];
      } else {
        const hits = keys.flatMap(
          (k, index) => indices[index].get(keyValue(line, k)) ?? [],
        );
        const ids = new Set(hits.map((r) => r.id));
        if (ids.size > 1) {
          error(
            "Les clés de secours désignent plusieurs lignes Grist.",
            location,
          );
          continue;
        }
        existing = hits[0];
      }
      if (existing && seenTargets.has(existing.id)) {
        error(
          "Cette ligne Grist est déjà ciblée par une autre ligne Excel.",
          location,
        );
        continue;
      }
      if (existing) seenTargets.add(existing.id);
      // A supplied fallback identifier must agree with an existing non-empty identifier.
      if (
        existing &&
        keyMode === "fallback" &&
        keys.some(
          (k) =>
            !isEmpty(line[k]) &&
            !isEmpty(existing[k]) &&
            !equal(line[k], existing[k]),
        )
      ) {
        error(
          "Une clé de secours contredit l’identifiant déjà présent dans Grist.",
          location,
        );
        continue;
      }
      // Legacy rules describe updates. Explicitly configured fields, including
      // ignore/match, have always been populated on newly created records.
      if (!existing) {
        sheet.headers.forEach((header, index) => {
          const target = sheet.mapping[header],
            col = columnById[target];
          if (
            !col ||
            col.isFormula ||
            keys.includes(target) ||
            !Object.hasOwn(rules, target) ||
            !["ignore", "match"].includes(rules[target])
          )
            return;
          try {
            line[target] = convertValue(raw[index], col, {
              date1904: sheet.date1904,
              references,
            });
          } catch (e) {
            error(e.message, { ...location, column: header });
          }
        });
      }
      const before = {},
        after = {};
      for (const [id, incoming] of Object.entries(line)) {
        const rule = rules[id] ?? "ignore";
        if (
          existing &&
          (keys.includes(id) || ["ignore", "match"].includes(rule))
        )
          continue;
        if (isEmpty(incoming)) continue;
        try {
          const next = existing
            ? nextValue(rule, incoming, existing[id], columnById[id].type)
            : incoming;
          if (
            existing &&
            ["fill_if_empty", "update_if_newer"].includes(rule) &&
            equal(next, existing[id]) &&
            !equal(incoming, existing[id])
          ) {
            warnings.push({
              ...location,
              column: id,
              message: `La règle « ${RULES[rule][0]} » conserve la valeur Grist, différente d’Excel.`,
            });
          }
          if (!existing || !equal(next, existing[id])) {
            before[id] = existing?.[id] ?? null;
            after[id] = next;
          }
        } catch (e) {
          error(e.message, { ...location, column: id });
        }
      }
      if (errors.length > errorsBefore) continue;
      if (!existing) {
        changes.push({ kind: "add", ...location, after });
        stats.added++;
        details.push({ ...location, status: "Ajout", before: {}, after });
      } else if (Object.keys(after).length) {
        changes.push({
          kind: "update",
          id: existing.id,
          ...location,
          before,
          after,
        });
        stats.updated++;
        details.push({ ...location, status: "Modification", before, after });
      } else {
        stats.unchanged++;
        details.push({
          ...location,
          status: "Inchangée",
          before: {},
          after: {},
        });
      }
    }
  }
  stats.errors = errors.length;
  return { tableId, errors, warnings, changes, details, stats };
}
