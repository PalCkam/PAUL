const api = window.tasksPanelApi;

const contextLabelEl = document.getElementById("contextLabel");
const taskListEl     = document.getElementById("taskList");
const taskDetailsEl  = document.getElementById("taskDetails");
const closeButton    = document.getElementById("closeButton");

const PRESET_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const state =
{
    context:        null,
    selectedTaskId: null,
    valuesByTask:   {},
    scenarioByTask: {},
    draftByTask:    {},
    presets:        []
};

let fieldErrorEls    = {};
let resultEl         = null;
let presetMessageEl  = null;


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


function getSelectedTask()
{
    if (!state.context)
    {
        return null;
    }

    return state.context.tasks.find((task) => task.id === state.selectedTaskId) || null;
}


function getItemsFor(filter)
{
    return state.context.items.filter((item) => !filter || item.tags.includes(filter));
}


function getItemName(itemId)
{
    const item = state.context.items.find((candidate) => candidate.id === itemId);

    return item ? item.name : itemId;
}


function createInitialValues(task)
{
    const values = {};

    for (const parameter of task.parameters)
    {
        if (parameter.type === "boolean")
        {
            values[parameter.id] = parameter.default;
        }
        else if (parameter.type === "items")
        {
            values[parameter.id] = parameter.default ? [...parameter.default] : [];
        }
        else
        {
            values[parameter.id] = parameter.default !== undefined ? parameter.default : "";
        }
    }

    return values;
}


function getValues(task)
{
    if (!state.valuesByTask[task.id])
    {
        state.valuesByTask[task.id] = createInitialValues(task);
    }

    return state.valuesByTask[task.id];
}


function clearResult()
{
    if (resultEl)
    {
        resultEl.remove();
        resultEl = null;
    }

    for (const errorEl of Object.values(fieldErrorEls))
    {
        errorEl.textContent = "";
    }
}


function capitalize(text)
{
    return text.charAt(0).toUpperCase() + text.slice(1);
}


function createItemsControl(parameter, values)
{
    const container  = createElement("div", "items-control");
    const chipsEl    = createElement("div", "chips");
    const searchEl   = createElement("input");
    const optionsEl  = createElement("div", "item-options");
    const items      = getItemsFor(parameter.filter);

    searchEl.type        = "text";
    searchEl.placeholder = "Rechercher un item";

    function toggle(itemId)
    {
        const selected = values[parameter.id];
        const position = selected.indexOf(itemId);

        if (position === -1)
        {
            selected.push(itemId);
        }
        else
        {
            selected.splice(position, 1);
        }

        clearResult();
        renderItems();
    }

    function renderItems()
    {
        const selected = values[parameter.id];
        const query    = searchEl.value.trim().toLowerCase();

        chipsEl.replaceChildren(...selected.map((itemId) =>
        {
            const chip = createElement("button", "chip", `${getItemName(itemId)} ✕`);

            chip.type = "button";
            chip.addEventListener("click", () => toggle(itemId));

            return chip;
        }));

        const matches = items.filter((item) =>
        {
            return item.name.toLowerCase().includes(query) || item.id.includes(query);
        });

        if (matches.length === 0)
        {
            optionsEl.replaceChildren(createElement("div", "panel-empty", "Aucun item."));
            return;
        }

        optionsEl.replaceChildren(...matches.map((item) =>
        {
            const isSelected = selected.includes(item.id);
            const option     = createElement("button", isSelected ? "item-option is-selected" : "item-option");

            option.type = "button";
            option.append(createElement("span", "", item.name), createElement("span", "", isSelected ? "✓" : ""));
            option.addEventListener("click", () => toggle(item.id));

            return option;
        }));
    }

    searchEl.addEventListener("input", renderItems);

    container.append(chipsEl, searchEl, optionsEl);
    renderItems();

    return container;
}


