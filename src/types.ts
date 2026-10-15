import type { ParameterValues, ReportNote } from "./tasks/types";



export type InputMode = "text" | "voice";

export type Mod = "game" | "dev" | "life";



export type LaunchPayload =
{
    inputMode: InputMode;
    mod:       Mod;
    gameName?: string;
};



export type GameProfile =
{
    name:    string;
    gameId?: string | null;
};



export type LaunchEntry =
{
    launchedAt: string;
    inputMode:  InputMode;
    mod:        Mod;
    gameName:   string | null;
};



export type ProfilesFileData =
{
    profiles:      GameProfile[];
    launchHistory: LaunchEntry[];
};



export type UsageData =
{
    webRequests: number;
    launchCount: number;
};



export type Note =
{
    id:        string;
    title:     string;
    content:   string;
    createdAt: string;
    updatedAt: string;
};



export type NotesFileData =
{
    notesByProfile: Record<string, Note[]>;
};



export type Preset =
{
    id:     string;
    taskId: string;
    name:   string;
    values: ParameterValues;
};



export type ShortcutPanelId = "notes" | "tasks" | "shortcuts";



export type ShortcutToolId = "capture";



export type ShortcutAction =
    | { type: "preset"; presetId: string }
    | { type: "note";   noteId: string }
    | { type: "panel";  panelId: ShortcutPanelId }
    | { type: "tool";   toolId: ShortcutToolId };



export type Binding =
{
    key:    number;
    action: ShortcutAction;
};



export type ShortcutsFileData =
{
    bindingsByProfile: Record<string, Binding[]>;
};



export type SettingsFileData =
{
    captureWindowKey: string | null;
};



export type ShortcutOption =
{
    value: string;
    label: string;
};



export type ShortcutSlot =
{
    key:   number;
    value: string;
};



export type PresetsFileData =
{
    presetsByGame: Record<string, Preset[]>;
};



export type OverlayCard =
{
    title:    string;
    headline: string;
    stats:    { label: string; value: string }[];
    notes:    ReportNote[];
};



export type PinnedNoteView =
{
    id:      string;
    title:   string;
    content: string;
};



export type NoteChanges =
{
    title:   string;
    content: string;
};
