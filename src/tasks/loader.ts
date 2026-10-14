import fs   from "node:fs/promises";
import path from "node:path";

import { findMissingCapabilities, parseGameManifest, parseTaskDefinition } from "./schema";
import type { GameDefinition, GameManifest, LoadResult, TaskDefinition } from "./types";



async function readJsonFile(filePath: string, displayPath: string, errors: string[]): Promise<unknown>
{
    let text: string;

    try
    {
        text = await fs.readFile(filePath, "utf-8");
    }
    catch
    {
        errors.push(`${displayPath} : fichier illisible.`);
        return null;
    }

    try
    {
        return JSON.parse(text);
    }
    catch
    {
        errors.push(`${displayPath} : JSON invalide.`);
        return null;
    }
}



async function listJsonFiles(directory: string): Promise<string[]>
{
    try
    {
        const entries = await fs.readdir(directory, { withFileTypes: true });

        return entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
            .map((entry) => entry.name)
            .sort();
    }
    catch
    {
        return [];
    }
}



async function loadTask(
    gamesDirectory: string,
    folderName:     string,
    fileName:       string,
    manifest:       GameManifest,
    errors:         string[]
): Promise<TaskDefinition | null>
{
    const displayPath = `${folderName}/tasks/${fileName}`;
    const raw         = await readJsonFile(path.join(gamesDirectory, folderName, "tasks", fileName), displayPath, errors);

    if (raw === null)
    {
        return null;
    }

    const parsed = parseTaskDefinition(raw);

    if (!parsed.value)
    {
        errors.push(...parsed.errors.map((message: string) => `${displayPath} : ${message}`));
        return null;
    }

    const missing = findMissingCapabilities(parsed.value, manifest);

    if (missing.length > 0)
    {
        errors.push(`${displayPath} : capacité(s) inconnue(s) pour ${manifest.name} : ${missing.join(", ")}.`);
        return null;
    }

    return parsed.value;
}



async function loadGame(gamesDirectory: string, folderName: string, errors: string[]): Promise<GameDefinition | null>
{
    const displayPath = `${folderName}/game.json`;
    const raw         = await readJsonFile(path.join(gamesDirectory, folderName, "game.json"), displayPath, errors);

    if (raw === null)
    {
        return null;
    }

    const parsed = parseGameManifest(raw);

    if (!parsed.value)
    {
        errors.push(...parsed.errors.map((message: string) => `${displayPath} : ${message}`));
        return null;
    }

    if (parsed.value.id !== folderName)
    {
        errors.push(`${displayPath} : "id" (${parsed.value.id}) doit être identique au nom du dossier (${folderName}).`);
        return null;
    }

    const tasks: TaskDefinition[] = [];
    const files                   = await listJsonFiles(path.join(gamesDirectory, folderName, "tasks"));

    for (const fileName of files)
    {
        const task = await loadTask(gamesDirectory, folderName, fileName, parsed.value, errors);

        if (!task)
        {
            continue;
        }

        if (tasks.some((existing: TaskDefinition) => existing.id === task.id))
        {
            errors.push(`${folderName}/tasks/${fileName} : tâche "${task.id}" déjà définie dans un autre fichier.`);
            continue;
        }

        tasks.push(task);
    }

    return { ...parsed.value, tasks };
}



export async function loadGames(gamesDirectory: string): Promise<LoadResult>
{
    const errors: string[] = [];

    let folderNames: string[];

    try
    {
        const entries = await fs.readdir(gamesDirectory, { withFileTypes: true });

        folderNames = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
    }
    catch
    {
        return { games: [], errors: [`Dossier des jeux introuvable : ${gamesDirectory}`] };
    }

    const games: GameDefinition[] = [];

    for (const folderName of folderNames)
    {
        const game = await loadGame(gamesDirectory, folderName, errors);

        if (game)
        {
            games.push(game);
        }
    }

    return { games, errors };
}
