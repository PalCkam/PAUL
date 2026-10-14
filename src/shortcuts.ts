import { isRecord } from "./utils";
import type { Binding, GameProfile, ShortcutAction, ShortcutOption, ShortcutPanelId } from "./types";



export const SHORTCUT_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const SHORTCUT_PANELS: ShortcutPanelId[] = ["notes", "tasks", "shortcuts"];

export const PANEL_OPTIONS: ShortcutOption[] =
[
    { value: "panel:notes",     label: "Ouvrir : Notes" },
    { value: "panel:tasks",     label: "Ouvrir : Tâches" },
    { value: "panel:shortcuts", label: "Ouvrir : Raccourcis" }
];



export type LegacyPresetKey =
{
    gameId:   string;
    presetId: string;
    key:      number;
};



export function actionToValue(action: ShortcutAction): string
{
    switch (action.type)
    {
        case "preset": return `preset:${action.presetId}`;
        case "note":   return `note:${action.noteId}`;
        case "panel":  return `panel:${action.panelId}`;
    }
}



export function parseActionValue(value: unknown): ShortcutAction | null
{
    if (typeof value !== "string")
    {
        return null;
    }

    const separator = value.indexOf(":");
    const type      = value.slice(0, separator);
    const target    = value.slice(separator + 1);

    if (separator === -1 || target === "")
    {
        return null;
    }

    if (type === "preset")
    {
        return { type, presetId: target };
    }

    if (type === "note")
    {
        return { type, noteId: target };
    }

    if (type === "panel" && SHORTCUT_PANELS.includes(target as ShortcutPanelId))
    {
        return { type, panelId: target as ShortcutPanelId };
    }

    return null;
}



export function parseBinding(raw: unknown): Binding | null
{
    if (!isRecord(raw) || typeof raw.key !== "number" || !SHORTCUT_KEYS.includes(raw.key) || !isRecord(raw.action))
    {
        return null;
    }

    const { type } = raw.action;

    const value = type === "preset" ? `preset:${String(raw.action.presetId ?? "")}`
        : type === "note" ? `note:${String(raw.action.noteId ?? "")}`
        : type === "panel" ? `panel:${String(raw.action.panelId ?? "")}`
        : "";

    const action = parseActionValue(value);

    return action ? { key: raw.key, action } : null;
}



export function setBinding(bindings: Binding[], key: number, action: ShortcutAction | null): Binding[]
{
    const others = bindings.filter((binding: Binding) => binding.key !== key);

    if (action === null)
    {
        return others;
    }

    return [...others, { key, action }].sort((a: Binding, b: Binding) => a.key - b.key);
}



export function bindingsFromLegacyKeys(
    legacy:   LegacyPresetKey[],
    profiles: GameProfile[],
    existing: Record<string, Binding[]>
): Record<string, Binding[]>
{
    const result: Record<string, Binding[]> = {};

    for (const [profileName, bindings] of Object.entries(existing))
    {
        result[profileName] = [...bindings];
    }

    for (const entry of legacy)
    {
        for (const profile of profiles.filter((candidate: GameProfile) => candidate.gameId === entry.gameId))
        {
            const bindings = result[profile.name] ?? [];

            if (!bindings.some((binding: Binding) => binding.key === entry.key))
            {
                result[profile.name] = setBinding(bindings, entry.key, { type: "preset", presetId: entry.presetId });
            }
        }
    }

    return result;
}
