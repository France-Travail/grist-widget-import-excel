import { test, expect } from "@playwright/test";

function mockGrist() {
  const data = {
    _grist_Tables: { id: [1], tableId: ["Test"] },
    _grist_Tables_column: {
      id: [1, 2, 3],
      parentId: [1, 1, 1],
      colId: ["Key", "Date", "Flag"],
      label: ["Identifiant", "Date", "Actif"],
      type: ["Text", "Date", "Bool"],
      isFormula: [false, false, false],
      formula: ["", "", ""],
    },
    RULES_CONFIG: {
      id: [1, 2, 3],
      col_name: ["Key", "Date", "Flag"],
      is_key: [true, false, false],
      rule: ["match", "overwrite", "overwrite"],
    },
    Test: { id: [], Key: [], Date: [], Flag: [] },
  };
  window.testData = data;
  window.testCalls = [];
  const handlers = {};
  window.grist = {
    on: (event, handler) => {
      handlers[event] = handler;
    },
    onRecords: (handler) => {
      handlers.records = handler;
    },
    ready: () => {
      setTimeout(() => handlers.message({ tableId: "Test" }), 0);
    },
    docApi: {
      listTables: async () => Object.keys(data),
      fetchTable: async (name) => structuredClone(data[name]),
      applyUserActions: async (actions) => {
        window.testCalls.push(structuredClone(actions));
        const retValues = [];
        for (const [kind, name, id, values] of actions) {
          const table = data[name];
          if (kind === "AddColumn") {
            table[id] = table.id.map(() => null);
            retValues.push(null);
          }
          if (kind === "AddRecord") {
            const rowId = Math.max(0, ...table.id) + 1;
            table.id.push(rowId);
            for (const key of Object.keys(table).filter((k) => k !== "id"))
              table[key].push(values[key] ?? null);
            retValues.push(rowId);
          }
          if (kind === "UpdateRecord") {
            const index = table.id.indexOf(id);
            for (const [key, value] of Object.entries(values))
              table[key][index] = value;
            retValues.push(null);
          }
          if (kind === "RemoveRecord") {
            const index = table.id.indexOf(id);
            for (const values of Object.values(table)) values.splice(index, 1);
            retValues.push(null);
          }
        }
        return { retValues };
      },
    },
  };
}
async function upload(page, sheets) {
  const bytes = await page.evaluate((sheets) => {
    const workbook = XLSX.utils.book_new();
    for (const [name, rows] of sheets)
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet(rows),
        name,
      );
    return Array.from(
      new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" })),
    );
  }, sheets);
  await page.locator("#file-input").setInputFiles({
    name: "synthetic.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator("#controls")).toBeEnabled();
}
async function validate(page) {
  await page.locator("#validate").click();
  await expect(page.locator("#controls")).toBeEnabled();
}
test.beforeEach(async ({ page }) => {
  await page.route("**/vendor/grist-plugin-api.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `(${mockGrist.toString()})()`,
    }),
  );
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText(
    "3 colonnes importables",
  );
});
test("Aperçu sans écriture, import idempotent, double clic et annulation", async ({
  page,
}) => {
  await upload(page, [
    [
      "Fictif",
      [
        ["Identifiant", "Date", "Actif"],
        ["000042", "10/12/2025", 1],
        ["000043", 46001, 0],
      ],
    ],
  ]);
  await validate(page);
  expect(await page.evaluate(() => testCalls.length)).toBe(0);
  await expect(page.locator("#plan")).toContainText("10/12/2025");
  await page.locator("#apply").evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(page.locator("#status")).toContainText("Import terminé");
  expect(await page.evaluate(() => testCalls.length)).toBe(1);
  expect(await page.evaluate(() => testData.Test.Date)).toEqual([
    1765324800, 1765324800,
  ]);
  expect(await page.evaluate(() => testData.Test.Key)).toEqual([
    "000042",
    "000043",
  ]);
  await validate(page);
  await expect(page.locator("#apply")).toBeDisabled();
  await expect(page.locator("#status")).toContainText("Aucun changement à appliquer");
  await page.locator("#undo").click();
  await expect(page.locator("#status")).toContainText("annulé");
  expect(await page.evaluate(() => testData.Test.id)).toEqual([]);
});
test("Date invalide signalée avec ligne et aucun import autorisé", async ({
  page,
}) => {
  await upload(page, [
    [
      "Fictif",
      [
        ["Identifiant", "Date"],
        ["000042", "31/02/2025"],
      ],
    ],
  ]);
  await validate(page);
  await expect(page.locator("#plan")).toContainText("ligne 2");
  await expect(page.locator("#plan")).toContainText("Date impossible");
  await expect(page.locator("#apply")).toBeDisabled();
});
test("Correspondance manuelle et correction d’une règle incompatible", async ({
  page,
}) => {
  await upload(page, [
    [
      "Fictif",
      [
        ["Code", "Actif"],
        ["000042", 1],
      ],
    ],
  ]);
  await validate(page);
  await expect(page.locator("#plan")).toContainText("incomplète");
  await page
    .getByLabel("Colonne Grist pour Code (Fictif)", { exact: true })
    .selectOption("Key");
  await page
    .getByLabel("Règle pour Actif (Fictif)", { exact: true })
    .selectOption("update_if_newer");
  await validate(page);
  await expect(page.locator("#plan")).toContainText("réservé aux dates");
  await page
    .getByLabel("Règle pour Actif (Fictif)", { exact: true })
    .selectOption("overwrite");
  await validate(page);
  await expect(page.locator("#apply")).toBeEnabled();
});
test("Multi-feuilles : ligne en-tête décalée et doublons entre feuilles", async ({
  page,
}) => {
  await upload(page, [
    ["Premier", [["Titre"], ["Identifiant", "Date"], ["000042", "10/12/2025"]]],
    [
      "Second",
      [
        ["Identifiant", "Date"],
        ["000042", "10/12/2025"],
      ],
    ],
  ]);
  await page
    .getByLabel("Ligne d’en-tête pour Premier", { exact: true })
    .fill("2");
  await page
    .getByLabel("Ligne d’en-tête pour Premier", { exact: true })
    .press("Tab");
  await page.getByLabel("Second", { exact: true }).check();
  await validate(page);
  await expect(page.locator("#plan")).toContainText("répété");
  await page.getByLabel("Second", { exact: true }).uncheck();
  await validate(page);
  await expect(page.locator("#apply")).toBeEnabled();
});
test("HTML du classeur affiché comme texte et absence de débordement sur mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const header = "<img src=x onerror=alert(1)>";
  await upload(page, [
    [
      "Fictif",
      [
        ["Identifiant", header],
        ["000042", "<script>alert(1)</script>"],
      ],
    ],
  ]);
  expect(await page.locator("#mapping-preview img").count()).toBe(0);
  await expect(page.locator("#mapping-preview")).toContainText(header);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("Notification de version sans rechargement ni perte du fichier", async ({
  page,
}) => {
  await upload(page, [["Fictif", [["Identifiant"], ["000042"]]]]);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("widget-update-available")),
  );
  await expect(page.locator("#update-banner")).toBeVisible();
  await expect(page.locator("#file-name")).toContainText("synthetic.xlsx");
});
test("La configuration n’est écrite qu’au clic explicite", async ({ page }) => {
  await upload(page, [
    [
      "Fictif",
      [
        ["Identifiant", "Date"],
        ["000042", "10/12/2025"],
      ],
    ],
  ]);
  await page
    .getByLabel("Règle pour Date (Fictif)", { exact: true })
    .selectOption("fill_if_empty");
  expect(await page.evaluate(() => testCalls.length)).toBe(0);
  await page.locator("#settings").evaluate((e) => {
    e.open = true;
  });
  await page.locator("#save-rules").click();
  await expect(page.locator("#status")).toContainText("Règles enregistrées");
  expect(await page.evaluate(() => testData.RULES_CONFIG.rule[1])).toBe(
    "fill_if_empty",
  );
});

