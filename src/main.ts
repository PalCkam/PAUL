import { app, globalShortcut, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { GAME_MODULES } from "./modules";
import
{
    migrateLegacyProfiles,
    readNotesFile,
    readProfilesFile,
    readUsageFile,
    writeNotesFile,
    writeProfilesFile,
    writeUsageFile
} from "./store";
import { linkLegacyProfiles } from "./profiles";
import { loadGames } from "./tasks/loader";
import type { LoadResult } from "./tasks/types";
import { createItemCatalog, resolveParameterValues } from "./tasks/values";
import type { LaunchEntry, LaunchPayload, Note, NoteChanges, PinnedNoteView, UsageData } from "./types";
import { isNonEmptyString, isRecord } from "./utils";
import
{
    createLauncherWindow,
    ensureOverlayLayer,
    getLauncherWindow,
    hidePanel,
    isDockVisible,
    isPanelVisible,
    minimizeLauncher,
    sendToOverlay,
    setDockVisible,
    togglePanel
} from "./windows";
import type { PanelId } from "./windows";



const TOGGLE_SHORTCUT = "F4";
const CLOSE_SHORTCUT  = "Escape";



let currentProfileName: string | null = null;
let currentGameId:      string | null = null;
let pinnedNoteIds:      string[]      = [];
let hasLaunched                       = false;
let loadedGames:        LoadResult    = { games: [], errors: [] };



// ---------------------------------------------------------------------------
// Notes : accès et verrou
// ---------------------------------------------------------------------------

let notesLock: Promise<unknown> = Promise.resolve();



function withNotesLock<T>(task: () => Promise<T>): Promise<T>
{
    const run = notesLock.then(task);

    notesLock = run.catch(() => undefined);

    return run;
}



async function getCurrentNotes(): Promise<Note[]>
{
    if (!currentProfileName)
    {
        return [];
    }

    const data = await readNotesFile();

    return data.notesByProfile[currentProfileName] ?? [];
}



async function getPinnedNotesView(): Promise<PinnedNoteView[]>
{
    const notes = await getCurrentNotes();

    return pinnedNoteIds
        .map((id: string) => notes.find((note: Note) => note.id === id))
        .filter((note): note is Note => note !== undefined)
        .map((note: Note) =>
        {
            return { id: note.id, title: note.title, content: note.content };
        });
}



async function pushPinnedNotes(): Promise<void>
{
    sendToOverlay("overlay:pinnedNotes", await getPinnedNotesView());
}



async function setCurrentProfile(profileName: string | null): Promise<void>
{
    if (profileName === currentProfileName)
    {
        return;
    }

    currentProfileName = profileName;
    currentGameId      = null;

    if (profileName)
    {
        const data = await readProfilesFile();

        currentGameId = data.profiles.find((profile) => profile.name === profileName)?.gameId ?? null;
    }

    pinnedNoteIds = [];

    await pushPinnedNotes();
}



function updateCurrentNotes(update: (notes: Note[]) => Note[]): Promise<boolean>
{
    return withNotesLock(async () =>
    {
        if (!currentProfileName)
        {
            return false;
        }

        const data = await readNotesFile();
        const notes = data.notesByProfile[currentProfileName] ?? [];

        data.notesByProfile[currentProfileName] = update(notes);

        await writeNotesFile(data);

        return true;
    });
}



function isNoteChanges(value: unknown): value is NoteChanges
{
    return isRecord(value) && typeof value.title === "string" && typeof value.content === "string";
}



function isLaunchPayload(value: unknown): value is LaunchPayload
{
    if (!isRecord(value))
    {
        return false;
    }

    const validInputMode = value.inputMode === "text" || value.inputMode === "voice";
    const validMod       = value.mod === "game" || value.mod === "dev" || value.mod === "life";
    const validGameName  = value.gameName === undefined || typeof value.gameName === "string";

    return validInputMode && validMod && validGameName;
}



// ---------------------------------------------------------------------------
// Interface en jeu (F4)
// ---------------------------------------------------------------------------

function openInterface(): void
{
    setDockVisible(true);

    globalShortcut.register(CLOSE_SHORTCUT, handleEscape);
}



function closeInterface(): void
{
    hidePanel();
    setDockVisible(false);

    globalShortcut.unregister(CLOSE_SHORTCUT);
}



function handleEscape(): void
{
    if (isPanelVisible())
    {
        hidePanel();
        return;
    }

    closeInterface();
}



function toggleInterface(): void
{
    if (!hasLaunched)
    {
        return;
    }

    if (isDockVisible())
    {
        closeInterface();
    }
    else
    {
        openInterface();
    }
}



// ---------------------------------------------------------------------------
// IPC : lancement, profils, historique, quota
// ---------------------------------------------------------------------------

ipcMain.handle("paul:launch", async (_event, payload: unknown) =>
{
    if (!isLaunchPayload(payload))
    {
        return { ok: false, message: "Requête de lancement invalide." };
    }

    if (payload.mod !== "game")
    {
        return { ok: false, message: "Ce mode n'est pas encore disponible." };
    }

    const data     = await readProfilesFile();
    const gameName = payload.gameName?.trim();
    const profile  = data.profiles.find((candidate) => candidate.name === gameName);

    if (!profile)
    {
        return { ok: false, message: "Sélectionne un profil de jeu valide." };
    }

    await setCurrentProfile(profile.name);

    const launchEntry: LaunchEntry =
    {
        launchedAt: new Date().toISOString(),
        inputMode:  payload.inputMode,
        mod:        payload.mod,
        gameName:   profile.name
    };

    const nextHistory = [launchEntry, ...data.launchHistory].slice(0, 10);

    await writeProfilesFile({ profiles: data.profiles, launchHistory: nextHistory });

    const usage = await readUsageFile();

    const nextUsage: UsageData =
    {
        webRequests: usage.webRequests,
        launchCount: usage.launchCount + 1
    };

    await writeUsageFile(nextUsage);

    ensureOverlayLayer(GAME_MODULES.length);

    hasLaunched = true;

    minimizeLauncher();

    return {
        ok:            true,
        launchEntry,
        launchHistory: nextHistory,
        usage:         nextUsage
    };
});



ipcMain.handle("history:list", async () =>
{
    const data = await readProfilesFile();

    return { ok: true, history: data.launchHistory };
});



ipcMain.handle("history:clear", async () =>
{
    const data = await readProfilesFile();

    await writeProfilesFile({ profiles: data.profiles, launchHistory: [] });

    return { ok: true };
});



ipcMain.handle("profiles:list", async () =>
{
    const data = await readProfilesFile();

    return data.profiles;
});



ipcMain.handle("games:list", () =>
{
    return loadedGames.games.map((game) =>
    {
        return { id: game.id, name: game.name };
    });
});



ipcMain.handle("profiles:create", async (_event, gameName: unknown, gameId: unknown) =>
{
    if (!isNonEmptyString(gameName))
    {
        return { ok: false, message: "Nom de profil invalide." };
    }

    const knownGame = typeof gameId === "string" && loadedGames.games.some((game) => game.id === gameId);

    if (gameId !== null && !knownGame)
    {
        return { ok: false, message: "Jeu inconnu." };
    }

    const cleanName = gameName.trim();
    const data      = await readProfilesFile();

    const exists = data.profiles.some((profile) =>
    {
        return profile.name.toLowerCase() === cleanName.toLowerCase();
    });

    if (exists)
    {
        return { ok: false, message: "Ce profil existe déjà." };
    }

    const nextProfiles = [{ name: cleanName, gameId: gameId as string | null }, ...data.profiles];

    await writeProfilesFile({ profiles: nextProfiles, launchHistory: data.launchHistory });

    return { ok: true, profiles: nextProfiles };
});



ipcMain.handle("profiles:delete", async (_event, gameName: unknown) =>
{
    if (!isNonEmptyString(gameName))
    {
        return { ok: false };
    }

    const data         = await readProfilesFile();
    const nextProfiles = data.profiles.filter((profile) => profile.name !== gameName);

    await writeProfilesFile({ profiles: nextProfiles, launchHistory: data.launchHistory });

    await withNotesLock(async () =>
    {
        const notesData = await readNotesFile();

        delete notesData.notesByProfile[gameName];

        await writeNotesFile(notesData);
    });

    if (currentProfileName === gameName)
    {
        await setCurrentProfile(null);
    }

    return { ok: true, profiles: nextProfiles };
});



ipcMain.handle("profiles:select", async (_event, gameName: unknown) =>
{
    if (!isNonEmptyString(gameName))
    {
        return { ok: false };
    }

    const data   = await readProfilesFile();
    const exists = data.profiles.some((profile) => profile.name === gameName);

    if (!exists)
    {
        return { ok: false };
    }

    await setCurrentProfile(gameName);

    return { ok: true };
});



ipcMain.handle("usage:get", async () =>
{
    const usage = await readUsageFile();

    return { ok: true, usage };
});



// ---------------------------------------------------------------------------
// IPC : barre de modules et panneau
// ---------------------------------------------------------------------------

ipcMain.handle("dock:getModules", () =>
{
    return GAME_MODULES;
});



ipcMain.handle("dock:openModule", (_event, moduleId: unknown) =>
{
    const known = GAME_MODULES.some((module) => module.id === moduleId);

    if (!known)
    {
        return { ok: false };
    }

    togglePanel(moduleId as PanelId);

    return { ok: true };
});



ipcMain.handle("panel:close", () =>
{
    hidePanel();

    return { ok: true };
});



// ---------------------------------------------------------------------------
// IPC : notes
// ---------------------------------------------------------------------------

ipcMain.handle("notes:list", async () =>
{
    const notes = await getCurrentNotes();

    return {
        profileName: currentProfileName,
        notes:       notes.map((note: Note) =>
        {
            return { ...note, pinned: pinnedNoteIds.includes(note.id) };
        })
    };
});



ipcMain.handle("notes:create", async () =>
{
    const now = new Date().toISOString();

    const newNote: Note =
    {
        id:        `note_${randomUUID()}`,
        title:     "Nouvelle note",
        content:   "",
        createdAt: now,
        updatedAt: now
    };

    const saved = await updateCurrentNotes((notes: Note[]) => [...notes, newNote]);

    if (!saved)
    {
        return { ok: false, message: "Aucun profil de jeu actif." };
    }

    return { ok: true, note: newNote };
});



ipcMain.handle("notes:save", async (_event, noteId: unknown, changes: unknown) =>
{
    if (!isNonEmptyString(noteId) || !isNoteChanges(changes))
    {
        return { ok: false, message: "Requête invalide." };
    }

    let found = false;

    await updateCurrentNotes((notes: Note[]) =>
    {
        return notes.map((note: Note) =>
        {
            if (note.id !== noteId)
            {
                return note;
            }

            found = true;

            return { ...note, title: changes.title, content: changes.content, updatedAt: new Date().toISOString() };
        });
    });

    if (!found)
    {
        return { ok: false, message: "Note introuvable." };
    }

    if (pinnedNoteIds.includes(noteId))
    {
        await pushPinnedNotes();
    }

    return { ok: true };
});



ipcMain.handle("notes:delete", async (_event, noteId: unknown) =>
{
    if (!isNonEmptyString(noteId))
    {
        return { ok: false, message: "Requête invalide." };
    }

    await updateCurrentNotes((notes: Note[]) =>
    {
        return notes.filter((note: Note) => note.id !== noteId);
    });

    if (pinnedNoteIds.includes(noteId))
    {
        pinnedNoteIds = pinnedNoteIds.filter((id: string) => id !== noteId);

        await pushPinnedNotes();
    }

    return { ok: true };
});



ipcMain.handle("notes:pin", async (_event, noteId: unknown) =>
{
    if (!isNonEmptyString(noteId))
    {
        return { ok: false, message: "Requête invalide." };
    }

    const notes = await getCurrentNotes();

    if (!notes.some((note: Note) => note.id === noteId))
    {
        return { ok: false, message: "Note introuvable." };
    }

    if (!pinnedNoteIds.includes(noteId))
    {
        pinnedNoteIds = [...pinnedNoteIds, noteId];
    }

    await pushPinnedNotes();

    return { ok: true };
});



ipcMain.handle("notes:unpin", async (_event, noteId: unknown) =>
{
    if (!isNonEmptyString(noteId))
    {
        return { ok: false, message: "Requête invalide." };
    }

    pinnedNoteIds = pinnedNoteIds.filter((id: string) => id !== noteId);

    await pushPinnedNotes();

    return { ok: true };
});



ipcMain.handle("overlay:getPinnedNotes", () =>
{
    return getPinnedNotesView();
});



function getCurrentGame()
{
    return loadedGames.games.find((game) => game.id === currentGameId);
}



ipcMain.handle("tasks:current", () =>
{
    const game = getCurrentGame();

    return {
        profileName: currentProfileName,
        game:        game ? { id: game.id, name: game.name } : null,
        tasks:       game ? game.tasks : [],
        items:       game ? game.items : []
    };
});



ipcMain.handle("tasks:validate", (_event, taskId: unknown, values: unknown) =>
{
    const game = getCurrentGame();
    const task = game?.tasks.find((candidate) => candidate.id === taskId);

    if (!game || !task)
    {
        return { ok: false, errors: [{ parameterId: null, message: "Tâche inconnue pour ce profil." }] };
    }

    return resolveParameterValues(task, values, createItemCatalog(game.items));
});



// ---------------------------------------------------------------------------
// Cycle de vie
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock())
{
    app.quit();
}
else
{
    app.on("second-instance", () =>
    {
        const launcher = getLauncherWindow();

        if (launcher)
        {
            if (launcher.isMinimized())
            {
                launcher.restore();
            }

            launcher.focus();
        }
    });

    app.whenReady().then(async () =>
    {
        await migrateLegacyProfiles();

        loadedGames = await loadGames(path.join(__dirname, "..", "games"));

        for (const error of loadedGames.errors)
        {
            console.warn(`[tâches] ${error}`);
        }

        const stored = await readProfilesFile();

        if (stored.profiles.some((profile) => profile.gameId === undefined))
        {
            const games = loadedGames.games.map((game) => ({ id: game.id, name: game.name }));

            await writeProfilesFile({
                profiles:      linkLegacyProfiles(stored.profiles, games),
                launchHistory: stored.launchHistory
            });
        }

        createLauncherWindow(() =>
        {
            app.quit();
        });

        const registered = globalShortcut.register(TOGGLE_SHORTCUT, toggleInterface);

        if (!registered)
        {
            console.warn(`Raccourci ${TOGGLE_SHORTCUT} indisponible (déjà utilisé par une autre application).`);
        }
    });

    app.on("will-quit", () =>
    {
        globalShortcut.unregisterAll();
    });
}
