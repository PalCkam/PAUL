const api = window.tasksPanelApi;

const contextLabelEl = document.getElementById("contextLabel");
const taskListEl     = document.getElementById("taskList");
const taskDetailsEl  = document.getElementById("taskDetails");
const closeButton    = document.getElementById("closeButton");

const state =
{
    context:        null,
    selectedTaskId: null,
    valuesByTask:   {}
};

let fieldErrorEls = {};
let resultEl      = null;


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


function createSelectControl(parameter, values, options)
{
    const select = createElement("select");

    if (!parameter.required && parameter.default === undefined)
    {
        select.append(new Option("—", ""));
    }

    for (const option of options)
    {
        select.append(new Option(option.label, option.value));
    }

    select.value = values[parameter.id];

    select.addEventListener("change", () =>
    {
        values[parameter.id] = select.value;
        clearResult();
    });

    return select;
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


function showResult(task, result)
{
    clearResult();

    if (result.ok)
    {
        resultEl = createElement("div", "result is-valid");
        resultEl.append(createElement("div", "result-title", "Réglages valides"));

        for (const parameter of task.parameters)
        {
            const value = result.values[parameter.id];

            if (value === undefined && !parameter.emptyMeans)
            {
                continue;
            }

            const text = value === undefined ? parameter.emptyMeans : formatValue(parameter, value);

            resultEl.append(createElement("div", "", `${parameter.label} : ${text}`));
        }
    }
    else
    {
        resultEl = createElement("div", "result is-invalid");
        resultEl.append(createElement("div", "result-title", "Réglages à corriger"));

        for (const error of result.errors)
        {
            const fieldErrorEl = error.parameterId ? fieldErrorEls[error.parameterId] : null;

            if (fieldErrorEl)
            {
                fieldErrorEl.textContent = error.message;
            }
            else
            {
                resultEl.append(createElement("div", "", error.message));
            }
        }

        if (resultEl.children.length === 1)
        {
            resultEl.append(createElement("div", "", "Vérifie les champs en rouge."));
        }
    }

    taskDetailsEl.append(resultEl);
}


async function validateCurrentTask()
{
    const task = getSelectedTask();

    if (!task)
    {
        return;
    }

    const result = await api.validate(task.id, buildPayload(task));

    showResult(task, result);
}


function renderTaskDetails()
{
    const task = getSelectedTask();

    fieldErrorEls = {};
    resultEl      = null;

    if (!task)
    {
        taskDetailsEl.replaceChildren();
        return;
    }

    const form = createElement("div", "task-form");
    const values = getValues(task);

    form.append(createElement("div", "task-description", task.description));

    for (const parameter of task.parameters)
    {
        form.append(createField(parameter, values));
    }

    const validateButton = createElement("button", "", "Vérifier les réglages");

    validateButton.type = "button";
    validateButton.addEventListener("click", validateCurrentTask);

    form.append(validateButton);

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
