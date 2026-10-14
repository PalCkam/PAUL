import { isRecord } from "../utils";
import type
{
    CapabilityDefinition,
    ChoiceOption,
    GameManifest,
    ItemDefinition,
    ParseResult,
    TaskDefinition,
    TaskParameter
} from "./types";



const SLUG_PATTERN      = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PARAMETER_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;
const ITEM_PATTERN      = /^[a-z0-9_]+$/;



function isFiniteNumber(value: unknown): value is number
{
    return typeof value === "number" && Number.isFinite(value);
}



function isText(value: unknown): value is string
{
    return typeof value === "string" && value.trim().length > 0;
}



function readOptionalText(source: Record<string, unknown>, key: string, problems: string[]): string | undefined
{
    const value = source[key];

    if (value === undefined)
    {
        return undefined;
    }

    if (!isText(value))
    {
        problems.push(`"${key}" doit être un texte non vide.`);
        return undefined;
    }

    return value.trim();
}



function readSlug(source: Record<string, unknown>, problems: string[]): string
{
    const value = source.id;

    if (typeof value !== "string" || !SLUG_PATTERN.test(value))
    {
        problems.push(`"id" invalide (minuscules, chiffres et tirets, ex. "fill-furnaces").`);
        return "";
    }

    return value;
}



function readRequiredText(source: Record<string, unknown>, key: string, problems: string[]): string
{
    const value = source[key];

    if (!isText(value))
    {
        problems.push(`"${key}" doit être un texte non vide.`);
        return "";
    }

    return value.trim();
}



function readStringList(value: unknown, key: string, problems: string[]): string[] | undefined
{
    if (value === undefined)
    {
        return undefined;
    }

    if (!Array.isArray(value) || !value.every(isText))
    {
        problems.push(`"${key}" doit être une liste de textes non vides.`);
        return undefined;
    }

    return value.map((item: string) => item.trim());
}



function readChoiceOptions(value: unknown, problems: string[]): ChoiceOption[]
{
    if (!Array.isArray(value) || value.length === 0)
    {
        problems.push(`"options" doit être une liste non vide de { "value", "label" }.`);
        return [];
    }

    const options: ChoiceOption[] = [];

    for (const entry of value)
    {
        if (!isRecord(entry) || !isText(entry.value) || !isText(entry.label))
        {
            problems.push(`chaque option doit avoir un "value" et un "label" non vides.`);
            continue;
        }

        if (options.some((option: ChoiceOption) => option.value === entry.value))
        {
            problems.push(`l'option "${entry.value}" est en double.`);
            continue;
        }

        options.push({ value: entry.value.trim(), label: entry.label.trim() });
    }

    return options;
}