test("La même URL charge un nouveau graphe de ressources et le manifeste déclenche le bandeau", async ({
  page,
}) => {
  await page.clock.install();
  await page.reload();
  await expect(page.locator("#connection")).toContainText("3 colonnes");
  const original = await page.evaluate(
    async () => (await (await fetch("version.json")).json()).revision,
  );
  const next = original === "aaaaaaaaaaaa" ? "bbbbbbbbbbbb" : "aaaaaaaaaaaa";
  await page.route("**/version.json*", async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    await route.fulfill({
      json: { ...manifest, revision: next, path: `releases/${next}/` },
    });
  });
  await page.clock.fastForward(61000);
  await expect(page.locator("#update-banner")).toBeVisible();
  const assets = [];
  await page.route(`**/releases/${next}/**`, async (route) => {
    assets.push(route.request().url());
    if (route.request().url().endsWith("vendor/grist-plugin-api.js")) {
      await route.fulfill({
        contentType: "text/javascript",
        body: `(${mockGrist.toString()})()`,
      });
    } else {
      await route.fulfill({
        response: await route.fetch({
          url: route
            .request()
            .url()
            .replace(`/releases/${next}/`, `/releases/${original}/`),
        }),
      });
    }
  });
  const stableURL = page.url();
  await page.locator("#reload").click();
  await expect(page.locator("#version")).toContainText(next);
  expect(page.url()).toBe(stableURL);
  for (const asset of [
    "src/app.js",
    "src/services/dateService.js",
    "styles/style.css",
    "vendor/xlsx.full.min.js",
  ])
    expect(assets.some((url) => url.endsWith(asset))).toBe(true);
});

