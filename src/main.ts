import { app, BrowserWindow, ipcMain, globalShortcut, screen } from "electron";
import fs   from "node:fs/promises";
import path from "node:path";



const dataDir                 = path.join(__dirname, "..", "data");
const gameProfilesPath        = path.join(dataDir, "game-profiles.json");
const gameProfilesNotesPath   = path.join(dataDir, "game-profiles-notes.json");



type LaunchPayload =
{
    inputMode: "text" | "voice";
    mod:       "game" | "dev" | "life";
    gameName?: string;
};



type GameProfile =
{
    name:       string;
    folderName: string;
    folderPath: string;
};



type LaunchEntry =
{
    launchedAt: string;
    inputMode:  "text" | "voice";
    mod:        "game" | "dev" | "life";
    gameName:   string | null;
};



type ProfilesFileData =
{
    profiles:      GameProfile[];
    launchHistory: LaunchEntry[];
};



type UsageData =
{
    webRequests: number;
    launchCount: number;
};



type Note =
{
    id:        string;
    title:     string;
    content:   string;
    tags?:     string[];
    priority?: "low" | "medium" | "high";
    active:    boolean;
    createdAt?: string;
    updatedAt?: string;
};



type NoteSet =
{
    id:     string;
    name:   string;
    active: boolean;
    notes:  Note[];
};



type GameProfileNotes =
{
    id:             string;
    steamProfileId: string | null;
    gameName:       string;
    displayName:    string;
    noteSets:       NoteSet[];
};



type GameProfilesData =
{
    profiles: GameProfileNotes[];
};



let mainWindow:       BrowserWindow | null = null;
let overlayWindow:    BrowserWindow | null = null;
let menuWindow:       BrowserWindow | null = null;
let notesPanelWindow: BrowserWindow | null = null;



let currentOverlayProfileName = "";
let currentOverlayNotes       = "";



let gameProfiles:        GameProfilesData = { profiles: [] };
let currentGameProfileId: string | null   = null;
let currentNoteSetId:     string | null   = null;
let currentPinnedNote: { title: string; content: string } | null = null;




async function loadGameProfiles(): Promise<void>
{
    try
    {
        // Charger les profils simples
        const rawProfiles    = await fs.readFile(gameProfilesPath, "utf-8");
        const parsedProfiles = JSON.parse(rawProfiles);

        // Charger les notes sauvegardées (si le fichier existe)
        let savedNotes: GameProfilesData = { profiles: [] };

        try
        {
            const rawNotes = await fs.readFile(gameProfilesNotesPath, "utf-8");
            savedNotes = JSON.parse(rawNotes);
        }
        catch
        {
            // Fichier inexistant, on part de zéro
        }

        // Convertir les GameProfile en GameProfileNotes avec les notes sauvegardées
        gameProfiles = {
            profiles: (parsedProfiles.profiles || []).map((p: GameProfile) =>
            {
                // Chercher si des notes existent déjà pour ce profil
                const savedProfile = savedNotes.profiles.find((sp) => sp.gameName === p.name);

                const defaultNoteSet: NoteSet = {
                    id:     `noteset_${p.name}_default`,
                    name:   "Notes par défaut",
                    active: true,
                    notes:  savedProfile?.noteSets?.[0]?.notes || []
                };

                return {
                    id:             p.name,
                    steamProfileId: null,
                    gameName:       p.name,
                    displayName:    p.name,
                    noteSets:       [defaultNoteSet]
                };
            })
        };
    }
    catch (error)
    {
        console.error("Erreur chargement game-profiles.json :", error);
        gameProfiles = { profiles: [] };
    }
}



function createWindow(): void
{
    if (mainWindow)
    {
        return;
    }

    mainWindow = new BrowserWindow(
    {
        width:           980,
        height:          760,
        minWidth:        760,
        minHeight:       640,
        backgroundColor: "#171614",
        webPreferences:
        {
            preload:          path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration:  false
        }
    });

    mainWindow.loadFile(path.join(__dirname, "../index.html"));

    mainWindow.on("closed", () =>
    {
        mainWindow = null;
    });
}



function createOverlayWindow(): void
{
    if (overlayWindow)
    {
        return;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    overlayWindow = new BrowserWindow(
    {
        x:               0,
        y:               0,
        width,
        height,
        transparent:     true,
        frame:           false,
        resizable:       false,
        alwaysOnTop:     true,
        skipTaskbar:     true,
        focusable:       false,
        backgroundColor: "#00000000",
        webPreferences:
        {
            preload:          path.join(__dirname, "overlay-preload.js"),
            contextIsolation: true,
            nodeIntegration:  false
        }
    });

    overlayWindow.setAlwaysOnTop(true, "normal");
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });

    overlayWindow.loadFile(path.join(__dirname, "../overlay.html"));

    overlayWindow.on("closed", () =>
    {
        overlayWindow = null;
    });
}