document.addEventListener("click", (event) =>
{
    for (const list of document.querySelectorAll(".dropdown-list"))
    {
        if (!list.parentElement.contains(event.target))
        {
            list.classList.add("is-hidden");
        }
    }
});


function createDropdown(options, initialValue, onChange)
{
    const container = createElement("div", "dropdown");
    const toggle    = createElement("button", "dropdown-toggle");
    const list      = createElement("div", "dropdown-list is-hidden");

    let value = initialValue;

    toggle.type = "button";

    function render()
    {
        const selected = options.find((option) => option.value === value);

        toggle.textContent = `${selected ? selected.label : "—"} ▾`;

        list.replaceChildren(...options.map((option) =>
        {
            const isSelected = option.value === value;
            const button     = createElement("button", isSelected ? "dropdown-option is-selected" : "dropdown-option", option.label);

            button.type = "button";

            button.addEventListener("click", () =>
            {
                value = option.value;
                list.classList.add("is-hidden");
                render();
                onChange(value);
            });

            return button;
        }));
    }

    toggle.addEventListener("click", () =>
    {
        list.classList.toggle("is-hidden");
    });

    container.append(toggle, list);
    render();

    return container;
}


function createSelectControl(parameter, values, options)
{
    const choices = [...options];

    if (!parameter.required && parameter.default === undefined)
    {
        choices.unshift({ value: "", label: "—" });
    }

    return createDropdown(choices, values[parameter.id], (value) =>
    {
        values[parameter.id] = value;
        clearResult();
    });
}


function createControl(parameter, values)
{
    switch (parameter.type)
    {
        case "items":
        {
            return createItemsControl(parameter, values);
        }

        case "item":
        {
            const options = getItemsFor(parameter.filter).map((item) => ({ value: item.id, label: item.name }));

            return createSelectControl(parameter, values, options);
        }

        case "choice":
        {
            return createSelectControl(parameter, values, parameter.options);
        }

        case "boolean":
        {
            const checkbox = createElement("input");

            checkbox.type    = "checkbox";
            checkbox.checked = values[parameter.id];

            checkbox.addEventListener("change", () =>
            {
                values[parameter.id] = checkbox.checked;
                clearResult();
            });

            return checkbox;
        }

        default:
        {
            const input = createElement("input");

            input.type  = parameter.type === "number" ? "number" : "text";
            input.value = values[parameter.id];

            if (parameter.type === "number")
            {
                input.step = parameter.integer ? "1" : "any";

                if (parameter.min !== undefined)
                {
                    input.min = String(parameter.min);
                }

                if (parameter.max !== undefined)
                {
                    input.max = String(parameter.max);
                }
            }

            if (parameter.emptyMeans)
            {
                input.placeholder = capitalize(parameter.emptyMeans);
            }

            input.addEventListener("input", () =>
            {
                values[parameter.id] = input.value;
                clearResult();
            });

            return input;
        }
    }
}


function createField(parameter, values)
{
    const isCheckbox = parameter.type === "boolean";
    const field      = createElement("div", isCheckbox ? "field field-checkbox" : "field");
    const label      = createElement("div", "field-label", parameter.required ? `${parameter.label} *` : parameter.label);
    const control    = createControl(parameter, values);
    const errorEl    = createElement("div", "field-error");

    fieldErrorEls[parameter.id] = errorEl;

    if (isCheckbox)
    {
        field.append(control, label, errorEl);
        return field;
    }

    field.append(label);

    if (parameter.description)
    {
        field.append(createElement("div", "field-hint", parameter.description));
    }

    field.append(control);

    if (parameter.emptyMeans)
    {
        field.append(createElement("div", "field-hint", `Vide = ${parameter.emptyMeans}`));
    }

    field.append(errorEl);

    return field;
}


function formatValue(parameter, value)
{
    if (parameter.type === "boolean")
    {
        return value ? "oui" : "non";
    }

    if (parameter.type === "items")
    {
        return value.map(getItemName).join(", ");
    }

    if (parameter.type === "item")
    {
        return getItemName(value);
    }

    if (parameter.type === "choice")
    {
        const option = parameter.options.find((candidate) => candidate.value === value);

        return option ? option.label : value;
    }

    return String(value);
}