test("Une table modifiée après aperçu bloque le clic Importer", async ({
  page,
}) => {
  await upload(page, [
    [
      "Fictif",
      [
        ["Identifiant", "Date"],
        ["000042", "10/12/2025"],
      ],
    ],
  ]);
  await validate(page);
  await page.evaluate(() => {
    testData.Test.id.push(1);
    testData.Test.Key.push("another");
    testData.Test.Date.push(0);
    testData.Test.Flag.push(false);
  });
  await page.locator("#apply").click();
  await expect(page.locator("#status")).toContainText("changé depuis");
  expect(await page.evaluate(() => testCalls.length)).toBe(0);
});

test("Un fichier de mise à jour à en-tête différent retrouve la ligne existante après correction du mapping", async ({
  page,
}) => {
  await page.evaluate(() => {
    testData.Test = { id: [7], Key: ["000042"], Date: [null], Flag: [false] };
  });
  await upload(page, [
    [
      "Fictif",
      [
        ["Code du dossier", "Date", "Actif"],
        ["000042", 46001, 1],
      ],
    ],
  ]);
  await validate(page);
  await expect(page.locator("#plan")).toContainText(
    "associer une colonne Excel à Identifiant",
  );
  await expect(page.locator("#apply")).toBeDisabled();
  await page
    .getByLabel("Colonne Grist pour Code du dossier (Fictif)", { exact: true })
    .selectOption("Key");
  await validate(page);
  await expect(page.locator("#plan")).toContainText("Modification");
  await page.locator("#apply").click();
  await expect(page.locator("#status")).toContainText(
    "0 ajout(s), 1 modification(s)",
  );
  expect(await page.evaluate(() => testData.Test)).toEqual({
    id: [7],
    Key: ["000042"],
    Date: [1765324800],
    Flag: [true],
  });
  await page.locator("#undo").click();
  await expect(page.locator("#status")).toContainText("annulé");
  expect(await page.evaluate(() => testData.Test.Date)).toEqual([null]);
});
