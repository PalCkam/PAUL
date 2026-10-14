import type { ParameterError, ParameterValues, ReportNote, SimulationReport } from "./tasks/types";
import type { OverlayCard, Preset } from "./types";



export const MAX_PRESET_NAME_LENGTH = 40;



export type PresetNameResult =
    | { ok: true;  name: string }
    | { ok: false; errors: ParameterError[] };



export type PresetDraft =
{
    taskId: string;
    name:   string;
    values: ParameterValues;
};



export type UpsertResult =
{
    presets: Preset[];
    preset:  Preset;
    created: boolean;
};



export function parsePresetName(name: unknown): PresetNameResult
{
    const cleanName = typeof name === "string" ? name.trim() : "";

    if (cleanName === "")
    {
        return { ok: false, errors: [{ parameterId: "name", message: "Donne un nom au préréglage." }] };
    }

    if (cleanName.length > MAX_PRESET_NAME_LENGTH)
    {
        return { ok: false, errors: [{ parameterId: "name", message: `Nom trop long (${MAX_PRESET_NAME_LENGTH} caractères maximum).` }] };
    }

    return { ok: true, name: cleanName };
}



export function upsertPreset(presets: Preset[], draft: PresetDraft, newId: () => string): UpsertResult
{
    const existing = presets.find((preset: Preset) =>
    {
        return preset.taskId === draft.taskId && preset.name.toLowerCase() === draft.name.toLowerCase();
    });

    const saved: Preset = { id: existing ? existing.id : newId(), ...draft };

    const next = existing
        ? presets.map((preset: Preset) => (preset.id === saved.id ? saved : preset))
        : [...presets, saved];

    return { presets: next, preset: saved, created: !existing };
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