function buildPayload(task)
{
    const values  = getValues(task);
    const payload = {};

    for (const parameter of task.parameters)
    {
        const value = values[parameter.id];

        if (value === "" || (Array.isArray(value) && value.length === 0))
        {
            continue;
        }

        payload[parameter.id] = parameter.type === "number" ? Number(value) : value;
    }

    return payload;
}


function createReportElement(report)
{
    const reportEl = createElement("div", "report");

    reportEl.append(createElement("div", "report-headline", report.headline));

    for (const stat of report.stats)
    {
        reportEl.append(createElement("div", "report-line", `${stat.label} : ${stat.value}`));
    }

    for (const step of report.steps)
    {
        const stepEl = createElement("div", "report-step");

        stepEl.append(createElement("div", "report-step-title", step.title));

        for (const line of step.lines)
        {
            stepEl.append(createElement("div", "report-line", line));
        }

        reportEl.append(stepEl);
    }

    for (const note of report.notes)
    {
        const className = note.level === "warning" ? "report-note is-warning" : "report-note is-info";

        reportEl.append(createElement("div", className, note.message));
    }

    return reportEl;
}


function showResult(task, result)
{
    clearResult();

    resultEl = createElement("div", "result-group");

    let block;

    if (result.ok)
    {
        block = createElement("div", "result is-valid");
        block.append(createElement("div", "result-title", "Réglages valides"));

        for (const parameter of task.parameters)
        {
            const value = result.values[parameter.id];

            if (value === undefined && !parameter.emptyMeans)
            {
                continue;
            }

            const text = value === undefined ? parameter.emptyMeans : formatValue(parameter, value);

            block.append(createElement("div", "", `${parameter.label} : ${text}`));
        }
    }
    else
    {
        block = createElement("div", "result is-invalid");
        block.append(createElement("div", "result-title", "Réglages à corriger"));

        for (const error of result.errors)
        {
            const fieldErrorEl = error.parameterId ? fieldErrorEls[error.parameterId] : null;

            if (fieldErrorEl)
            {
                fieldErrorEl.textContent = error.message;
            }
            else
            {
                block.append(createElement("div", "", error.message));
            }
        }

        if (block.children.length === 1)
        {
            block.append(createElement("div", "", "Vérifie les champs en rouge."));
        }
    }

    resultEl.append(block);

    if (result.ok && result.report)
    {
        resultEl.append(createReportElement(result.report));
    }

    taskDetailsEl.append(resultEl);
}


async function simulateCurrentTask()
{
    const task = getSelectedTask();

    if (!task)
    {
        return;
    }

    const scenarioId = state.scenarioByTask[task.id] || "";
    const result     = await api.simulate(task.id, buildPayload(task), scenarioId);

    showResult(task, result);
}


function createScenarioField(task, scenarios)
{
    const field   = createElement("div", "field");
    const options = scenarios.map((scenario) => ({ value: scenario.id, label: scenario.label }));
    const current = state.scenarioByTask[task.id] || scenarios[0].id;

    state.scenarioByTask[task.id] = current;

    const dropdown = createDropdown(options, current, (value) =>
    {
        state.scenarioByTask[task.id] = value;
        clearResult();
    });

    field.append(
        createElement("div", "field-label", "Données de test"),
        createElement("div", "field-hint", "Fausses données, en attendant la lecture réelle du jeu."),
        dropdown
    );

    return field;
}


function getDraft(task)
{
    if (!state.draftByTask[task.id])
    {
        state.draftByTask[task.id] = { name: "", key: null };
    }

    return state.draftByTask[task.id];
}


function getTaskPresets(task)
{
    return state.presets.filter((preset) => preset.taskId === task.id);
}


