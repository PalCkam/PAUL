import { isRecord } from "../utils";
import type
{
    ChoiceOption,
    ItemAmount,
    ItemCatalog,
    ItemDefinition,
    ParameterError,
    ParameterValue,
    ParameterValues,
    ResolveResult,
    TaskDefinition,
    TaskParameter
} from "./types";



type ValueResult =
    | { ok: true;  value: ParameterValue }
    | { ok: false; message: string };



function accept(value: ParameterValue): ValueResult
{
    return { ok: true, value };
}



function reject(message: string): ValueResult
{
    return { ok: false, message };
}



function isEmpty(value: unknown): boolean
{
    if (value === undefined || value === null)
    {
        return true;
    }

    if (typeof value === "string")
    {
        return value.trim() === "";
    }

    return Array.isArray(value) && value.length === 0;
}



function refusedByCatalog(filter: string | undefined, itemId: string, catalog: ItemCatalog | undefined): boolean
{
    return catalog !== undefined && !catalog.isAllowed(filter, itemId);
}



function resolveValue(parameter: TaskParameter, raw: unknown, catalog: ItemCatalog | undefined): ValueResult
{
    switch (parameter.type)
    {
        case "text":
        {
            if (typeof raw !== "string")
            {
                return reject(`"${parameter.label}" doit être un texte.`);
            }

            return accept(raw.trim());
        }

        case "number":
        {
            if (typeof raw !== "number" || !Number.isFinite(raw))
            {
                return reject(`"${parameter.label}" doit être un nombre.`);
            }

            if (parameter.integer && !Number.isInteger(raw))
            {
                return reject(`"${parameter.label}" doit être un nombre entier.`);
            }

            if (parameter.min !== undefined && raw < parameter.min)
            {
                return reject(`"${parameter.label}" doit être au moins ${parameter.min}.`);
            }

            if (parameter.max !== undefined && raw > parameter.max)
            {
                return reject(`"${parameter.label}" doit être au plus ${parameter.max}.`);
            }

            return accept(raw);
        }

        case "boolean":
        {
            if (typeof raw !== "boolean")
            {
                return reject(`"${parameter.label}" doit être oui ou non.`);
            }

            return accept(raw);
        }

        case "choice":
        {
            const known = parameter.options.some((option: ChoiceOption) => option.value === raw);

            if (typeof raw !== "string" || !known)
            {
                return reject(`"${parameter.label}" : choix inconnu.`);
            }

            return accept(raw);
        }

        case "item":
        {
            if (typeof raw !== "string")
            {
                return reject(`"${parameter.label}" doit être un item.`);
            }

            const itemId = raw.trim();

            if (refusedByCatalog(parameter.filter, itemId, catalog))
            {
                return reject(`"${itemId}" n'est pas accepté pour "${parameter.label}".`);
            }

            return accept(itemId);
        }

        case "items":
        {
            const isItemList = Array.isArray(raw) && raw.every((entry: unknown) =>
            {
                return typeof entry === "string" && entry.trim() !== "";
            });

            if (!isItemList)
            {
                return reject(`"${parameter.label}" doit être une liste d'items.`);
            }

            const items: string[] = (raw as string[]).map((entry: string) => entry.trim());

            if (new Set(items).size !== items.length)
            {
                return reject(`"${parameter.label}" contient un item en double.`);
            }

            const refused = items.find((item: string) => refusedByCatalog(parameter.filter, item, catalog));

            if (refused !== undefined)
            {
                return reject(`"${refused}" n'est pas accepté pour "${parameter.label}".`);
            }

            return accept(items);
        }

        case "itemAmounts":
        {
            if (!Array.isArray(raw))
            {
                return reject(`"${parameter.label}" doit être une liste d'items avec leur quantité.`);
            }

            const entries: ItemAmount[] = [];

            for (const entry of raw as unknown[])
            {
                const itemId = typeof entry === "string" ? entry : (isRecord(entry) ? entry.itemId : undefined);
                const amount = isRecord(entry) && entry.amount !== undefined ? entry.amount : null;

                if (typeof itemId !== "string" || itemId.trim() === "")
                {
                    return reject(`"${parameter.label}" doit être une liste d'items avec leur quantité.`);
                }

                if (amount !== null && (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1))
                {
                    return reject(`La quantité de "${itemId.trim()}" doit être un nombre entier d'au moins 1 (vide = tout).`);
                }

                entries.push({ itemId: itemId.trim(), amount });
            }

            if (new Set(entries.map((entry: ItemAmount) => entry.itemId)).size !== entries.length)
            {
                return reject(`"${parameter.label}" contient un item en double.`);
            }

            const refused = entries.find((entry: ItemAmount) => refusedByCatalog(parameter.filter, entry.itemId, catalog));

            if (refused)
            {
                return reject(`"${refused.itemId}" n'est pas accepté pour "${parameter.label}".`);
            }

            return accept(entries);
        }
    }
}



export function createItemCatalog(items: ItemDefinition[]): ItemCatalog
{
    return {
        isAllowed(filter: string | undefined, itemId: string): boolean
        {
            const item = items.find((candidate: ItemDefinition) => candidate.id === itemId);

            if (!item)
            {
                return false;
            }

            return filter === undefined || item.tags.includes(filter);
        }
    };
}



export function resolveParameterValues(task: TaskDefinition, input: unknown, catalog?: ItemCatalog): ResolveResult
{
    if (input !== undefined && !isRecord(input))
    {
        return { ok: false, errors: [{ parameterId: null, message: "Les paramètres doivent être un objet." }] };
    }

    const source: Record<string, unknown> = input ?? {};
    const values: ParameterValues         = {};
    const errors: ParameterError[]        = [];

    for (const key of Object.keys(source))
    {
        if (!task.parameters.some((parameter: TaskParameter) => parameter.id === key))
        {
            errors.push({ parameterId: key, message: `Paramètre inconnu : "${key}".` });
        }
    }

    for (const parameter of task.parameters)
    {
        const raw = source[parameter.id];

        if (isEmpty(raw))
        {
            if (parameter.default !== undefined)
            {
                values[parameter.id] = parameter.default;
            }
            else if (parameter.required)
            {
                errors.push({ parameterId: parameter.id, message: `"${parameter.label}" est obligatoire.` });
            }

            continue;
        }

        const result = resolveValue(parameter, raw, catalog);

        if (result.ok)
        {
            values[parameter.id] = result.value;
        }
        else
        {
            errors.push({ parameterId: parameter.id, message: result.message });
        }
    }

    if (errors.length > 0)
    {
        return { ok: false, errors };
    }

    return { ok: true, values };
}
