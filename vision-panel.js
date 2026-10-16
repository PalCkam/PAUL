const api = window.visionPanelApi;

const contextLabelEl     = document.getElementById("contextLabel");
const closeButton        = document.getElementById("closeButton");
const captureButton      = document.getElementById("captureButton");
const folderButton       = document.getElementById("folderButton");
const captureResult      = document.getElementById("captureResult");
const windowPicker       = document.getElementById("windowPicker");
const refreshButton      = document.getElementById("refreshWindows");
const scanButton         = document.getElementById("scanButton");
const scanMessage        = document.getElementById("scanMessage");
const scanResults        = document.getElementById("scanResults");
const saveLearnedButton  = document.getElementById("saveLearnedButton");
const learnSummary       = document.getElementById("learnSummary");
const learnedList        = document.getElementById("learnedList");

const AUTO_WINDOW = "";
const NO_CHOICE   = "";

let scanClusters = [];
let scanChoices  = {};


function createElement(tag, className, text)
{
    const element = document.createElement(tag);

    if (className)
    {
        element.className = className;
    }

    if (text !== undefined)
    {
        element.textContent = text;
    }

    return element;
}


async function loadWindows()
{
    const info    = await api.listCaptureWindows();
    const options = [{ value: AUTO_WINDOW, label: "Automatique (Minecraft, Lunar Client…)" }];

    for (const window of info.windows)
    {
        options.push({ value: window.key, label: window.name });
    }

    if (info.selected !== null && !info.windows.some((window) => window.key === info.selected))
    {
        options.push({ value: info.selected, label: `${info.selected} (fermée)` });
    }

    windowPicker.replaceChildren(createDropdown(options, info.selected === null ? AUTO_WINDOW : info.selected, async (value) =>
    {
        await api.selectCaptureWindow(value === AUTO_WINDOW ? null : value);
    }));
}


function renderLearned(learned)
{
    if (learned.length === 0)
    {
        learnedList.replaceChildren(createElement("div", "window-hint", "Aucun item appris pour l'instant."));
        return;
    }

    learnedList.replaceChildren(...learned.map((item) =>
    {
        const chip = createElement("button", "learned-chip", `${item.name} ✕`);

        chip.type  = "button";
        chip.title = "Oublier cet item";

        chip.addEventListener("click", async () =>
        {
            const result = await api.forgetItem(item.id);

            renderLearned(result.learned);
        });

        return chip;
    }));
}


function drawThumbnail(cells)
{
    const canvas = createElement("canvas", "scan-thumb");

    canvas.width  = 16;
    canvas.height = 16;

    const context = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;

    if (context)
    {
        const image = context.createImageData(16, 16);

        for (let cell = 0; cell < 256; cell += 1)
        {
            image.data[cell * 4]     = cells[cell * 3];
            image.data[cell * 4 + 1] = cells[cell * 3 + 1];
            image.data[cell * 4 + 2] = cells[cell * 3 + 2];
            image.data[cell * 4 + 3] = 255;
        }

        context.putImageData(image, 0, 0);
    }

    return canvas;
}


function describeTotal(total)
{
    return total === null ? "quantité illisible" : `total ×${total}`;
}


function renderScan(payload)
{
    scanClusters = payload.clusters;
    scanChoices  = {};

    const cards = [];

    for (const group of payload.known)
    {
        const card = createElement("div", "scan-card is-known");
        const info = createElement("div", "scan-info");

        info.append(
            createElement("div", "scan-total", `✓ ${group.name} (déjà appris)`),
            createElement("div", "", `Emplacements : ${group.slots.join(", ")} · ${describeTotal(group.total)}`)
        );

        card.append(info);
        cards.push(card);
    }

    const options = [{ value: NO_CHOICE, label: "— choisir le nom —" }, ...payload.items.map((item) => ({ value: item.id, label: item.name }))];

    for (const cluster of payload.clusters)
    {
        const card = createElement("div", "scan-card");
        const info = createElement("div", "scan-info");

        info.append(
            createElement("div", "scan-total", "Item à nommer"),
            createElement("div", "", `Emplacements : ${cluster.slots.join(", ")} · ${describeTotal(cluster.total)}`),
            createDropdown(options, NO_CHOICE, (value) =>
            {
                scanChoices[cluster.key] = value;
                learnSummary.replaceChildren();
            })
        );

        card.append(drawThumbnail(cluster.cells), info);
        cards.push(card);
    }

    scanResults.replaceChildren(...cards);

    saveLearnedButton.classList.toggle("is-hidden", payload.clusters.length === 0);
}


