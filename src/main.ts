import { app, globalShortcut, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { GAME_MODULES } from "./modules";
import
{
    migrateLegacyProfiles,
    readLegacyPresetKeys,
    readNotesFile,
    readPresetsFile,
    readProfilesFile,
    readShortcutsFile,
    readUsageFile,
    writeNotesFile,
    writePresetsFile,
    writeProfilesFile,
    writeShortcutsFile,
    writeUsageFile
} from "./store";
import { linkLegacyProfiles } from "./profiles";
import { parsePresetName, toOverlayCard, upsertPreset } from "./presets";
import
{
    PANEL_OPTIONS,
    SHORTCUT_KEYS,
    actionToValue,
    bindingsFromLegacyKeys,
    parseActionValue,
    setBinding
} from "./shortcuts";
import { loadGames } from "./tasks/loader";
import type { LoadResult } from "./tasks/types";
import { createItemCatalog, resolveParameterValues } from "./tasks/values";
import { getTaskImplementation } from "./games/registry";
import type
{
    Binding,
    LaunchEntry,
    LaunchPayload,
    Note,
    NoteChanges,
    OverlayCard,
    PinnedNoteView,
    Preset,
    ShortcutAction,
    ShortcutOption,
    UsageData
} from "./types";
import { createLock, isNonEmptyString, isRecord } from "./utils";
import
{
    createLauncherWindow,
    closePanelOf,
    ensureOverlayLayer,
    getLauncherWindow,
    getOpenPanels,
    hidePanel,
    hideTopPanel,
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

let lastOverlayCard:        OverlayCard | null = null;
let registeredShortcutKeys: number[]           = [];

const lastScenarioByTask = new Map<string, string>();



// ---------------------------------------------------------------------------
// Notes : accès et verrou
// ---------------------------------------------------------------------------

const withNotesLock   = createLock();
const withPresetsLock = createLock();
const withShortcutsLock = createLock();



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

    showOverlayCard(null);

    await refreshShortcuts();
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

    void refreshShortcuts();
}



function closeInterface(): void
{
    hidePanel();
    setDockVisible(false);

    globalShortcut.unregister(CLOSE_SHORTCUT);

    unregisterShortcuts();
}



function handleEscape(): void
{
    if (isPanelVisible())
    {
        hideTopPanel();
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
// Préréglages et pavé numérique
// ---------------------------------------------------------------------------

async function getCurrentPresets(): Promise<Preset[]>
{
    if (!currentGameId)
    {
        return [];
    }

    const data = await readPresetsFile();

    return data.presetsByGame[currentGameId] ?? [];
}



async function getCurrentBindings(): Promise<Binding[]>
{
    if (!currentProfileName)
    {
        return [];
    }

    const data = await readShortcutsFile();

    return data.bindingsByProfile[currentProfileName] ?? [];
}



function showOverlayCard(card: OverlayCard | null): void
{
    lastOverlayCard = card;

    sendToOverlay("overlay:taskReport", card);
}



function showMessageCard(title: string, headline: string): void
{
    showOverlayCard({ title, headline, stats: [], notes: [] });
}



async function runPreset(preset: Preset): Promise<void>
{
    const game = getCurrentGame();
    const task = game?.tasks.find((candidate) => candidate.id === preset.taskId);

    if (!game || !task)
    {
        showMessageCard(preset.name, "Tâche introuvable pour ce jeu.");
        return;
    }

    const resolved = resolveParameterValues(task, preset.values, createItemCatalog(game.items));

    if (!resolved.ok)
    {
        showOverlayCard({
            title:    preset.name,
            headline: "Préréglage invalide",
            stats:    [],
            notes:    resolved.errors.map((error) => ({ level: "warning" as const, message: error.message }))
        });
        return;
    }

    const implementation = getTaskImplementation(game.id, task.id);

    if (!implementation)
    {
        showMessageCard(preset.name, "Aucune simulation disponible pour cette tâche.");
        return;
    }

    const scenarioId = lastScenarioByTask.get(`${game.id}/${task.id}`) ?? "";
    const report     = implementation.simulate(resolved.values, scenarioId, game.items);

    showOverlayCard(toOverlayCard(`${preset.name} · simulation`, report));
}



async function togglePinnedNote(noteId: string): Promise<boolean>
{
    const notes = await getCurrentNotes();

    if (!notes.some((note: Note) => note.id === noteId))
    {
        return false;
    }

    pinnedNoteIds = pinnedNoteIds.includes(noteId)
        ? pinnedNoteIds.filter((id: string) => id !== noteId)
        : [...pinnedNoteIds, noteId];

    await pushPinnedNotes();

    return true;
}



async function actionExists(action: ShortcutAction): Promise<boolean>
{
    if (action.type === "panel")
    {
        return true;
    }

    if (action.type === "note")
    {
        const notes = await getCurrentNotes();

        return notes.some((note: Note) => note.id === action.noteId);
    }

    const presets = await getCurrentPresets();

    return presets.some((preset: Preset) => preset.id === action.presetId);
}



async function executeAction(action: ShortcutAction): Promise<void>
{
    if (action.type === "panel")
    {
        togglePanel(action.panelId);
        return;
    }

    if (action.type === "note")
    {
        if (!(await togglePinnedNote(action.noteId)))
        {
            showMessageCard("Raccourci", "Note introuvable.");
        }

        return;
    }

    const presets = await getCurrentPresets();
    const preset  = presets.find((candidate: Preset) => candidate.id === action.presetId);

    if (preset)
    {
        await runPreset(preset);
    }
    else
    {
        showMessageCard("Raccourci", "Préréglage introuvable.");
    }
}



async function runShortcut(key: number): Promise<void>
{
    const bindings = await getCurrentBindings();
    const binding  = bindings.find((candidate: Binding) => candidate.key === key);

    if (binding)
    {
        await executeAction(binding.action);
    }
}



function unregisterShortcuts(): void
{
    for (const key of registeredShortcutKeys)
    {
        globalShortcut.unregister(`num${key}`);
    }

    registeredShortcutKeys = [];
}



async function refreshShortcuts(): Promise<void>
{
    unregisterShortcuts();

    if (!isDockVisible())
    {
        return;
    }

    const bindings = await getCurrentBindings();

    if (!isDockVisible())
    {
        return;
    }

    unregisterShortcuts();

    for (const binding of bindings)
    {
        if (globalShortcut.register(`num${binding.key}`, () => void runShortcut(binding.key)))
        {
            registeredShortcutKeys.push(binding.key);
        }
    }

    if (globalShortcut.register("num0", () => showOverlayCard(null)))
    {
        registeredShortcutKeys.push(0);
    }
}



async function purgeBindings(shouldRemove: (profileName: string, binding: Binding) => boolean): Promise<void>
{
    await withShortcutsLock(async () =>
    {
        const data = await readShortcutsFile();

        let changed = false;

        for (const [profileName, bindings] of Object.entries(data.bindingsByProfile))
        {
            const kept = bindings.filter((binding: Binding) => !shouldRemove(profileName, binding));

            if (kept.length === bindings.length)
            {
                continue;
            }

            changed = true;

            if (kept.length === 0)
            {
                delete data.bindingsByProfile[profileName];
            }
            else
            {
                data.bindingsByProfile[profileName] = kept;
            }
        }

        if (changed)
        {
            await writeShortcutsFile(data);
        }
    });

    await refreshShortcuts();
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

    await purgeBindings((profileName) => profileName === gameName);

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



ipcMain.handle("panel:close", (event) =>
{
    closePanelOf(event.sender);

    return { ok: true };
});



ipcMain.handle("dock:getOpenPanels", () =>
{
    return getOpenPanels();
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

    const profileOfNote = currentProfileName;

    await purgeBindings((profileName, binding) =>
    {
        return profileName === profileOfNote && binding.action.type === "note" && binding.action.noteId === noteId;
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



ipcMain.handle("overlay:getTaskReport", () =>
{
    return lastOverlayCard;
});



ipcMain.handle("presets:list", async () =>
{
    return { presets: await getCurrentPresets() };
});



ipcMain.handle("presets:save", async (_event, taskId: unknown, name: unknown, values: unknown) =>
{
    const game = getCurrentGame();
    const task = game?.tasks.find((candidate) => candidate.id === taskId);

    if (!game || !task)
    {
        return { ok: false, errors: [{ parameterId: null, message: "Tâche inconnue pour ce profil." }] };
    }

    const parsedName = parsePresetName(name);
    const resolved   = resolveParameterValues(task, values, createItemCatalog(game.items));

    if (!parsedName.ok || !resolved.ok)
    {
        return { ok: false, errors: [...(parsedName.ok ? [] : parsedName.errors), ...(resolved.ok ? [] : resolved.errors)] };
    }

    const result = await withPresetsLock(async () =>
    {
        const data    = await readPresetsFile();
        const updated = upsertPreset(
            data.presetsByGame[game.id] ?? [],
            { taskId: task.id, name: parsedName.name, values: resolved.values },
            () => `preset_${randomUUID()}`
        );

        data.presetsByGame[game.id] = updated.presets;

        await writePresetsFile(data);

        return updated;
    });

    return { ok: true, presets: result.presets, created: result.created };
});



ipcMain.handle("presets:delete", async (_event, presetId: unknown) =>
{
    if (!isNonEmptyString(presetId) || !currentGameId)
    {
        return { ok: false };
    }

    const gameId = currentGameId;

    const presets = await withPresetsLock(async () =>
    {
        const data = await readPresetsFile();
        const next = (data.presetsByGame[gameId] ?? []).filter((preset) => preset.id !== presetId);

        data.presetsByGame[gameId] = next;

        await writePresetsFile(data);

        return next;
    });

    await purgeBindings((_profileName, binding) => binding.action.type === "preset" && binding.action.presetId === presetId);

    return { ok: true, presets };
});



ipcMain.handle("shortcuts:context", async () =>
{
    const game     = getCurrentGame();
    const presets  = await getCurrentPresets();
    const notes    = await getCurrentNotes();
    const bindings = await getCurrentBindings();
    const taskName = new Map((game ? game.tasks : []).map((task) => [task.id, task.name]));

    const options: ShortcutOption[] =
    [
        ...presets.map((preset: Preset) => ({
            value: actionToValue({ type: "preset", presetId: preset.id }),
            label: `Lancer : ${taskName.get(preset.taskId) ?? preset.taskId} · ${preset.name}`
        })),
        ...notes.map((note: Note) => ({
            value: actionToValue({ type: "note", noteId: note.id }),
            label: `Épingler / désépingler : ${note.title.trim() || "Sans titre"}`
        })),
        ...PANEL_OPTIONS
    ];

    const slots = SHORTCUT_KEYS.map((key: number) =>
    {
        const binding = bindings.find((candidate: Binding) => candidate.key === key);

        return { key, value: binding ? actionToValue(binding.action) : "" };
    });

    return {
        profileName: currentProfileName,
        game:        game ? { id: game.id, name: game.name } : null,
        slots,
        options
    };
});



ipcMain.handle("shortcuts:set", async (_event, key: unknown, value: unknown) =>
{
    if (!currentProfileName)
    {
        return { ok: false, message: "Aucun profil actif." };
    }

    if (typeof key !== "number" || !SHORTCUT_KEYS.includes(key))
    {
        return { ok: false, message: "Touche invalide (pavé numérique 1 à 9)." };
    }

    const profileName = currentProfileName;

    let action: ShortcutAction | null = null;

    if (value !== "")
    {
        action = parseActionValue(value);

        if (!action)
        {
            return { ok: false, message: "Action inconnue." };
        }

        if (!(await actionExists(action)))
        {
            return { ok: false, message: "Cette action n'existe plus." };
        }
    }

    await withShortcutsLock(async () =>
    {
        const data = await readShortcutsFile();

        data.bindingsByProfile[profileName] = setBinding(data.bindingsByProfile[profileName] ?? [], key, action);

        await writeShortcutsFile(data);
    });

    await refreshShortcuts();

    return { ok: true };
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
        items:       game ? game.items : [],
        simulations: Object.fromEntries((game ? game.tasks : []).map((task) =>
        {
            return [task.id, getTaskImplementation(game!.id, task.id)?.scenarios ?? []];
        }))
    };
});



ipcMain.handle("tasks:simulate", (_event, taskId: unknown, values: unknown, scenarioId: unknown) =>
{
    const game = getCurrentGame();
    const task = game?.tasks.find((candidate) => candidate.id === taskId);

    if (!game || !task)
    {
        return { ok: false, errors: [{ parameterId: null, message: "Tâche inconnue pour ce profil." }] };
    }

    const resolved = resolveParameterValues(task, values, createItemCatalog(game.items));

    if (!resolved.ok)
    {
        return resolved;
    }

    if (typeof scenarioId === "string" && scenarioId !== "")
    {
        lastScenarioByTask.set(`${game.id}/${task.id}`, scenarioId);
    }

    const implementation = getTaskImplementation(game.id, task.id);

    const report = implementation
        ? implementation.simulate(resolved.values, typeof scenarioId === "string" ? scenarioId : "", game.items)
        : null;

    return { ok: true, values: resolved.values, report };
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

        const legacyKeys = await readLegacyPresetKeys();

        if (legacyKeys.length > 0)
        {
            const profiles  = (await readProfilesFile()).profiles;
            const shortcuts = await readShortcutsFile();

            shortcuts.bindingsByProfile = bindingsFromLegacyKeys(legacyKeys, profiles, shortcuts.bindingsByProfile);

            await writeShortcutsFile(shortcuts);
            await writePresetsFile(await readPresetsFile());
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
