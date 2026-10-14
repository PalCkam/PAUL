import type { ParameterError, ParameterValues, ReportNote, SimulationReport } from "./tasks/types";
import type { OverlayCard, Preset } from "./types";



export const PRESET_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const MAX_PRESET_NAME_LENGTH = 40;



export type PresetMeta =
{
    name: string;
    key:  number | null;
};



export type PresetMetaResult =
    | { ok: true;  meta: PresetMeta }
    | { ok: false; errors: ParameterError[] };



export type PresetDraft =
{
    taskId: string;
    name:   string;
    values: ParameterValues;
    key:    number | null;
};



export type UpsertResult =
{
    presets: Preset[];
    preset:  Preset;
    created: boolean;
    notice:  string | null;
};



export function parsePresetMeta(name: unknown, key: unknown): PresetMetaResult
{
    const errors: ParameterError[] = [];
    const cleanName = typeof name === "string" ? name.trim() : "";

    if (cleanName === "")
    {
        errors.push({ parameterId: "name", message: "Donne un nom au préréglage." });
    }
    else if (cleanName.length > MAX_PRESET_NAME_LENGTH)
    {
        errors.push({ parameterId: "name", message: `Nom trop long (${MAX_PRESET_NAME_LENGTH} caractères maximum).` });
    }

    let cleanKey: number | null = null;

    if (key !== null && key !== undefined && key !== "")
    {
        if (typeof key === "number" && PRESET_KEYS.includes(key))
        {
            cleanKey = key;
        }
        else
        {
            errors.push({ parameterId: "key", message: "Touche invalide (pavé numérique 1 à 9)." });
        }
    }

    if (errors.length > 0)
    {
        return { ok: false, errors };
    }

    return { ok: true, meta: { name: cleanName, key: cleanKey } };
}



export function upsertPreset(presets: Preset[], draft: PresetDraft, newId: () => string): UpsertResult
{
    const existing = presets.find((preset: Preset) =>
    {
        return preset.taskId === draft.taskId && preset.name.toLowerCase() === draft.name.toLowerCase();
    });

    const saved: Preset = { id: existing ? existing.id : newId(), ...draft };

    let notice: string | null = null;

    const next = presets.map((preset: Preset) =>
    {
        if (preset.id === saved.id)
        {
            return saved;
        }

        if (draft.key !== null && preset.key === draft.key)
        {
            notice = `Pavé ${draft.key} était utilisé par « ${preset.name} » : la touche lui est retirée.`;

            return { ...preset, key: null };
        }

        return preset;
    });

    if (!existing)
    {
        next.push(saved);
    }

    return { presets: next, preset: saved, created: !existing, notice };
}



export function toOverlayCard(title: string, report: SimulationReport, maxNotes = 4): OverlayCard
{
    return {
        title,
        headline: report.headline,
        stats:    report.stats,
        notes:    report.notes.filter((note: ReportNote) => note.level === "warning").slice(0, maxNotes)
    };
}
