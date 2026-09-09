import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImportPlan,
  matchColumns,
  convertValue,
} from "../public/src/services/importEngine.js";
const columns = [
  { id: "Identifier", label: "Identifiant", type: "Text" },
  { id: "Date", label: "Date", type: "Date" },
  { id: "Active", label: "Actif", type: "Bool" },
  { id: "Note", label: "Note", type: "Text" },
  { id: "Count", label: "Nombre", type: "Int" },
  { id: "Computed", label: "Calcul", type: "Text", isFormula: true },
];
function input(rows, overrides = {}) {
  return {
    tableId: "Test",
    columns,
    records: [],
    rules: {
      Identifier: "match",
      Date: "overwrite",
      Active: "overwrite",
      Note: "overwrite",
      Count: "overwrite",
    },
    keys: ["Identifier"],
    sheets: [
      {
        name: "Feuille",
        headers: ["Identifier", "Date", "Active", "Note", "Count"],
        rows,
        mapping: {
          Identifier: "Identifier",
          Date: "Date",
          Active: "Active",
          Note: "Note",
          Count: "Count",
        },
      },
    ],
    ...overrides,
  };
}
test("Régression import date française et booléens ; clé texte à zéro initial préservée", () => {
  const result = buildImportPlan(
    input([["000042", "10/12/2025", 1, "test", 0]]),
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.changes[0].after, {
    Identifier: "000042",
    Date: 1765324800,
    Active: true,
    Note: "test",
    Count: 0,
  });
});
test("Une date Excel et une date Grist identiques ne produisent pas de mise à jour", () => {
  const result = buildImportPlan(
    input([["A", 46001]], {
      records: [{ id: 1, Identifier: "A", Date: 1765324800 }],
    }),
  );
  assert.equal(result.stats.unchanged, 1);
});
test("Plus récent compare des secondes Grist, pas des chaînes ou millisecondes", () => {
  const args = input([["A", "01/01/2026"]], {
    records: [{ id: 1, Identifier: "A", Date: 1765324800 }],
  });
  args.rules.Date = "update_if_newer";
  assert.equal(buildImportPlan(args).stats.updated, 1);
  args.sheets[0].rows[0][1] = "01/01/2025";
  assert.equal(buildImportPlan(args).stats.unchanged, 1);
  args.records[0].Date = null;
  assert.equal(buildImportPlan(args).stats.updated, 1);
});
test("Une date invalide bloque le plan et donne la ligne Excel exacte", () => {
  const args = input([["A", "31/02/2025"]]);
  args.sheets[0].rowNumbers = [12];
  const plan = buildImportPlan(args);
  assert.equal(plan.errors[0].row, 12);
  assert.equal(plan.errors[0].column, "Date");
  assert.equal(plan.changes.length, 0);
});
test("Règle date sur booléen signalée explicitement", () => {
  const args = input([["A", null, 1]]);
  args.rules.Active = "update_if_newer";
  assert.match(buildImportPlan(args).errors[0].message, /réservé aux dates/);
});
test("Overwrite vide conserve Grist, false et zéro remplacent", () => {
  const args = input([["A", "", false, "", 0]], {
    records: [
      {
        id: 1,
        Identifier: "A",
        Date: 123,
        Active: true,
        Note: "keep",
        Count: 10,
      },
    ],
  });
  assert.deepEqual(buildImportPlan(args).changes[0].after, {
    Active: false,
    Count: 0,
  });
});
test("Fill_if_empty conserve false et zéro", () => {
  const args = input([["A", "", true, "", 3]], {
    records: [{ id: 1, Identifier: "A", Active: false, Count: 0 }],
  });
  args.rules.Active = args.rules.Count = "fill_if_empty";
  assert.equal(buildImportPlan(args).stats.unchanged, 1);
});
test("Ignore conserve l’existant, mais renseigne les nouvelles lignes comme l’ancien widget", () => {
  const args = input([["A", "10/12/2025", true]]);
  args.rules.Date = "ignore";
  args.rules.Identifier = "ignore";
  const plan = buildImportPlan(args);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.changes[0].after, {
    Identifier: "A",
    Date: 1765324800,
    Active: true,
  });
  args.records = [{ id: 1, Identifier: "A", Date: 0, Active: true }];
  args.sheets[0].rows[0][1] = "invalid";
  const update = buildImportPlan(args);
  assert.deepEqual(update.errors, []);
  assert.equal(update.changes.length, 0);
});
test("Colonnes calculées protégées", () => {
  const args = input([["A", "x"]]);
  args.sheets[0].mapping.Date = "Computed";
  assert.match(buildImportPlan(args).errors[0].message, /calculée/);
});
test("Clé obligatoire et correspondance obligatoire", () => {
  assert.ok(buildImportPlan(input([["A"]], { keys: [] })).errors.length);
  const args = input([["A"]]);
  args.sheets[0].mapping.Identifier = "";
  assert.match(buildImportPlan(args).errors[0].message, /incomplète/);
});
test("Clés vides bloquées, prototype JavaScript traité comme une clé normale", () => {
  assert.ok(buildImportPlan(input([["", "10/12/2025"]])).errors.length);
  assert.equal(
    buildImportPlan(input([["__proto__", "10/12/2025"]])).stats.added,
    1,
  );
});
test("Doublons dans Excel détectés avant écriture", () => {
  assert.match(
    buildImportPlan(input([["A"], ["A"]])).errors[0].message,
    /répété/,
  );
});
test("Doublons dans Grist ne sélectionnent jamais arbitrairement une ligne", () => {
  const result = buildImportPlan(
    input([["A"]], {
      records: [
        { id: 1, Identifier: "A" },
        { id: 2, Identifier: "A" },
      ],
    }),
  );
  assert.match(result.errors[0].message, /ambigu/);
});
test("Multi-feuilles contrôle les doublons entre feuilles", () => {
  const args = input([["A"]]);
  args.sheets.push({ ...args.sheets[0], name: "Deuxième" });
  assert.match(buildImportPlan(args).errors[0].message, /répété/);
});
test("Clé composite conserve les frontières entre les valeurs", () => {
  const args = input(
    [
      ["a|b", "", "", "c"],
      ["a", "", "", "b|c"],
    ],
    { keys: ["Identifier", "Note"] },
  );
  assert.equal(buildImportPlan(args).stats.added, 2);
});
test("Fallback trouve une ligne par une clé secondaire et refuse les contradictions", () => {
  const args = input([["", "", "", "secondary"]], {
    keys: ["Identifier", "Note"],
    keyMode: "fallback",
    records: [{ id: 1, Identifier: "A", Note: "secondary" }],
  });
  assert.equal(buildImportPlan(args).stats.unchanged, 1);
  args.sheets[0].rows[0][0] = "B";
  assert.match(buildImportPlan(args).errors[0].message, /contredit/);
});
test("Fallback contradictoire entre deux lignes Grist bloqué", () => {
  const args = input([["A", "", "", "secondary"]], {
    keys: ["Identifier", "Note"],
    keyMode: "fallback",
    records: [
      { id: 1, Identifier: "A" },
      { id: 2, Identifier: "B", Note: "secondary" },
    ],
  });
  assert.match(buildImportPlan(args).errors[0].message, /plusieurs lignes/);
});
test("Ajouter sans répéter reste idempotent", () => {
  const args = input([["A", "", "", "new"]], {
    records: [{ id: 1, Identifier: "A", Note: "old | new" }],
  });
  args.rules.Note = "append_if_different";
  assert.equal(buildImportPlan(args).stats.unchanged, 1);
});
test("Correspondances par ID ou libellé normalisé, ambiguïtés non devinées", () => {
  assert.deepEqual(
    matchColumns(["Identifiant", "actif", "date", "Calcul"], columns),
    { Identifiant: "Identifier", actif: "Active", date: "Date", Calcul: "" },
  );
  assert.equal(
    matchColumns(
      ["LABEL"],
      [
        { id: "A", label: "Label" },
        { id: "B", label: "Label" },
      ],
    ).LABEL,
    "",
  );
});
test("Deux colonnes sources vers une cible sont refusées", () => {
  const args = input([["A"]]);
  args.sheets[0].mapping.Note = "Identifier";
  assert.ok(buildImportPlan(args).errors.length);
});
test("Références et listes : résolution exacte, ambiguïtés et absences bloquées", () => {
  const col = { id: "Owner", type: "Ref:People" },
    options = {
      references: {
        Owner: {
          labels: { Alice: [7], Bob: [8, 9] },
          ids: [7, 8, 9],
          visibleCol: "Name",
        },
      },
    };
  assert.equal(convertValue("Alice", col, options), 7);
  assert.throws(() => convertValue("Bob", col, options), /ambiguë/);
  assert.throws(() => convertValue("Unknown", col, options), /introuvable/);
  assert.throws(() => convertValue(7, col, options), /introuvable/);
  assert.deepEqual(
    convertValue("Alice;Alice", { ...col, type: "RefList:People" }, options),
    ["L", 7],
  );
});
test("Nombres français, entiers, booléens et listes", () => {
  assert.equal(convertValue("1 234,50", { type: "Numeric" }), 1234.5);
  assert.throws(() => convertValue("1,5", { type: "Int" }));
  assert.throws(() => convertValue("not a number", { type: "Numeric" }));
  assert.equal(convertValue("non", { type: "Bool" }), false);
  assert.deepEqual(convertValue("A; B; A", { type: "ChoiceList" }), [
    "L",
    "A",
    "B",
  ]);
});
test("10 000 lignes préparées sans mutation de la source", () => {
  const args = input(
    Array.from({ length: 10000 }, (_, i) => [String(i), "10/12/2025"]),
  );
  const original = JSON.stringify(args);
  assert.equal(buildImportPlan(args).stats.added, 10000);
  assert.equal(JSON.stringify(args), original);
});

