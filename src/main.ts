import { app, BrowserWindow, ipcMain, globalShortcut } from "electron";
import fs                                               from "node:fs/promises";
import path                                             from "node:path";


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


let mainWindow:    BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

let currentOverlayProfileName = "";
let currentOverlayNotes       = "";


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


    overlayWindow = new BrowserWindow(
    {
        width:           800,
        height:          600,
        transparent:     true,
        frame:           false,
        resizable:       false,
        alwaysOnTop:     true,
        skipTaskbar:     true,
        focusable:       true,
        backgroundColor: "#00000000",
        webPreferences:
        {
            preload:          path.join(__dirname, "overlay-preload.js"),
            contextIsolation: true,
            nodeIntegration:  false
        }
    });


    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.setFullScreen(true);


    overlayWindow.loadFile(path.join(__dirname, "../overlay.html"));


    overlayWindow.on("closed", () =>
    {
        overlayWindow = null;
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
		profiles.map((profile: GameProfile) =>
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
				selectedGameName         = selectedProfile.name;
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
		return profile.name.toLowerCase() === cleanName.toLowerCase();
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


	return {
		ok:       true,
		profiles: nextProfiles
	};
});


ipcMain.handle("usage:get", async () =>
{
	const usage = await readUsageFile();


	return {
		ok:    true,
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


app.whenReady().then(() =>
{
	createWindow();
	createOverlayWindow();


	globalShortcut.register("F4", () =>
	{
		if (overlayWindow)
		{
			overlayWindow.webContents.send("overlay:toggleSidebar");
		}
	});

	globalShortcut.register("Esc", () =>
    {
        if (overlayWindow)
        {
            overlayWindow.close();
            overlayWindow = null;
        }
    });


	app.on("activate", () =>
	{
		if (BrowserWindow.getAllWindows().length === 0)
		{
			createWindow();
			createOverlayWindow();
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