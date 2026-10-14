const api = window.shortcutsPanelApi;

const contextLabelEl = document.getElementById("contextLabel");
const slotListEl     = document.getElementById("slotList");
const messageEl      = document.getElementById("message");
const closeButton    = document.getElementById("closeButton");

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


closeButton.addEventListener("click", () =>
{
    api.close();
});


api.onRefresh(() =>
{
    messageEl.textContent = "";
    loadContext();
});

loadContext();