function createValuesFromPreset(task, saved)
{
    const values = createInitialValues(task);

    for (const parameter of task.parameters)
    {
        const value = saved[parameter.id];

        if (value !== undefined)
        {
            values[parameter.id] = Array.isArray(value) ? [...value] : value;
        }
    }

    return values;
}


function setPresetMessage(text, isError)
{
    if (!presetMessageEl)
    {
        return;
    }

    presetMessageEl.textContent = text;
    presetMessageEl.className   = isError ? "preset-message is-error" : "preset-message";
}


function createPresetRow(task, preset)
{
    const row     = createElement("div", "preset-row");
    const label   = createElement("div", "preset-label");
    const actions = createElement("div", "preset-actions");
    const load    = createElement("button", "secondary", "Charger");
    const remove  = createElement("button", "secondary", "Supprimer");

    let confirmTimer = null;

    label.append(createElement("span", "preset-name", preset.name));

    if (preset.key !== null)
    {
        label.append(createElement("span", "preset-badge", `Pavé ${preset.key}`));
    }

    load.type   = "button";
    remove.type = "button";

    load.addEventListener("click", () =>
    {
        state.valuesByTask[task.id] = createValuesFromPreset(task, preset.values);
        state.draftByTask[task.id]  = { name: preset.name, key: preset.key };

        renderTaskDetails();
        setPresetMessage(`Préréglage « ${preset.name} » chargé.`, false);
    });

    remove.addEventListener("click", async () =>
    {
        if (confirmTimer === null)
        {
            remove.textContent = "Confirmer ?";
            remove.className   = "danger";

            confirmTimer = setTimeout(() =>
            {
                confirmTimer       = null;
                remove.textContent = "Supprimer";
                remove.className   = "secondary";
            }, 3000);

            return;
        }

        clearTimeout(confirmTimer);

        const result = await api.deletePreset(preset.id);

        if (result.ok)
        {
            state.presets = result.presets;
            renderTaskDetails();
            setPresetMessage(`Préréglage « ${preset.name} » supprimé.`, false);
        }
    });

    actions.append(load, remove);
    row.append(label, actions);

    return row;
}


function createPresetList(task)
{
    const section = createElement("div", "preset-section");
    const presets = getTaskPresets(task);

    section.append(createElement("div", "field-label", "Préréglages"));

    if (presets.length === 0)
    {
        section.append(createElement("div", "panel-empty", "Aucun préréglage pour cette tâche."));
        return section;
    }

    for (const preset of presets)
    {
        section.append(createPresetRow(task, preset));
    }

    return section;
}


async function saveCurrentPreset(task)
{
    const draft  = getDraft(task);
    const result = await api.savePreset(task.id, draft.name, buildPayload(task), draft.key);

    if (!result.ok)
    {
        const metaErrors = result.errors.filter((error) => error.parameterId === "name" || error.parameterId === "key");

        if (metaErrors.length > 0)
        {
            setPresetMessage(metaErrors.map((error) => error.message).join(" "), true);
        }

        if (metaErrors.length < result.errors.length)
        {
            showResult(task, { ok: false, errors: result.errors.filter((error) => !metaErrors.includes(error)) });
            setPresetMessage("Corrige les réglages avant d'enregistrer.", true);
        }

        return;
    }

    state.presets = result.presets;

    renderTaskDetails();
    setPresetMessage(result.notice || (result.created ? "Préréglage enregistré." : "Préréglage mis à jour."), false);
}


