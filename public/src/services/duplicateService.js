import { isEmpty } from "./utils.js";
import { formatValue } from "./dateService.js";

// Group connected identifiers across all selected sheets, including fallback keys.
// Choices only filter source rows; they never merge fields or alter Grist records.
export function resolveSourceDuplicates(input, convertValue) {
  const {
    sheets = [],
    columns = [],
    keys = [],
    keyMode = "composite",
    records = [],
    references = {},
    duplicateResolutions = {},
  } = input;
  if (
    !keys.length ||
    !["composite", "fallback"].includes(keyMode) ||
    sheets.reduce((n, s) => n + s.rows.length, 0) > 100000
  )
    return { sheets, groups: [], excluded: [], errors: [] };
  const cols = new Map(columns.map((c) => [c.id, c]));
  if (keys.some((k) => !cols.has(k) || cols.get(k).isFormula))
    return { sheets, groups: [], excluded: [], errors: [] };
  const valueToken = (value) =>
    isEmpty(value)
      ? null
      : JSON.stringify(typeof value === "string" ? value.trim() : value);
  const tokensFor = (line) => {
    const parts = keys.map((k) => valueToken(line[k]));
    return keyMode === "composite"
      ? parts.includes(null)
        ? []
        : [JSON.stringify(parts)]
      : parts.flatMap((v, i) =>
          v === null ? [] : [JSON.stringify([keys[i], v])],
        );
  };
  const targets = new Map();
  for (const record of records)
    for (const token of tokensFor(record)) {
      if (!targets.has(token)) targets.set(token, new Set());
      targets.get(token).add(record.id);
    }
  const nodes = [],
    owners = new Map(),
    parents = [];
  const root = (i) => {
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]];
      i = parents[i];
    }
    return i;
  };
  sheets.forEach((sheet, si) => {
    const mapped = Object.values(sheet.mapping).filter(Boolean);
    if (new Set(mapped).size !== mapped.length) return;
    sheet.rows.forEach((raw, ri) => {
      const line = Object.create(null);
      try {
        sheet.headers.forEach((h, j) => {
          const id = sheet.mapping[h];
          if (keys.includes(id))
            line[id] = convertValue(raw[j], cols.get(id), {
              date1904: sheet.date1904,
              references,
            });
        });
      } catch {
        return;
      }
      const tokens = tokensFor(line);
      if (!tokens.length) return;
      const hits = new Set(tokens.flatMap((t) => [...(targets.get(t) || [])]));
      const links = tokens.map((t) => "key:" + t);
      if (hits.size === 1) links.push("record:" + [...hits][0]);
      const n = nodes.length;
      parents.push(n);
      nodes.push({
        si,
        ri,
        id: `${si}:${ri}`,
        sheet: sheet.name,
        row: sheet.rowNumbers?.[ri] ?? ri + 2,
        raw,
        line,
      });
      for (const token of links) {
        if (owners.has(token)) parents[root(n)] = root(owners.get(token));
        else owners.set(token, n);
      }
    });
  });
  const clusters = new Map();
  nodes.forEach((node, i) => {
    const r = root(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(node);
  });
  const groups = [],
    excluded = [],
    errors = [],
    omit = new Set();
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    const id = members.map((m) => m.id).join("|");
    const fieldIds = [
      ...new Set(
        members.flatMap((m) =>
          Object.values(sheets[m.si].mapping).filter(Boolean),
        ),
      ),
    ];
    const fields = fieldIds
      .filter((id) => cols.has(id))
      .map((id) => ({
        id,
        label: cols.get(id).label || id,
        type: cols.get(id).type,
      }));
    const display = members.map((m) => ({
      ...m,
      values: Object.fromEntries(
        fields.map((c) => {
          const s = sheets[m.si],
            index = s.headers.findIndex((h) => s.mapping[h] === c.id),
            value = index < 0 ? null : m.raw[index];
          let text = value == null ? "Vide" : String(value);
          try {
            text = formatValue(
              convertValue(value, cols.get(c.id), {
                date1904: s.date1904,
                references,
              }),
              c.type,
            );
          } catch {}
          return [c.id, text];
        }),
      ),
    }));
    const differing = fields
      .filter((c) => new Set(display.map((m) => m.values[c.id])).size > 1)
      .map((c) => c.label);
    const choice = duplicateResolutions[id] || "";
    let selected = null,
      problem = "";
    if (choice.startsWith("row:")) {
      selected = members.find((m) => m.id === choice.slice(4));
      if (!selected) problem = "La ligne choisie n’est plus disponible.";
    } else if (choice.startsWith("latest:")) {
      const dateId = choice.slice(7),
        column = cols.get(dateId);
      if (
        !column ||
        !(column.type === "Date" || column.type.startsWith("DateTime:"))
      )
        problem = "Choisissez une colonne de type Date ou Date et heure.";
      else {
        try {
          const dated = members.map((m) => {
            const s = sheets[m.si],
              i = s.headers.findIndex((h) => s.mapping[h] === dateId);
            if (i < 0 || isEmpty(m.raw[i])) throw Error("missing");
            return {
              m,
              date: convertValue(m.raw[i], column, {
                date1904: s.date1904,
                references,
              }),
            };
          });
          const max = dated.reduce(
              (max, d) => Math.max(max, d.date),
              -Infinity,
            ),
            latest = dated.filter((d) => d.date === max);
          if (latest.length !== 1)
            problem =
              "Plusieurs lignes ont la même date la plus récente : choisissez une ligne ou écartez ce groupe.";
          else selected = latest[0].m;
        } catch {
          problem =
            "Une date est vide ou invalide : choisissez une ligne ou corrigez le fichier.";
        }
      }
    } else if (choice && choice !== "skip")
      problem = "Choix de traitement inconnu.";
    const resolved = choice === "skip" || !!selected;
    if (!resolved)
      errors.push({
        sheet: members[0].sheet,
        row: members[0].row,
        duplicateGroup: id,
        message:
          problem ||
          "Identifiant répété : choisissez une action dans « Doublons du fichier ».",
      });
    for (const m of members)
      if (!resolved || m !== selected) {
        omit.add(m.id);
        if (resolved)
          excluded.push({
            sheet: m.sheet,
            row: m.row,
            status: "Écartée",
            before: {},
            after: {},
            message:
              choice === "skip"
                ? "Groupe écarté par votre choix."
                : `Ligne non retenue ; conservation de ${selected.sheet}, ligne ${selected.row}.`,
          });
      }
    groups.push({
      id,
      fields,
      differing,
      rows: display.map(({ id, sheet, row, values }) => ({
        id,
        sheet,
        row,
        values,
      })),
      choice,
      resolved,
      problem,
      selected: selected?.id,
    });
  }
  return {
    groups,
    excluded,
    errors,
    sheets: sheets.map((s, si) => ({
      ...s,
      rows: s.rows.filter((_, ri) => !omit.has(`${si}:${ri}`)),
      rowNumbers: s.rows
        .map((_, ri) => s.rowNumbers?.[ri] ?? ri + 2)
        .filter((_, ri) => !omit.has(`${si}:${ri}`)),
    })),
  };
}
