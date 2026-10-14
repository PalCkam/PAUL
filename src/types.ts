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
    key:    number | null;
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