function createSaveSection(task)
{
    const section   = createElement("div", "preset-section");
    const draft     = getDraft(task);
    const nameEl    = createElement("input");
    const keyHolder = createElement("div");
    const button    = createElement("button", "", "Enregistrer le préréglage");

    function createKeyOptions()
    {
        const draftName = draft.name.trim().toLowerCase();
        const options   = [{ value: "", label: "Aucune touche" }];

        for (const key of PRESET_KEYS)
        {
            const owner = state.presets.find((preset) =>
            {
                return preset.key === key && !(preset.taskId === task.id && preset.name.toLowerCase() === draftName);
            });

            options.push({ value: String(key), label: owner ? `Pavé ${key} (utilisé par « ${owner.name} »)` : `Pavé ${key}` });
        }

        return options;
    }

    function renderKeyDropdown()
    {
        keyHolder.replaceChildren(createDropdown(createKeyOptions(), draft.key === null ? "" : String(draft.key), (value) =>
        {
            draft.key = value === "" ? null : Number(value);
        }));
    }

    nameEl.type        = "text";
    nameEl.placeholder = "Nom du préréglage";
    nameEl.maxLength   = 40;
    nameEl.value       = draft.name;

    nameEl.addEventListener("input", () =>
    {
        draft.name = nameEl.value;
        renderKeyDropdown();
    });

    button.type = "button";
    button.addEventListener("click", () => saveCurrentPreset(task));

    presetMessageEl = createElement("div", "preset-message");

    renderKeyDropdown();

    section.append(
        createElement("div", "field-label", "Enregistrer ces réglages"),
        createElement("div", "field-hint", "Partagé par tous les profils de ce jeu. Une touche du pavé numérique lance la simulation quand la barre F4 est ouverte."),
        nameEl,
        keyHolder,
        button,
        presetMessageEl
    );

    return section;
}


function renderTaskDetails()
{
    const task = getSelectedTask();

    fieldErrorEls   = {};
    resultEl        = null;
    presetMessageEl = null;

    if (!task)
    {
        taskDetailsEl.replaceChildren();
        return;
    }

    const form = createElement("div", "task-form");
    const values = getValues(task);

    form.append(createElement("div", "task-description", task.description));
    form.append(createPresetList(task));

    for (const parameter of task.parameters)
    {
        form.append(createField(parameter, values));
    }

    const scenarios = (state.context.simulations && state.context.simulations[task.id]) || [];

    if (scenarios.length > 0)
    {
        form.append(createScenarioField(task, scenarios));
    }

    const simulateButton = createElement("button", "", scenarios.length > 0 ? "Simuler" : "Vérifier les réglages");

    simulateButton.type = "button";
    simulateButton.addEventListener("click", simulateCurrentTask);

    form.append(simulateButton);
    form.append(createSaveSection(task));

    taskDetailsEl.replaceChildren(form);
}


function renderTaskList()
{
    const tasks = state.context.tasks;

    taskListEl.replaceChildren(...tasks.map((task) =>
    {
        const isSelected = task.id === state.selectedTaskId;
        const button     = createElement("button", isSelected ? "task-button is-selected" : "task-button", task.name);

        button.type = "button";

        button.addEventListener("click", () =>
        {
            state.selectedTaskId = task.id;
            renderTaskList();
            renderTaskDetails();
        });

        return button;
    }));
}


function renderEmptyState(message)
{
    taskListEl.replaceChildren(createElement("div", "panel-empty", message));
    taskDetailsEl.replaceChildren();
}


async function loadContext()
{
    state.context = await api.getContext();

    const presetsResult = await api.listPresets();

    state.presets = presetsResult.presets;

    const { profileName, game, tasks } = state.context;

    contextLabelEl.textContent = profileName
        ? (game ? `${profileName} · ${game.name}` : profileName)
        : "Aucun profil de jeu";

    if (!profileName)
    {
        renderEmptyState("Sélectionne un profil dans la fenêtre PAUL.");
        return;
    }

    if (!game || tasks.length === 0)
    {
        renderEmptyState("Ce profil n'a pas de tâches : choisis un jeu avec des scripts à la création du profil.");
        return;
    }

    if (!tasks.some((task) => task.id === state.selectedTaskId))
    {
        state.selectedTaskId = tasks[0].id;
    }

    renderTaskList();
    renderTaskDetails();
}


closeButton.addEventListener("click", () =>
{
    api.close();
});


api.onRefresh(loadContext);

loadContext();
