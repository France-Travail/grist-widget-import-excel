import { readWorkbook, readSheet } from "./services/excelService.js";
import {
  fetchSchema,
  fetchRules,
  prepareImport,
  applyImport,
  rollbackImport,
  saveRules,
} from "./services/gristService.js";
import { matchColumns, RULES } from "./services/importEngine.js";
import {
  el,
  option,
  dataTable,
  renderPlan,
  downloadReport,
} from "./services/uiService.js";
import { formatValue } from "./services/dateService.js";

export async function start({ version, revision }) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <header class="masthead"><div class="brand-mark" aria-hidden="true">↗</div><div><p class="eyebrow">GRIST · IMPORT DE DONNÉES</p><h1>Vos fichiers, à jour.</h1><p class="subtitle">Préparez, vérifiez, puis importez vos données Excel.</p></div></header>
    <div class="context-bar"><span id="connection" role="status">Connexion à Grist…</span><button id="refresh" class="link-button">Actualiser la table</button><span id="version" class="version"></span></div>
    <div id="update-banner" class="notice" hidden><strong>Une amélioration de l’outil est disponible.</strong><p>Vous pouvez terminer votre import avant de l’installer. Vos données et vos règles enregistrées dans Grist seront conservées.</p><button id="reload" class="link-button">Installer la mise à jour</button><span class="muted"> Après ce rechargement, il faudra sélectionner à nouveau votre fichier. Pour annuler un import précédent, utilisez l’historique Grist.</span></div>
    <div id="status" role="status" aria-live="polite" hidden></div>
    <fieldset id="controls">
      <section class="card"><div class="section-title"><span class="step">1</span><div><h2>Choisir les données</h2><p>Votre fichier reste dans ce navigateur jusqu’à l’import vers Grist.</p></div></div>
        <label class="dropzone" id="dropzone" for="file-input"><span class="upload-symbol" aria-hidden="true">↑</span><strong>Déposer un fichier Excel</strong><span>ou cliquer pour parcourir · .xlsx, .xls, .xlsm · 30 Mo maximum</span><input id="file-input" type="file" accept=".xlsx,.xls,.xlsm"></label>
        <p id="file-name" class="file-name"></p><div id="sheet-list" class="sheet-list"></div>
        <details id="source-preview" hidden><summary>Aperçu du fichier</summary><div id="preview-container"></div></details>
      </section>
      <section class="card"><div class="section-title"><span class="step">2</span><div><h2>Relier les colonnes</h2><p>Associez chaque en-tête Excel à sa colonne Grist et choisissez une règle.</p></div></div>
        <div id="mapping-preview" class="empty-state">Choisissez un fichier pour afficher les correspondances.</div>
        <details id="settings"><summary>Identification des lignes et configuration</summary><p class="muted">Les clés servent à retrouver les lignes existantes. Elles ne sont pas modifiées par l’import.</p>
          <label for="key-mode">Utilisation des clés</label><select id="key-mode"><option value="composite">Clé complète : toutes les valeurs doivent correspondre</option><option value="fallback">Clés de secours : une valeur suffit, sans contradiction</option></select>
          <div id="key-list" class="key-list"></div><p class="muted">Les modifications s’appliquent à cette session. Enregistrer les règles met à jour RULES_CONFIG, partagé par les widgets de ce document.</p>
          <button id="save-rules" class="secondary">Enregistrer les règles dans Grist</button>
        </details>
      </section>
      <section class="card"><div class="section-title"><span class="step">3</span><div><h2>Vérifier avant d’importer</h2><p>Contrôlez les ajouts, les modifications et les erreurs avant toute écriture.</p></div></div>
        <button id="validate" class="secondary" disabled>Vérifier l’import</button><div id="plan"></div>
        <div class="actions"><button id="apply" class="primary" disabled>Importer les changements</button><button id="report" class="secondary" hidden>Télécharger le rapport</button><button id="undo" class="link-button" hidden>Annuler le dernier import de cette session</button></div>
      </section>
    </fieldset>
    <footer>Import Excel pour Grist <span>Open source · France Travail</span></footer>`;
  const $ = (id) => document.getElementById(id);
  $("version").textContent = `v${version} · ${revision}`;
  let tableId = null,
    columns = [],
    config = { rules: {}, keys: [], keyMode: "composite" };
  let workbook = null,
    sheets = [],
    plan = null,
    undo = null,
    busy = false,
    generation = 0;
  const api = grist.docApi;
  function status(message, error = false) {
    $("status").hidden = !message;
    $("status").textContent = message;
    $("status").className = `notice ${error ? "error" : "success"}`;
    $("status").setAttribute("role", error ? "alert" : "status");
  }
  function invalidate() {
    plan = null;
    $("plan").replaceChildren();
    $("apply").disabled = true;
    $("report").hidden = true;
    $("validate").disabled =
      !tableId ||
      !columns.length ||
      !sheets.some((s) => s.selected && !s.error);
  }
  async function run(task) {
    if (busy) return;
    busy = true;
    $("controls").disabled = true;
    $("refresh").disabled = true;
    $("reload").disabled = true;
    app.setAttribute("aria-busy", "true");
    try {
      await task();
    } catch (error) {
      status(error.message || "Une erreur est survenue.", true);
    } finally {
      busy = false;
      $("controls").disabled = false;
      $("refresh").disabled = false;
      $("reload").disabled = false;
      app.removeAttribute("aria-busy");
    }
  }
  function renderKeys() {
    $("key-mode").value = config.keyMode;
    $("key-list").replaceChildren(
      ...columns
        .filter((c) => !c.isFormula)
        .map((col) => {
          const checkbox = el("input", {
            type: "checkbox",
            checked: config.keys.includes(col.id),
            "aria-label": `Clé : ${col.label}`,
          });
          checkbox.onchange = () => {
            config.keys = checkbox.checked
              ? [...config.keys, col.id]
              : config.keys.filter((k) => k !== col.id);
            invalidate();
            renderMappings();
          };
          return el("label", { class: "key-choice" }, [
            checkbox,
            el("span", { text: col.label }),
          ]);
        }),
    );
    if (!config.keys.length) $("settings").open = true;
  }
  function renderMappings() {
    const container = $("mapping-preview");
    container.replaceChildren();
    const selected = sheets.filter((s) => s.selected);
    if (!selected.length) {
      container.append(
        el("p", { class: "muted", text: "Sélectionner au moins une feuille." }),
      );
      return;
    }
    for (const sheet of selected) {
      container.append(el("h3", { text: sheet.name }));
      if (sheet.error) {
        container.append(el("p", { class: "notice error", text: sheet.error }));
        continue;
      }
      if (sheet.warnings.length)
        container.append(
          el("p", { class: "muted", text: sheet.warnings.join(" ") }),
        );
      for (const header of sheet.headers) {
        const target = sheet.mapping[header];
        const select = el(
          "select",
          { "aria-label": `Colonne Grist pour ${header} (${sheet.name})` },
          [
            option("", "Ne pas importer"),
            ...columns
              .filter((c) => !c.isFormula)
              .map((c) =>
                option(
                  c.id,
                  `${c.label}${columns.filter((other) => other.label === c.label).length > 1 ? ` (${c.id})` : ""} · ${{ Text: "Texte", Bool: "Oui / Non", Int: "Nombre entier", Numeric: "Nombre", Choice: "Choix", ChoiceList: "Liste de choix", Date: "Date", DateTime: "Date et heure", Ref: "Référence", RefList: "Liste de références" }[c.type.split(":")[0]] || c.type}`,
                ),
              ),
          ],
        );
        select.value = target || "";
        select.onchange = () => {
          sheet.mapping[header] = select.value;
          invalidate();
          renderMappings();
        };
        const rule = el(
          "select",
          {
            "aria-label": `Règle pour ${header} (${sheet.name})`,
            disabled: !target || config.keys.includes(target),
          },
          Object.entries(RULES).map(([id, [label]]) => option(id, label)),
        );
        rule.value = config.keys.includes(target)
          ? "match"
          : (config.rules[target] ?? "ignore");
        rule.onchange = () => {
          config.rules[target] = rule.value;
          invalidate();
          renderMappings();
        };
        const desc = config.keys.includes(target)
          ? "Clé d’identification"
          : RULES[rule.value]?.[1] || "";
        container.append(
          el("div", { class: `mapping-row ${!target ? "unmatched" : ""}` }, [
            el("strong", { text: header }),
            select,
            el("div", {}, [rule, el("small", { text: desc })]),
          ]),
        );
      }
    }
  }
  function renderSource() {
    const selected = sheets.filter((s) => s.selected && !s.error);
    $("source-preview").hidden = !selected.length;
    $("preview-container").replaceChildren(
      ...selected.flatMap((s) => [
        el("h3", {
          text: `${s.name} · ${s.rows.length} lignes · aperçu limité à 20`,
        }),
        dataTable(
          s.headers,
          s.rows.slice(0, 20).map((row) => row.map((v) => formatValue(v))),
        ),
      ]),
    );
  }
  function parseSelected(sheet) {
    try {
      const parsed = readSheet(workbook, sheet.name, sheet.headerRow);
      const previous = sheet.mapping;
      Object.assign(sheet, parsed, { error: null });
      sheet.mapping = { ...matchColumns(sheet.headers, columns) };
      for (const h of sheet.headers)
        if (previous && Object.hasOwn(previous, h))
          sheet.mapping[h] = previous[h];
    } catch (e) {
      sheet.error = e.message;
    }
  }
  function renderSheets() {
    $("sheet-list").replaceChildren(
      ...sheets.map((sheet) => {
        const check = el("input", {
          type: "checkbox",
          checked: sheet.selected,
        });
        check.onchange = () => {
          sheet.selected = check.checked;
          if (sheet.selected) parseSelected(sheet);
          invalidate();
          renderMappings();
          renderSource();
        };
        const header = el("input", {
          type: "number",
          min: "1",
          value: sheet.headerRow,
          "aria-label": `Ligne d’en-tête pour ${sheet.name}`,
        });
        header.onchange = () => {
          sheet.headerRow = Number(header.value);
          parseSelected(sheet);
          invalidate();
          renderMappings();
          renderSource();
        };
        return el("div", { class: "sheet-row" }, [
          el("label", {}, [check, el("strong", { text: sheet.name })]),
          el("label", {}, [el("span", { text: "En-tête à la ligne" }), header]),
        ]);
      }),
    );
  }
  async function loadFile(file) {
    workbook = null;
    sheets = [];
    invalidate();
    renderSheets();
    renderMappings();
    renderSource();
    $("file-name").textContent = "";
    workbook = await readWorkbook(file);
    sheets = workbook.SheetNames.map((name, i) => ({
      name,
      selected: i === 0,
      headerRow: 1,
    }));
    parseSelected(sheets[0]);
    $("file-name").textContent =
      `${file.name} · ${workbook.SheetNames.length} feuille(s)`;
    renderSheets();
    renderMappings();
    renderSource();
    invalidate();
    status(
      "Fichier chargé. Vérifiez les correspondances puis lancez la vérification.",
    );
  }
  async function loadTable(id) {
    const token = ++generation;
    columns = [];
    invalidate();
    $("connection").textContent = "Lecture de la table…";
    try {
      const nextColumns = await fetchSchema(api, id);
      const nextConfig = await fetchRules(api, nextColumns);
      if (token !== generation) return;
      columns = nextColumns;
      config = nextConfig;
      $("connection").textContent =
        `${id} · ${columns.filter((c) => !c.isFormula).length} colonnes importables`;
      for (const sheet of sheets.filter((s) => s.selected)) {
        sheet.mapping = null;
        parseSelected(sheet);
      }
      renderKeys();
      renderMappings();
      invalidate();
      if (config.missing)
        status(
          "Aucune règle enregistrée. Choisissez vos clés et règles ci-dessous.",
        );
      else if (config.warnings.length) status(config.warnings.join(" "));
      else status("Table connectée. Les règles enregistrées ont été chargées.");
    } catch (error) {
      if (token === generation) {
        $("connection").textContent = "Table non disponible";
        status(error.message, true);
      }
    }
  }
  $("file-input").onchange = (e) => {
    const file = e.target.files[0];
    if (file) run(() => loadFile(file));
    e.target.value = "";
  };
  $("dropzone").ondragover = (e) => {
    e.preventDefault();
    if (!busy) $("dropzone").classList.add("dragover");
  };
  $("dropzone").ondragleave = () => $("dropzone").classList.remove("dragover");
  $("dropzone").ondrop = (e) => {
    e.preventDefault();
    $("dropzone").classList.remove("dragover");
    if (e.dataTransfer.files[0]) run(() => loadFile(e.dataTransfer.files[0]));
  };
  $("key-mode").onchange = (e) => {
    config.keyMode = e.target.value;
    invalidate();
  };
  $("save-rules").onclick = () =>
    run(async () => {
      await saveRules(api, columns, config);
      invalidate();
      status(
        "Règles enregistrées. Elles seront réutilisées lors de vos prochains imports.",
      );
    });
  $("refresh").onclick = () => {
    if (tableId) run(() => loadTable(tableId));
  };
  $("validate").onclick = () =>
    run(async () => {
      invalidate();
      status("Vérification des données et des références…");
      const selected = sheets.filter((s) => s.selected);
      if (selected.some((s) => s.error))
        throw new Error("Corriger les erreurs des feuilles sélectionnées.");
      const input = {
        tableId,
        sheets: selected,
        rules: config.rules,
        keys: config.keys,
        keyMode: config.keyMode,
      };
      const prepared = await prepareImport(api, input);
      if (input.tableId !== tableId)
        throw new Error("La table cible a changé. Relancer la vérification.");
      plan = prepared;
      renderPlan(plan, $("plan"));
      $("report").hidden = false;
      $("report").onclick = () => downloadReport(prepared);
      $("apply").disabled = !!plan.errors.length || !plan.changes.length;
      $("apply").textContent =
        `Confirmer l’import de ${plan.changes.length} ligne${plan.changes.length > 1 ? "s" : ""}`;
      status(
        plan.errors.length
          ? "Corrigez les erreurs signalées avant de continuer."
          : plan.changes.length
            ? "Vérification terminée. Contrôlez l’aperçu avant de lancer l’import."
            : "Aucun changement à appliquer avec ces correspondances et ces règles.",
        !!plan.errors.length,
      );
    });
  $("apply").onclick = () =>
    run(async () => {
      if (!plan || plan.tableId !== tableId)
        throw new Error("Vérifier à nouveau l’import.");
      status("Import en cours…");
      const appliedPlan = plan;
      try {
        undo = await applyImport(api, appliedPlan);
        $("undo").hidden = !undo || undo.unavailable;
        renderPlan(appliedPlan, $("plan"), { applied: true });
        status(
          `Import terminé : ${appliedPlan.stats.added} ligne${appliedPlan.stats.added > 1 ? "s" : ""} ajoutée${appliedPlan.stats.added > 1 ? "s" : ""}, ${appliedPlan.stats.updated} ligne${appliedPlan.stats.updated > 1 ? "s" : ""} mise${appliedPlan.stats.updated > 1 ? "s" : ""} à jour.` +
            (undo?.unavailable
              ? " L’annulation reste disponible dans l’historique Grist."
              : ""),
        );
      } finally {
        $("apply").disabled = true;
        plan = null;
      }
      $("report").onclick = () => downloadReport(appliedPlan);
    });
  $("report").onclick = () => {
    if (plan) downloadReport(plan);
  };
  $("undo").onclick = () =>
    run(async () => {
      await rollbackImport(api, undo);
      undo = null;
      $("undo").hidden = true;
      invalidate();
      status("Le dernier import de cette session a été annulé.");
    });
  $("reload").onclick = () => {
    if (!busy) location.reload();
  };
  document.addEventListener("widget-update-available", () => {
    $("update-banner").hidden = false;
  });
  grist.on("message", (message) => {
    if (message.tableId && message.tableId !== tableId) {
      tableId = message.tableId;
      undo = null;
      $("undo").hidden = true;
      loadTable(tableId);
    }
  });
  grist.ready({ requiredAccess: "full", allowSelectBy: true });
  // Data notifications invalidate a simulation, but never replace edits to local rules.
  grist.onRecords(() => {
    if (plan && !busy) {
      invalidate();
      status("La table a changé. Vérifiez de nouveau l’import.");
    }
  });
  setTimeout(() => {
    if (!tableId)
      status(
        "Dans Grist, liez le widget à une table et accordez-lui l’accès complet.",
      );
  }, 6000);
}