function parseParameter(raw: unknown, position: number, errors: string[]): TaskParameter | null
{
    if (!isRecord(raw))
    {
        errors.push(`paramètre n°${position + 1} : objet attendu.`);
        return null;
    }

    const where    = typeof raw.id === "string" ? `paramètre "${raw.id}"` : `paramètre n°${position + 1}`;
    const problems: string[] = [];

    const id = typeof raw.id === "string" && PARAMETER_PATTERN.test(raw.id) ? raw.id : "";

    if (id === "")
    {
        problems.push(`"id" invalide (lettres et chiffres, commence par une lettre, ex. "maxFurnaces").`);
    }

    const label       = readRequiredText(raw, "label", problems);
    const description = readOptionalText(raw, "description", problems);
    const emptyMeans  = readOptionalText(raw, "emptyMeans", problems);

    let required = false;

    if (raw.required !== undefined)
    {
        if (typeof raw.required === "boolean")
        {
            required = raw.required;
        }
        else
        {
            problems.push(`"required" doit être true ou false.`);
        }
    }

    if (emptyMeans !== undefined && required)
    {
        problems.push(`"emptyMeans" n'a de sens que pour un paramètre non obligatoire.`);
    }

    const base = { id, label, description, required, emptyMeans };

    let parameter: TaskParameter | null = null;

    switch (raw.type)
    {
        case "text":
        {
            const defaultValue = readOptionalText(raw, "default", problems);

            parameter = { ...base, type: "text", default: defaultValue };
            break;
        }

        case "number":
        {
            const min = raw.min;
            const max = raw.max;

            if (min !== undefined && !isFiniteNumber(min))
            {
                problems.push(`"min" doit être un nombre.`);
            }

            if (max !== undefined && !isFiniteNumber(max))
            {
                problems.push(`"max" doit être un nombre.`);
            }

            if (isFiniteNumber(min) && isFiniteNumber(max) && min > max)
            {
                problems.push(`"min" ne peut pas dépasser "max".`);
            }

            if (raw.integer !== undefined && typeof raw.integer !== "boolean")
            {
                problems.push(`"integer" doit être true ou false.`);
            }

            if (raw.default !== undefined && !isFiniteNumber(raw.default))
            {
                problems.push(`"default" doit être un nombre.`);
            }

            if (isFiniteNumber(raw.default))
            {
                if (isFiniteNumber(min) && raw.default < min)
                {
                    problems.push(`"default" est inférieur à "min".`);
                }

                if (isFiniteNumber(max) && raw.default > max)
                {
                    problems.push(`"default" est supérieur à "max".`);
                }

                if (raw.integer === true && !Number.isInteger(raw.default))
                {
                    problems.push(`"default" doit être un entier.`);
                }
            }

            parameter =
            {
                ...base,
                type:    "number",
                integer: raw.integer === true,
                min:     isFiniteNumber(min) ? min : undefined,
                max:     isFiniteNumber(max) ? max : undefined,
                default: isFiniteNumber(raw.default) ? raw.default : undefined
            };
            break;
        }

        case "boolean":
        {
            if (raw.default !== undefined && typeof raw.default !== "boolean")
            {
                problems.push(`"default" doit être true ou false.`);
            }

            parameter =
            {
                ...base,
                required: false,
                type:     "boolean",
                default:  raw.default === true
            };
            break;
        }

        case "choice":
        {
            const options      = readChoiceOptions(raw.options, problems);
            const defaultValue = readOptionalText(raw, "default", problems);

            if (defaultValue !== undefined && !options.some((option: ChoiceOption) => option.value === defaultValue))
            {
                problems.push(`"default" ne correspond à aucune option.`);
            }

            parameter = { ...base, type: "choice", options, default: defaultValue };
            break;
        }

        case "item":
        {
            const filter       = readOptionalText(raw, "filter", problems);
            const defaultValue = readOptionalText(raw, "default", problems);

            parameter = { ...base, type: "item", filter, default: defaultValue };
            break;
        }

        case "items":
        {
            const filter       = readOptionalText(raw, "filter", problems);
            const defaultValue = readStringList(raw.default, "default", problems);

            parameter = { ...base, type: "items", filter, default: defaultValue };
            break;
        }

        default:
        {
            problems.push(`"type" doit valoir text, number, boolean, choice, item ou items.`);
        }
    }

    if (problems.length > 0)
    {
        errors.push(...problems.map((problem: string) => `${where} : ${problem}`));
        return null;
    }

    return parameter;
}



function parseCapability(raw: unknown, position: number, errors: string[]): CapabilityDefinition | null
{
    if (!isRecord(raw))
    {
        errors.push(`capacité n°${position + 1} : objet attendu.`);
        return null;
    }

    const where    = typeof raw.id === "string" ? `capacité "${raw.id}"` : `capacité n°${position + 1}`;
    const problems: string[] = [];

    const id          = readSlug(raw, problems);
    const label       = readRequiredText(raw, "label", problems);
    const description = readRequiredText(raw, "description", problems);

    if (problems.length > 0)
    {
        errors.push(...problems.map((problem: string) => `${where} : ${problem}`));
        return null;
    }

    return { id, label, description };
}



