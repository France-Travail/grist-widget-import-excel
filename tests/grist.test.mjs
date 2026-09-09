import test from "node:test";
import assert from "node:assert/strict";
import {
  saveRules,
  fetchSchema,
  fetchRules,
  prepareImport,
  applyImport,
  rollbackImport,
} from "../public/src/services/gristService.js";
function mock() {
  const data = {
    _grist_Tables: { id: [1], tableId: ["Test"] },
    _grist_Tables_column: {
      id: [1, 2, 3],
      parentId: [1, 1, 1],
      colId: ["Key", "Date", "Calc"],
      label: ["Key", "Date", "Calc"],
      type: ["Text", "Date", "Numeric"],
      isFormula: [false, false, true],
      formula: ["", "", "$Key"],
    },
    Test: { id: [], Key: [], Date: [], Calc: [] },
    RULES_CONFIG: {
      id: [1, 2],
      col_name: ["Key", "Date"],
      is_key: ["false", "True"],
      rule: ["match", "overwrite"],
    },
  };
  const calls = [];
  return {
    data,
    calls,
    api: {
      listTables: async () => Object.keys(data),
      fetchTable: async (name) => structuredClone(data[name]),
      applyUserActions: async (actions) => {
        calls.push(actions);
        const retValues = [];
        for (const [kind, table, rowId, values] of actions) {
          const t = data[table];
          if (kind === "AddRecord") {
            const id = Math.max(0, ...t.id) + 1;
            t.id.push(id);
            for (const k of Object.keys(t).filter((k) => k !== "id"))
              t[k].push(values[k] ?? null);
            retValues.push(id);
          }
          if (kind === "UpdateRecord") {
            const i = t.id.indexOf(rowId);
            for (const [k, v] of Object.entries(values)) t[k][i] = v;
            retValues.push(null);
          }
          if (kind === "RemoveRecord") {
            const i = t.id.indexOf(rowId);
            for (const v of Object.values(t)) v.splice(i, 1);
            retValues.push(null);
          }
        }
        return { retValues };
      },
    },
  };
}
const input = {
  tableId: "Test",
  rules: { Key: "match", Date: "overwrite" },
  keys: ["Key"],
  sheets: [
    {
      name: "Sheet",
      headers: ["Key", "Date"],
      mapping: { Key: "Key", Date: "Date" },
      rows: [["000042", "10/12/2025"]],
    },
  ],
};
test("Schéma lu dans les métadonnées même si la table est vide", async () => {
  const { api } = mock();
  const cols = await fetchSchema(api, "Test");
  assert.equal(cols[1].type, "Date");
  assert.equal(cols[2].isFormula, true);
});
test("Anciennes règles : le texte false ne devient pas une clé", async () => {
  const { api } = mock();
  const config = await fetchRules(api, await fetchSchema(api, "Test"));
  assert.deepEqual(config.keys, ["Date"]);
});
test("Préparation seule sans écriture puis transaction unique et annulation", async () => {
  const { api, calls, data } = mock();
  const plan = await prepareImport(api, input);
  assert.equal(calls.length, 0);
  const undo = await applyImport(api, plan);
  assert.equal(calls.length, 1);
  assert.equal(data.Test.Date[0], 1765324800);
  await rollbackImport(api, undo);
  assert.equal(data.Test.id.length, 0);
});
test("Nouvelle donnée depuis aperçu bloque l’import sans écrire", async () => {
  const { api, calls, data } = mock();
  const plan = await prepareImport(api, input);
  data.Test.id.push(1);
  data.Test.Key.push("other");
  data.Test.Date.push(null);
  data.Test.Calc.push(0);
  await assert.rejects(applyImport(api, plan), /changé/);
  assert.equal(calls.length, 0);
});
test("Annulation refuse d’écraser une modification ultérieure", async () => {
  const { api, data, calls } = mock();
  const undo = await applyImport(api, await prepareImport(api, input));
  data.Test.Date[0] = 0;
  await assert.rejects(rollbackImport(api, undo), /modifiée/);
  assert.equal(calls.length, 1);
});
test("Échec de transaction remonte sans tentative d’annulation partielle", async () => {
  const { api } = mock();
  const plan = await prepareImport(api, input);
  api.applyUserActions = async () => {
    throw new Error("Denied");
  };
  await assert.rejects(applyImport(api, plan), /Denied/);
});
test("Annulation restaure la valeur avant une mise à jour", async () => {
  const { api, data } = mock();
  data.Test = { id: [1], Key: ["000042"], Date: [0], Calc: [123] };
  const undo = await applyImport(api, await prepareImport(api, input));
  data.Test.Calc[0] = 456; // Recalculated formulas do not cause false rollback conflicts.
  await rollbackImport(api, undo);
  assert.equal(data.Test.Date[0], 0);
});

test("Charger une configuration historique ne modifie ni ses cellules ni son schéma", async () => {
  const { api, data, calls } = mock();
  const before = structuredClone(data.RULES_CONFIG);
  const config = await fetchRules(api, await fetchSchema(api, "Test"));
  assert.deepEqual(data.RULES_CONFIG, before);
  assert.equal(calls.length, 0);
  assert.deepEqual(config.keys, ["Date"]);
});

test("Sauvegarde explicite : conserve les lignes et les colonnes historiques", async () => {
  const { api, data } = mock();
  const columns = await fetchSchema(api, "Test");
  let saved;
  api.applyUserActions = async (actions) => {
    saved = actions;
    return { retValues: [] };
  };
  await saveRules(api, columns, {
    rules: { Key: "match", Date: "fill_if_empty" },
    keys: ["Key"],
    keyMode: "composite",
  });
  assert.ok(saved.every((a) => ["AddColumn", "UpdateRecord"].includes(a[0])));
  assert.deepEqual(
    saved
      .filter((a) => a[0] === "AddColumn")
      .map((a) => a[2])
      .sort(),
    ["key_mode", "key_priority"],
  );
  const updates = saved.filter((a) => a[0] === "UpdateRecord");
  assert.deepEqual(
    updates.map((a) => a[2]),
    data.RULES_CONFIG.id,
  );
  assert.equal(updates[0][3].is_key, true);
  assert.equal(updates[1][3].rule, "fill_if_empty");
});

test("Sauvegarde : un libellé homonyme ne détourne pas une règle identifiée par son ID", async () => {
  const { api, data } = mock();
  data.RULES_CONFIG.col_name = ["A", "B"];
  let saved;
  api.applyUserActions = async (actions) => {
    saved = actions;
    return {};
  };
  await saveRules(
    api,
    [
      { id: "A", label: "B" },
      { id: "B", label: "A" },
    ],
    {
      rules: { A: "overwrite", B: "ignore" },
      keys: ["A"],
      keyMode: "composite",
    },
  );
  assert.deepEqual(
    saved
      .filter((a) => a[0] === "UpdateRecord")
      .map((a) => [a[2], a[3].col_name]),
    [
      [1, "A"],
      [2, "B"],
    ],
  );
});