function createMenuWindow(): void
{
    if (menuWindow)
    {
        return;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const menuWidth  = 260;
    const menuHeight = 220;

    menuWindow = new BrowserWindow(
    {
        x:               Math.round((width - menuWidth) / 2),
        y:               20,
        width:           menuWidth,
        height:          menuHeight,
        transparent:     true,
        frame:           false,
        resizable:       false,
        alwaysOnTop:     true,
        skipTaskbar:     true,
        focusable:       true,
        backgroundColor: "#00000000",
        webPreferences:
        {
            preload:          path.join(__dirname, "menu-preload.js"),
            contextIsolation: true,
            nodeIntegration:  false
        }
    });

    menuWindow.setAlwaysOnTop(true, "screen-saver");
    menuWindow.focus();

    menuWindow.loadFile(path.join(__dirname, "../menu.html"));

    menuWindow.on("closed", () =>
    {
        menuWindow = null;
    });
}



function createNotesPanelWindow(): void
{
    if (notesPanelWindow)
    {
        return;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    notesPanelWindow = new BrowserWindow(
    {
        x:               width - 320,
        y:               0,
        width:           320,
        height,
        transparent:     true,
        frame:           false,
        resizable:       false,
        alwaysOnTop:     true,
        skipTaskbar:     true,
        focusable:       true,
        backgroundColor: "#00000000",
        webPreferences:
        {
            preload:          path.join(__dirname, "notes-panel-preload.js"),
            contextIsolation: true,
            nodeIntegration:  false
        }
    });

    notesPanelWindow.loadFile(path.join(__dirname, "../notes-panel.html"));

    notesPanelWindow.setAlwaysOnTop(true, "screen-saver");
    notesPanelWindow.focus();

    notesPanelWindow.on("closed", () =>
    {
        notesPanelWindow = null;
    });
}



function getDataDirectoryPath(): string
{
    if (app.isPackaged)
    {
        return path.join(path.dirname(app.getPath("exe")), "data");
    }

    return path.join(app.getAppPath(), "data");
}



function getProfilesFilePath(): string
{
    return path.join(getDataDirectoryPath(), "game-profiles.json");
}



function getGameProfilesDirectoryPath(): string
{
    return path.join(getDataDirectoryPath(), "game-profiles");
}



function getUsageFilePath(): string
{
    return path.join(getDataDirectoryPath(), "usage.json");
}



function sanitizeFolderName(value: string): string
{
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
}



async function ensureUniqueFolderName(baseFolderName: string, profiles: GameProfile[]): Promise<string>
{
    const baseName = baseFolderName || "game-profile";

    let candidate = baseName;
    let index     = 2;

    const existingFolderNames = new Set(
        profiles
            .filter((profile: GameProfile) => profile.folderName)
            .map((profile: GameProfile) =>
            {
                return profile.folderName.toLowerCase();
            })
    );

    while (existingFolderNames.has(candidate.toLowerCase()))
    {
        candidate = `${baseName}-${index}`;
        index += 1;
    }

    return candidate;
}



async function readProfilesFile(): Promise<ProfilesFileData>
{
    const filePath = getProfilesFilePath();

    try
    {
        const raw    = await fs.readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw);

        return {
            profiles: Array.isArray(parsed.profiles)
                ? parsed.profiles
                : [],
            launchHistory: Array.isArray(parsed.launchHistory)
                ? parsed.launchHistory
                : []
        };
    }
    catch
    {
        return {
            profiles:      [],
            launchHistory: []
        };
    }
}



async function writeProfilesFile(data: ProfilesFileData): Promise<void>
{
    const filePath = getProfilesFilePath();
    const tempPath = `${filePath}.tmp`;

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tempPath, filePath);
}



async function readUsageFile(): Promise<UsageData>
{
    const filePath = getUsageFilePath();

    try
    {
        const raw    = await fs.readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw);

        return {
            webRequests: typeof parsed.webRequests === "number" ? parsed.webRequests : 0,
            launchCount: typeof parsed.launchCount === "number" ? parsed.launchCount : 0
        };
    }
    catch
    {
        return {
            webRequests: 0,
            launchCount: 0
        };
    }
}



async function writeUsageFile(data: UsageData): Promise<void>
{
    const filePath = getUsageFilePath();
    const tempPath = `${filePath}.tmp`;

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tempPath, filePath);
}



