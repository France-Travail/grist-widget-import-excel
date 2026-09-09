import { tableRecords, normalizeName, equal } from "./utils.js";
import { buildImportPlan } from "./importEngine.js";

export async function fetchSchema(api, tableId) {
  const [tables, cols] = await Promise.all([
    api.fetchTable("_grist_Tables"),
    api.fetchTable("_grist_Tables_column"),
  ]);
  const tableRef = tables.id[tables.tableId.indexOf(tableId)];
  if (tableRef == null)
    throw new Error("Table cible introuvable ou inaccessible.");
  return tableRecords(cols)
    .filter(
      (c) =>
        c.parentId === tableRef &&
        c.colId !== "manualSort" &&
        !c.colId.startsWith("gristHelper_"),
    )
    .map((c) => ({
      id: c.colId,
      label: c.label || c.colId,
      type: c.type,
      isFormula: Boolean(c.isFormula && c.formula),
      visibleCol: c.visibleCol,
      ref: c.id,
    }));
}

export async function fetchRules(api, columns) {
  const tables = await api.listTables();
  if (!tables.includes("RULES_CONFIG"))
    return {
      rules: Object.fromEntries(
        columns.filter((c) => !c.isFormula).map((c) => [c.id, "ignore"]),
      ),
      keys: [],
      keyMode: "composite",
      missing: true,
      warnings: [],
    };
  const data = await api.fetchTable("RULES_CONFIG");
  if (!data.col_name || !data.rule || !data.is_key)
    throw new Error("RULES_CONFIG doit contenir col_name, rule et is_key.");
  const rules = Object.create(null),
    keys = [],
    warnings = [];
  const modes = new Set();
  for (const row of tableRecords(data)) {
    if (!row.col_name) continue;
    const matches = columns.filter((c) => c.id === row.col_name);
    const candidates = matches.length
      ? matches
      : columns.filter((c) =>
          [c.id, c.label].some(
            (v) => normalizeName(v) === normalizeName(row.col_name),
          ),
        );
    if (candidates.length !== 1) {
      warnings.push(`Règle non résolue : ${row.col_name}.`);
      continue;
    }
    const column = candidates[0];
    if (Object.hasOwn(rules, column.id))
      throw new Error(`Plusieurs règles concernent ${column.label}.`);
    rules[column.id] = String(row.rule ?? "").trim();
    if (
      ["1", "true", "vrai", "oui", "yes"].includes(
        String(row.is_key).trim().toLowerCase(),
      )
    )
      keys.push({ id: column.id, priority: Number(row.key_priority) || 999 });
    if (row.key_mode) modes.add(row.key_mode);
  }
  if (modes.size > 1)
    throw new Error(
      "RULES_CONFIG contient plusieurs modes de clé contradictoires.",
    );
  keys.sort((a, b) => a.priority - b.priority);
  return {
    rules,
    keys: keys.map((k) => k.id),
    keyMode: [...modes][0] || "composite",
    missing: false,
    warnings,
  };
}

export async function fetchReferences(api, columns, targetIds) {
  const refs = {},
    cache = new Map();
  for (const col of columns.filter(
    (c) => targetIds.includes(c.id) && /^(Ref|RefList):/.test(c.type),
  )) {
    const tableId = col.type.split(":")[1];
    if (!cache.has(tableId))
      cache.set(
        tableId,
        Promise.all([api.fetchTable(tableId), fetchSchema(api, tableId)]),
      );
    let data, refCols;
    try {
      [data, refCols] = await cache.get(tableId);
    } catch {
      continue;
    } // Conversion reports inaccessible references only if used.
    const visibleCol = refCols.find((c) => c.ref === col.visibleCol)?.id;
    const labels = Object.create(null);
    if (visibleCol)
      for (const row of tableRecords(data)) {
        const label = String(row[visibleCol] ?? "").trim();
        if (label) labels[label] = [...(labels[label] ?? []), row.id];
      }
    refs[col.id] = { ids: data.id, visibleCol, labels };
  }
  return refs;
}

export async function prepareImport(api, input) {
  const columns = await fetchSchema(api, input.tableId);
  const records = tableRecords(await api.fetchTable(input.tableId)); // Entire table, independent of widget filters.
  const targets = [
    ...new Set(input.sheets.flatMap((s) => Object.values(s.mapping))),
  ];
  const references = await fetchReferences(
    api,
    columns,
    targets.filter(
      (id) => input.keys.includes(id) || Object.hasOwn(input.rules, id),
    ),
  );
  const plan = buildImportPlan({ ...input, columns, records, references });
  return {
    ...plan,
    columns,
    input: structuredClone(input),
    snapshot: JSON.stringify({ columns, records, references }),
  };
}

