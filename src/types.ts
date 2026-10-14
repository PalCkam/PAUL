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
