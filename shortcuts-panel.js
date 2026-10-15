const api = window.shortcutsPanelApi;

const contextLabelEl = document.getElementById("contextLabel");
const slotListEl     = document.getElementById("slotList");
const messageEl      = document.getElementById("message");
const closeButton    = document.getElementById("closeButton");
const captureButton  = document.getElementById("captureButton");
const folderButton   = document.getElementById("folderButton");
const captureResult  = document.getElementById("captureResult");
const windowPicker   = document.getElementById("windowPicker");
const refreshButton  = document.getElementById("refreshWindows");

const AUTO_WINDOW = "";

const FREE_VALUE = "";


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


function createSlotRow(slot, options)
{
    const row     = createElement("div", "slot-row");
    const choices = [{ value: FREE_VALUE, label: "Libre" }, ...options];

    if (slot.value !== FREE_VALUE && !options.some((option) => option.value === slot.value))
    {
        choices.push({ value: slot.value, label: "(action introuvable)" });
    }

    const dropdown = createDropdown(choices, slot.value, async (value) =>
    {
        const result = await api.setShortcut(slot.key, value);

        messageEl.textContent = result.ok ? "" : result.message;

        await loadContext();
    });

    row.append(createElement("div", "slot-key", `Pavé ${slot.key}`), dropdown);

    return row;
}


async function loadContext()
{
    const context = await api.getContext();

    contextLabelEl.textContent = context.profileName
        ? (context.game ? `${context.profileName} · ${context.game.name}` : context.profileName)
        : "Aucun profil de jeu";

    if (!context.profileName)
    {
        slotListEl.replaceChildren(createElement("div", "panel-empty", "Sélectionne un profil dans la fenêtre PAUL."));
        return;
    }

    slotListEl.replaceChildren(...context.slots.map((slot) => createSlotRow(slot, context.options)));
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
    messageEl.textContent = "";
    loadContext();
    loadWindows();
});

loadContext();
loadWindows();