export async function applyImport(api, plan) {
  if (plan.errors.length)
    throw new Error("Corriger les erreurs avant d’importer.");
  const fresh = await prepareImport(api, plan.input);
  if (fresh.snapshot !== plan.snapshot || !equal(fresh.changes, plan.changes)) {
    throw new Error(
      "La table ou ses références ont changé depuis la vérification. Relancer la vérification.",
    );
  }
  if (!plan.changes.length) return null;
  const actions = plan.changes.map((change) => [
    change.kind === "add" ? "AddRecord" : "UpdateRecord",
    plan.tableId,
    change.kind === "add" ? null : change.id,
    change.after,
  ]);
  // One Grist transaction: an action error rolls back the whole import.
  const response = await api.applyUserActions(actions);
  const undo = {
    tableId: plan.tableId,
    changes: plan.changes.map((change, i) => ({
      ...change,
      id: change.kind === "add" ? response.retValues?.[i] : change.id,
    })),
  };
  // Never report a failed import after a successful write merely because this read fails.
  try {
    const after = tableRecords(await api.fetchTable(plan.tableId));
    const writable = plan.columns.filter((c) => !c.isFormula).map((c) => c.id);
    for (const change of undo.changes) {
      const row = after.find((r) => r.id === change.id);
      if (!row) throw new Error("Ligne créée introuvable.");
      if (
        Object.entries(change.after).some(
          ([key, value]) => !equal(row[key], value),
        )
      )
        throw new Error("Une valeur importée a changé.");
      change.expected = Object.fromEntries(
        writable.map((k) => [k, row[k] ?? null]),
      );
    }
    undo.columns = writable;
  } catch {
    undo.unavailable = true;
  }
  return undo;
}

export async function rollbackImport(api, undo) {
  if (!undo || undo.unavailable)
    throw new Error(
      "Annulation locale indisponible. Utiliser l’historique Grist.",
    );
  const records = tableRecords(await api.fetchTable(undo.tableId));
  const index = new Map(records.map((r) => [r.id, r]));
  for (const change of undo.changes) {
    const row = index.get(change.id);
    if (
      !row ||
      undo.columns.some((k) => !equal(row[k] ?? null, change.expected[k]))
    ) {
      throw new Error(
        "Une ligne importée a été modifiée ou supprimée depuis l’import. Annulation bloquée ; consulter l’historique Grist.",
      );
    }
  }
  await api.applyUserActions(
    [...undo.changes]
      .reverse()
      .map((change) =>
        change.kind === "add"
          ? ["RemoveRecord", undo.tableId, change.id]
          : ["UpdateRecord", undo.tableId, change.id, change.before],
      ),
  );
}

/** Save only on explicit UI action; existing documents are never migrated at startup. */
export async function saveRules(api, columns, config) {
  if (!config.keys.length)
    throw new Error("Sélectionner une clé avant d’enregistrer.");
  const tables = await api.listTables(),
    actions = [];
  const fields = {
    col_name: "Text",
    rule: "Text",
    is_key: "Bool",
    key_mode: "Text",
    key_priority: "Int",
  };
  const exists = tables.includes("RULES_CONFIG");
  const data = exists ? await api.fetchTable("RULES_CONFIG") : { id: [] };
  if (!exists)
    actions.push([
      "AddTable",
      "RULES_CONFIG",
      Object.entries(fields).map(([id, type]) => ({ id, type })),
    ]);
  else
    for (const [id, type] of Object.entries(fields))
      if (!data[id]) actions.push(["AddColumn", "RULES_CONFIG", id, { type }]);
  const oldRows = tableRecords(data);
  const usedRows = new Set();
  for (const col of columns) {
    const exact = oldRows.filter((r) => r.col_name === col.id);
    const matches = exact.length
      ? exact
      : oldRows.filter(
          (r) =>
            !columns.some((c) => c.id === r.col_name) &&
            (normalizeName(r.col_name) === normalizeName(col.label) ||
              normalizeName(r.col_name) === normalizeName(col.id)),
        );
    if (matches.length > 1)
      throw new Error(
        `Règles en double pour ${col.label} : corriger RULES_CONFIG.`,
      );
    const row = matches[0];
    if (row && usedRows.has(row.id))
      throw new Error(
        "Une règle existante correspond à plusieurs colonnes. Corriger les libellés avant d’enregistrer.",
      );
    if (row) usedRows.add(row.id);
    if (col.isFormula && !row) continue;
    const values = {
      col_name: col.id,
      rule: col.isFormula ? "ignore" : (config.rules[col.id] ?? "ignore"),
      is_key: !col.isFormula && config.keys.includes(col.id),
      key_mode: config.keyMode,
      key_priority: config.keys.indexOf(col.id) + 1,
    };
    actions.push([
      row ? "UpdateRecord" : "AddRecord",
      "RULES_CONFIG",
      row?.id ?? null,
      values,
    ]);
  }
  await api.applyUserActions(actions);
}