test("Mise à jour partielle : en-tête différent, clé renseignée et première date Grist vide", () => {
  const args = input([["000042", 46001, 1]], {
    records: [
      {
        id: 7,
        Identifier: "000042",
        Date: null,
        Active: false,
        Note: "Conserver ce champ absent du fichier",
      },
    ],
  });
  args.sheets[0].headers = ["Code du dossier", "Date source", "Traitement"];
  args.sheets[0].mapping = matchColumns(args.sheets[0].headers, columns);
  let result = buildImportPlan(args);
  assert.match(
    result.errors[0].message,
    /associer une colonne Excel à Identifiant/,
  );
  assert.equal(result.changes.length, 0);
  args.sheets[0].mapping = {
    "Code du dossier": "Identifier",
    "Date source": "Date",
    Traitement: "Active",
  };
  args.rules.Date = "fill_if_empty";
  result = buildImportPlan(args);
  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.added, 0);
  assert.equal(result.stats.updated, 1);
  assert.equal(result.changes[0].id, 7);
  assert.deepEqual(result.changes[0].after, { Date: 1765324800, Active: true });
});

test("Une clé non associée et une cellule clé réellement vide ont des diagnostics distincts", () => {
  const args = input([["", "10/12/2025"]]);
  const empty = buildImportPlan(args);
  assert.match(empty.errors[0].message, /cellule Excel est vide/);
  assert.equal(empty.errors[0].row, 2);
  args.sheets[0].mapping.Identifier = "";
  const unmapped = buildImportPlan(args);
  assert.match(unmapped.errors[0].message, /associer une colonne Excel/);
  assert.doesNotMatch(unmapped.errors[0].message, /cellule Excel est vide/);
});

test("Compléter si vide ne remplace pas une date déjà présente ; overwrite permet sa correction", () => {
  const args = input([["000042", "10/12/2025"]], {
    records: [{ id: 7, Identifier: "000042", Date: 46001 }],
  });
  args.rules.Date = "fill_if_empty";
  const retained = buildImportPlan(args);
  assert.equal(retained.stats.unchanged, 1);
  assert.match(
    retained.warnings[0].message,
    /conserve la valeur Grist, différente/,
  );
  args.rules.Date = "overwrite";
  assert.deepEqual(buildImportPlan(args).changes[0].after, {
    Date: 1765324800,
  });
});

test("Ignore à la création convertit aussi une référence configurée", () => {
  const args = input([["A", "", "", "Alice"]]);
  args.columns = args.columns.map((c) =>
    c.id === "Note" ? { ...c, type: "Ref:People" } : c,
  );
  args.rules.Note = "ignore";
  args.references = {
    Note: { labels: { Alice: [7] }, ids: [7], visibleCol: "Name" },
  };
  const result = buildImportPlan(args);
  assert.deepEqual(result.errors, []);
  assert.equal(result.changes[0].after.Note, 7);
});