export function parseGameManifest(raw: unknown): ParseResult<GameManifest>
{
    if (!isRecord(raw))
    {
        return { value: null, errors: ["objet JSON attendu."] };
    }

    const errors: string[] = [];

    const id   = readSlug(raw, errors);
    const name = readRequiredText(raw, "name", errors);

    const capabilities: CapabilityDefinition[] = [];

    if (!Array.isArray(raw.capabilities))
    {
        errors.push(`"capabilities" doit être une liste.`);
    }
    else
    {
        raw.capabilities.forEach((entry: unknown, position: number) =>
        {
            const capability = parseCapability(entry, position, errors);

            if (!capability)
            {
                return;
            }

            if (capabilities.some((existing: CapabilityDefinition) => existing.id === capability.id))
            {
                errors.push(`capacité "${capability.id}" déclarée en double.`);
                return;
            }

            capabilities.push(capability);
        });
    }

    if (errors.length > 0)
    {
        return { value: null, errors };
    }

    return { value: { id, name, capabilities }, errors: [] };
}



export function parseTaskDefinition(raw: unknown): ParseResult<TaskDefinition>
{
    if (!isRecord(raw))
    {
        return { value: null, errors: ["objet JSON attendu."] };
    }

    const errors: string[] = [];

    const id          = readSlug(raw, errors);
    const name        = readRequiredText(raw, "name", errors);
    const description = readRequiredText(raw, "description", errors);
    const requires    = readStringList(raw.requires, "requires", errors) ?? [];

    const parameters: TaskParameter[] = [];

    if (raw.parameters !== undefined && !Array.isArray(raw.parameters))
    {
        errors.push(`"parameters" doit être une liste.`);
    }
    else
    {
        const entries: unknown[] = Array.isArray(raw.parameters) ? raw.parameters : [];

        entries.forEach((entry: unknown, position: number) =>
        {
            const parameter = parseParameter(entry, position, errors);

            if (!parameter)
            {
                return;
            }

            if (parameters.some((existing: TaskParameter) => existing.id === parameter.id))
            {
                errors.push(`paramètre "${parameter.id}" déclaré en double.`);
                return;
            }

            parameters.push(parameter);
        });
    }

    if (errors.length > 0)
    {
        return { value: null, errors };
    }

    return { value: { id, name, description, requires, parameters }, errors: [] };
}



export function parseItems(raw: unknown): ParseResult<ItemDefinition[]>
{
    if (!Array.isArray(raw))
    {
        return { value: null, errors: ["liste d'items attendue."] };
    }

    const errors: string[] = [];
    const items: ItemDefinition[] = [];

    raw.forEach((entry: unknown, position: number) =>
    {
        const where = isRecord(entry) && typeof entry.id === "string" ? `item "${entry.id}"` : `item n°${position + 1}`;

        if (!isRecord(entry))
        {
            errors.push(`${where} : objet attendu.`);
            return;
        }

        const problems: string[] = [];

        const id   = typeof entry.id === "string" && ITEM_PATTERN.test(entry.id) ? entry.id : "";
        const name = readRequiredText(entry, "name", problems);
        const tags = readStringList(entry.tags, "tags", problems) ?? [];

        if (id === "")
        {
            problems.push(`"id" invalide (minuscules, chiffres et "_", ex. "raw_iron").`);
        }

        if (id !== "" && items.some((existing: ItemDefinition) => existing.id === id))
        {
            problems.push("déjà défini.");
        }

        if (problems.length > 0)
        {
            errors.push(...problems.map((problem: string) => `${where} : ${problem}`));
            return;
        }

        items.push({ id, name, tags });
    });

    if (errors.length > 0)
    {
        return { value: null, errors };
    }

    return { value: items, errors: [] };
}



export function findMissingCapabilities(task: TaskDefinition, manifest: GameManifest): string[]
{
    return task.requires.filter((required: string) =>
    {
        return !manifest.capabilities.some((capability: CapabilityDefinition) => capability.id === required);
    });
}