function showScanMessage(text, isError)
{
    scanMessage.replaceChildren(createElement("div", isError ? "capture-warning" : "capture-headline", text));
}


async function loadLearnContext()
{
    const context = await api.learnContext();

    if (!context.game)
    {
        scanResults.replaceChildren();
        saveLearnedButton.classList.add("is-hidden");
        showScanMessage("Sélectionne d'abord un profil rattaché à un jeu.", true);
        learnedList.replaceChildren();
        return;
    }

    renderLearned(context.learned);
}


async function loadContext()
{
    const context = await api.learnContext();

    contextLabelEl.textContent = context.game ? context.game.name : "Aucun profil de jeu";
}


function showCaptureLines(lines, isError)
{
    captureResult.replaceChildren(...lines.map((line, position) =>
    {
        const isWarning = isError || /^(Aucun|La barre|L'image|Fenêtre|La fenêtre)/.test(line);
        const className = isWarning ? "capture-warning" : (position === 0 ? "capture-headline" : "");

        return createElement("div", className, line);
    }));
}


captureButton.addEventListener("click", async () =>
{
    captureButton.disabled = true;

    showCaptureLines(["Capture en cours…"], false);

    try
    {
        const result = await api.captureGame();

        showCaptureLines(result.ok ? result.lines : [result.message], !result.ok);

        loadWindows();

        if (typeof captureResult.scrollIntoView === "function")
        {
            captureResult.scrollIntoView({ block: "nearest" });
        }
    }
    finally
    {
        captureButton.disabled = false;
    }
});


refreshButton.addEventListener("click", loadWindows);


scanButton.addEventListener("click", async () =>
{
    scanButton.disabled = true;

    learnSummary.replaceChildren();
    showScanMessage("Capture en cours…", false);

    try
    {
        const result = await api.scanItems();

        if (!result.ok)
        {
            scanResults.replaceChildren();
            saveLearnedButton.classList.add("is-hidden");
            showScanMessage(result.message, true);
            return;
        }

        renderScan(result);

        showScanMessage(
            result.clusters.length === 0
                ? "Tous les items de cet inventaire sont déjà connus."
                : `${result.clusters.length} item(s) à nommer.`,
            false
        );
    }
    finally
    {
        scanButton.disabled = false;
    }
});


saveLearnedButton.addEventListener("click", async () =>
{
    const assignments = scanClusters
        .filter((cluster) => scanChoices[cluster.key])
        .map((cluster) => ({ key: cluster.key, itemId: scanChoices[cluster.key] }));

    if (assignments.length === 0)
    {
        showScanMessage("Choisis le nom d'au moins un item.", true);
        return;
    }

    const chosen = assignments.map((assignment) => assignment.itemId);

    if (new Set(chosen).size !== chosen.length)
    {
        showScanMessage("Deux items ont reçu le même nom : vérifie tes choix.", true);
        return;
    }

    saveLearnedButton.disabled = true;

    try
    {
        const result = await api.saveLearned(assignments);

        if (!result.ok)
        {
            showScanMessage(result.message, true);
            return;
        }

        renderScan(result);
        renderLearned(result.learned);
        showScanMessage(result.message, false);

        learnSummary.replaceChildren(...result.lines.map((line) =>
        {
            return createElement("div", /^(Item inconnu|Quantité illisible|PAUL ne)/.test(line) ? "capture-warning" : "", line);
        }));

        if (typeof learnSummary.scrollIntoView === "function")
        {
            learnSummary.scrollIntoView({ block: "nearest" });
        }
    }
    finally
    {
        saveLearnedButton.disabled = false;
    }
});


folderButton.addEventListener("click", async () =>
{
    const result = await api.openCapturesFolder();

    if (!result.ok)
    {
        showCaptureLines([`Impossible d'ouvrir le dossier : ${result.directory}`], true);
    }
});


closeButton.addEventListener("click", () =>
{
    api.close();
});


api.onRefresh(() =>
{
    loadContext();
    loadWindows();
    loadLearnContext();
});

loadContext();
loadWindows();
loadLearnContext();