function getCurrentGameProfile(): GameProfileNotes | null
{
    if (!currentGameProfileId)
    {
        return null;
    }

    return gameProfiles.profiles.find((profile: GameProfileNotes) =>
    {
        return profile.id === currentGameProfileId;
    }) || null;
}



function getCurrentNoteSet(): NoteSet | null
{
    const profile = getCurrentGameProfile();

    if (!profile || !currentNoteSetId)
    {
        return null;
    }

    return profile.noteSets.find((noteSet: NoteSet) =>
    {
        return noteSet.id === currentNoteSetId;
    }) || null;
}



function getOverlayNotes()
{
    const profile = getCurrentGameProfile();

    if (!profile)
    {
        return {
            profile:  null,
            noteSets: []
        };
    }

    return {
        profile:
        {
            id:          profile.id,
            displayName: profile.displayName,
            gameName:    profile.gameName
        },
        noteSets: profile.noteSets.map((noteSet: NoteSet) =>
        {
            const filteredNotes = noteSet.notes.filter((note: Note) =>
            {
                return note.active;
            });

            const priorityOrder: Record<string, number> = { high: 1, medium: 2, low: 3 };

            filteredNotes.sort((a: Note, b: Note) =>
            {
                const pa = a.priority ? priorityOrder[a.priority] || 99 : 99;
                const pb = b.priority ? priorityOrder[b.priority] || 99 : 99;
                return pa - pb;
            });

            const overlayNotes = filteredNotes.slice(0, 5);

            return {
                id:       noteSet.id,
                name:     noteSet.name,
                notes: overlayNotes.map((note: Note) =>
                {
                    return {
                        id:       note.id,
                        title:    note.title,
                        content:  note.content,
                        priority: note.priority || null,
                        tags:     note.tags || []
                    };
                })
            };
        })
    };
}



ipcMain.handle("paul:launch", async (_event, payload: LaunchPayload) =>
{
    const data = await readProfilesFile();

    let selectedGameName: string | null = null;

    if (payload.mod === "game")
    {
        const gameName = payload.gameName?.trim();

        if (gameName)
        {
            const selectedProfile = data.profiles.find((profile: GameProfile) =>
            {
                return profile.name === gameName;
            });

            if (selectedProfile)
            {
                selectedGameName          = selectedProfile.name;
                currentOverlayProfileName = selectedProfile.name;
            }
        }
    }

    const launchEntry: LaunchEntry =
    {
        launchedAt: new Date().toISOString(),
        inputMode:  payload.inputMode,
        mod:        payload.mod,
        gameName:   selectedGameName
    };

    const nextHistory = [launchEntry, ...data.launchHistory].slice(0, 10);

    await writeProfilesFile({
        profiles:      data.profiles,
        launchHistory: nextHistory
    });

    const usage = await readUsageFile();

    const nextUsage: UsageData =
    {
        webRequests: usage.webRequests,
        launchCount: usage.launchCount + 1
    };

    await writeUsageFile(nextUsage);

    if (!overlayWindow)
    {
        createOverlayWindow();
    }

    if (overlayWindow)
    {
        overlayWindow.webContents.send("overlay:updateNotes",
        {
            profileName: currentOverlayProfileName,
            notes:       currentOverlayNotes
        });
    }

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

    return {
        ok:      true,
        history: data.launchHistory
    };
});



ipcMain.handle("profiles:list", async () =>
{
    const data = await readProfilesFile();

    return data.profiles;
});



ipcMain.handle("profiles:create", async (_event, gameName: string) =>
{
    const cleanName = gameName.trim();

    if (!cleanName)
    {
        return {
            ok:      false,
            message: "Nom de jeu invalide."
        };
    }

    const data = await readProfilesFile();

    const exists = data.profiles.some((profile: GameProfile) =>
    {
        return profile.name?.toLowerCase() === cleanName.toLowerCase();
    });

    if (exists)
    {
        return {
            ok:      false,
            message: "Ce profil existe déjà."
        };
    }

    const baseFolderName   = sanitizeFolderName(cleanName);
    const uniqueFolderName = await ensureUniqueFolderName(baseFolderName, data.profiles);
    const folderPath       = path.join(getGameProfilesDirectoryPath(), uniqueFolderName);

    await fs.mkdir(folderPath, { recursive: true });

    const newProfile: GameProfile =
    {
        name:       cleanName,
        folderName: uniqueFolderName,
        folderPath
    };

    const nextProfiles = [newProfile, ...data.profiles];

    await writeProfilesFile({
        profiles:      nextProfiles,
        launchHistory: data.launchHistory
    });

    // Recharger les profils avec les notes
    await loadGameProfiles();

    return {
        ok:       true,
        profiles: nextProfiles
    };
});



