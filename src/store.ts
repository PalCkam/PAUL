import { app } from "electron";
import fs        from "node:fs/promises";
import path      from "node:path";

import type { GameProfile, LaunchEntry, Note, NotesFileData, ProfilesFileData, UsageData } from "./types";
import { isNonEmptyString, isRecord } from "./utils";



export function getDataDirectoryPath(): string
{
    return path.join(app.getPath("userData"), "data");
}



function getProfilesFilePath(): string
{
    return path.join(getDataDirectoryPath(), "profiles.json");
}



function getNotesFilePath(): string
{
    return path.join(getDataDirectoryPath(), "notes.json");
}



function getUsageFilePath(): string
{
    return path.join(getDataDirectoryPath(), "usage.json");
}



async function readJson(filePath: string): Promise<unknown>
{
    try
    {
        return JSON.parse(await fs.readFile(filePath, "utf-8"));
    }
    catch
    {
        return null;
    }
}



const writeQueues = new Map<string, Promise<void>>();



function writeJsonAtomic(filePath: string, data: unknown): Promise<void>
{
    const previous = writeQueues.get(filePath) ?? Promise.resolve();

    const next = previous.then(async () =>
    {
        const tempPath = `${filePath}.tmp`;

        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
        await fs.rename(tempPath, filePath);
    });

    writeQueues.set(filePath, next.catch(() => undefined));

    return next;
}



function toGameProfile(value: unknown): GameProfile | null
{
    if (!isRecord(value) || !isNonEmptyString(value.name))
    {
        return null;
    }

    const gameId = typeof value.gameId === "string" ? value.gameId : value.gameId === null ? null : undefined;

    return { name: value.name.trim(), gameId };
}



function toLaunchEntry(value: unknown): LaunchEntry | null
{
    if (!isRecord(value))
    {
        return null;
    }

    const validInputMode = value.inputMode === "text" || value.inputMode === "voice";
    const validMod       = value.mod === "game" || value.mod === "dev" || value.mod === "life";

    if (typeof value.launchedAt !== "string" || !validInputMode || !validMod)
    {
        return null;
    }

    return {
        launchedAt: value.launchedAt,
        inputMode:  value.inputMode as LaunchEntry["inputMode"],
        mod:        value.mod       as LaunchEntry["mod"],
        gameName:   typeof value.gameName === "string" ? value.gameName : null
    };
}



function toNote(value: unknown): Note | null
{
    if (!isRecord(value) || !isNonEmptyString(value.id))
    {
        return null;
    }

    const now = new Date().toISOString();

    return {
        id:        value.id,
        title:     typeof value.title   === "string" ? value.title   : "",
        content:   typeof value.content === "string" ? value.content : "",
        createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now
    };
}



function compact<T>(items: (T | null)[]): T[]
{
    return items.filter((item): item is T => item !== null);
}



export async function readProfilesFile(): Promise<ProfilesFileData>
{
    const parsed = await readJson(getProfilesFilePath());

    if (!isRecord(parsed))
    {
        return { profiles: [], launchHistory: [] };
    }

    const profiles = Array.isArray(parsed.profiles)
        ? compact(parsed.profiles.map(toGameProfile))
        : [];

    const launchHistory = Array.isArray(parsed.launchHistory)
        ? compact(parsed.launchHistory.map(toLaunchEntry))
        : [];

    return { profiles, launchHistory };
}



export function writeProfilesFile(data: ProfilesFileData): Promise<void>
{
    return writeJsonAtomic(getProfilesFilePath(), data);
}



export async function readUsageFile(): Promise<UsageData>
{
    const parsed = await readJson(getUsageFilePath());

    if (!isRecord(parsed))
    {
        return { webRequests: 0, launchCount: 0 };
    }

    return {
        webRequests: typeof parsed.webRequests === "number" ? parsed.webRequests : 0,
        launchCount: typeof parsed.launchCount === "number" ? parsed.launchCount : 0
    };
}



export function writeUsageFile(data: UsageData): Promise<void>
{
    return writeJsonAtomic(getUsageFilePath(), data);
}



export async function readNotesFile(): Promise<NotesFileData>
{
    const parsed = await readJson(getNotesFilePath());

    if (!isRecord(parsed) || !isRecord(parsed.notesByProfile))
    {
        return { notesByProfile: {} };
    }

    const notesByProfile: Record<string, Note[]> = {};

    for (const [profileName, notes] of Object.entries(parsed.notesByProfile))
    {
        notesByProfile[profileName] = Array.isArray(notes) ? compact(notes.map(toNote)) : [];
    }

    return { notesByProfile };
}



export function writeNotesFile(data: NotesFileData): Promise<void>
{
    return writeJsonAtomic(getNotesFilePath(), data);
}



export async function migrateLegacyProfiles(): Promise<void>
{
    const current = await readJson(getProfilesFilePath());

    if (current !== null)
    {
        return;
    }

    const legacy = await readJson(path.join(app.getAppPath(), "data", "game-profiles.json"));

    if (!isRecord(legacy) || !Array.isArray(legacy.profiles))
    {
        return;
    }

    const profiles = compact(legacy.profiles.map(toGameProfile));

    if (profiles.length > 0)
    {
        await writeProfilesFile({ profiles, launchHistory: [] });
    }
}