ipcMain.handle("profiles:delete", async (_event, gameName: string) =>
{
    const data = await readProfilesFile();

    const nextProfiles = data.profiles.filter((profile: GameProfile) =>
    {
        return profile.name !== gameName;
    });

    await writeProfilesFile({
        profiles:      nextProfiles,
        launchHistory: data.launchHistory
    });

    // Recharger les profils avec les notes
    await loadGameProfiles();

    return {
        ok:       true,
        profiles: nextProfiles
    };
});



ipcMain.handle("usage:get", async () =>
{
    const usage = await readUsageFile();

    return {
        ok:   true,
        usage
    };
});



ipcMain.handle("overlay:setNotes", async (_event, notes: string) =>
{
    currentOverlayNotes = notes;

    if (overlayWindow)
    {
        overlayWindow.webContents.send("overlay:updateNotes",
        {
            profileName: currentOverlayProfileName,
            notes:       currentOverlayNotes
        });
    }

    return { ok: true };
});



ipcMain.handle("overlay:setProfileName", async (_event, profileName: string) =>
{
    currentOverlayProfileName = profileName;

    if (overlayWindow)
    {
        overlayWindow.webContents.send("overlay:updateNotes",
        {
            profileName: currentOverlayProfileName,
            notes:       currentOverlayNotes
        });
    }

    return { ok: true };
});



ipcMain.handle("notes:getProfiles", () =>
{
    return gameProfiles.profiles.map((profile: GameProfileNotes) =>
    {
        return {
            id:          profile.id,
            displayName: profile.displayName,
            gameName:    profile.gameName
        };
    });
});



ipcMain.handle("notes:getNoteSetsForProfile", (_event, profileId: string) =>
{
    const profile = gameProfiles.profiles.find((p: GameProfileNotes) =>
    {
        return p.id === profileId;
    });

    if (!profile)
    {
        return [];
    }

    return profile.noteSets.map((noteSet: NoteSet) =>
    {
        return {
            id:     noteSet.id,
            name:   noteSet.name,
            active: noteSet.active
        };
    });
});



ipcMain.handle("notes:setCurrentProfile", (_event, profileIdOrGameName: string) =>
{
    console.log("notes:setCurrentProfile appelé avec :", profileIdOrGameName);
    console.log("gameProfiles.profiles =", gameProfiles.profiles);

    // Chercher d'abord par id
    let profile = gameProfiles.profiles.find((p: GameProfileNotes) =>
    {
        return p.id === profileIdOrGameName;
    });

    // Si pas trouvé, chercher par gameName
    if (!profile)
    {
        profile = gameProfiles.profiles.find((p: GameProfileNotes) =>
        {
            return p.gameName === profileIdOrGameName;
        });
    }

    if (!profile)
    {
        console.log("PROFIL NON TROUVÉ");
        return { success: false };
    }

    console.log("PROFIL TROUVÉ :", profile.displayName);

    currentGameProfileId = profile.id;
    currentNoteSetId     = null;

    // Activer le premier noteSet par défaut
    if (profile.noteSets.length > 0)
    {
        currentNoteSetId = profile.noteSets[0].id;
        console.log("NOTESET ACTIVÉ :", currentNoteSetId);
    }

    return { success: true };
});



ipcMain.handle("notes:setCurrentNoteSet", (_event, noteSetId: string) =>
{
    const profile = getCurrentGameProfile();

    if (!profile)
    {
        return { success: false };
    }

    const exists = profile.noteSets.some((noteSet: NoteSet) =>
    {
        return noteSet.id === noteSetId;
    });

    currentNoteSetId = exists ? noteSetId : null;

    return { success: exists };
});



ipcMain.handle("notes:getOverlayNotes", () =>
{
    return getOverlayNotes();
});



ipcMain.handle("notes:pinNote", (_event, payload: { profileName: string; note: { title: string; content: string } }) =>
{
    currentOverlayProfileName = payload.profileName;
    currentOverlayNotes       = payload.note.content;
    currentPinnedNote         = payload.note;

    if (overlayWindow)
    {
        overlayWindow.webContents.send("overlay:pinNote",
        {
            profileName: payload.profileName,
            note:        payload.note
        });
    }

    return { ok: true };
});


ipcMain.handle("notes:saveNote", async (_event, oldNote: { title: string; content: string }, newNote: { title: string; content: string }) =>
{
    const profile = getCurrentGameProfile();

    if (!profile)
    {
        return { ok: false, message: "Aucun profil actif." };
    }

    const noteSet = profile.noteSets.find((ns: NoteSet) => ns.active);

    if (!noteSet)
    {
        return { ok: false, message: "Aucun noteSet actif." };
    }

    const note = noteSet.notes.find((n: Note) =>
    {
        return n.title === oldNote.title && n.content === oldNote.content;
    });

    if (!note)
    {
        return { ok: false, message: "Note introuvable." };
    }

    note.title = newNote.title;
    note.content = newNote.content;
    note.updatedAt = new Date().toISOString();

    // Sauvegarder les notes
    await fs.writeFile(gameProfilesNotesPath, JSON.stringify(gameProfiles, null, 2), "utf-8");

    return { ok: true };
});



ipcMain.handle("menu:openNotesPanel", () =>
{
    if (overlayWindow)
    {
        overlayWindow.webContents.send("overlay:unpinNote");
    }

    if (menuWindow)
    {
        menuWindow.hide();
    }

    createNotesPanelWindow();

    return { ok: true };
});


ipcMain.handle("overlay:unpinNote", () =>
{
    currentOverlayNotes = "";
    currentPinnedNote   = null;

    if (overlayWindow)
    {
        overlayWindow.webContents.send("overlay:unpinNote");
    }

    return { ok: true };
});


ipcMain.handle("notes:getAllNotes", () =>
{
    const profile = getCurrentGameProfile();

    if (!profile)
    {
        return {
            pinnedNotes: [],
            otherNotes:  []
        };
    }

    const allNotes: { title: string; content: string; pinned: boolean }[] = [];

    profile.noteSets.forEach((noteSet: NoteSet) =>
    {
        noteSet.notes.forEach((note: Note) =>
        {
            if (note.active)
            {
                allNotes.push({
                    title:   note.title,
                    content: note.content,
                    pinned:  currentPinnedNote?.title === note.title
                });
            }
        });
    });

    const pinnedNotes = allNotes.filter(n => n.pinned);
    const otherNotes = allNotes.filter(n => !n.pinned);

    return {
        pinnedNotes,
        otherNotes
    };
});


ipcMain.handle("notes:createNote", async () =>
{
    console.log("=== notes:createNote APPELÉ ===");
    console.log("currentGameProfileId =", currentGameProfileId);
    console.log("currentNoteSetId =", currentNoteSetId);

    const profile = getCurrentGameProfile();

    if (!profile)
    {
        console.log("AUCUN PROFIL ACTIF");
        return { ok: false, message: "Aucun profil actif." };
    }

    console.log("PROFIL ACTIF TROUVÉ :", profile.displayName);

    const noteSet = profile.noteSets.find((ns: NoteSet) => ns.active);

    if (!noteSet)
    {
        console.log("AUCUN NOTESET ACTIF");
        return { ok: false, message: "Aucun noteSet actif." };
    }

    console.log("NOTESET ACTIF TROUVÉ :", noteSet.name);

    const newNote: Note = {
        id: `note_${Date.now()}`,
        title: "Nouvelle note",
        content: "",
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    noteSet.notes.push(newNote);

    // Sauvegarder les notes
    await fs.writeFile(gameProfilesNotesPath, JSON.stringify(gameProfiles, null, 2), "utf-8");

    return { ok: true, note: newNote };
});


app.whenReady().then(async () =>
{
    await loadGameProfiles();

    createWindow();
    createOverlayWindow();
    createMenuWindow();

    // On cache l'overlay et le menu au démarrage
    overlayWindow?.hide();
    menuWindow?.hide();

    globalShortcut.register("F4", () =>
    {
        if (!overlayWindow || !menuWindow)
        {
            return;
        }

        const overlayVisible = overlayWindow.isVisible();

        if (overlayVisible)
        {
            overlayWindow.hide();
            menuWindow.hide();
        }
        else
        {
            overlayWindow.show();
            menuWindow.show();
            menuWindow.focus();
        }
    });

    globalShortcut.register("Esc", () =>
    {
        if (notesPanelWindow)
        {
            notesPanelWindow.close();
            notesPanelWindow = null;
        }
    });

    app.on("activate", () =>
    {
        if (BrowserWindow.getAllWindows().length === 0)
        {
            createWindow();
            createOverlayWindow();
            createMenuWindow();
        }
    });
});



app.on("will-quit", () =>
{
    globalShortcut.unregisterAll();
});



app.on("window-all-closed", () =>
{
    if (process.platform !== "darwin")
    {
        app.quit();
    }
});