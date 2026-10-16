import { BrowserWindow, screen } from "electron";
import path from "node:path";



const rootDir = path.join(__dirname, "..");

const DOCK_BUTTON_SIZE        = 56;
const DOCK_GAP                = 8;
const DOCK_PADDING            = 8;
const DOCK_MARGIN_TOP         = 16;
const KEEP_ON_TOP_INTERVAL_MS = 2000;



export type PanelId = "notes" | "tasks" | "shortcuts" | "vision";

const PANEL_FILES: Record<PanelId, { html: string; preload: string }> =
{
    notes: { html: "notes-panel.html", preload: "notes-panel-preload.js" },
    tasks: { html: "tasks-panel.html", preload: "tasks-panel-preload.js" },

    shortcuts: { html: "shortcuts-panel.html", preload: "shortcuts-panel-preload.js" },

    vision: { html: "vision-panel.html", preload: "vision-panel-preload.js" }
};

const PANEL_IDS = Object.keys(PANEL_FILES) as PanelId[];

const PANEL_LAYOUTS: Record<PanelId, (area: Electron.Rectangle) => Electron.Rectangle> =
{
    notes: (area) => ({ x: area.x, y: area.y, width: 340, height: area.height }),

    tasks: (area) => ({ x: area.x + area.width - 420, y: area.y, width: 420, height: area.height }),

    shortcuts: (area) =>
    {
        const width  = 460;
        const height = Math.min(780, area.height - 80);

        return {
            x:      Math.max(area.x, Math.round(area.x + area.width - 420 - 20 - width)),
            y:      Math.round(area.y + (area.height - height) / 2),
            width,
            height
        };
    },

    vision: (area) => ({ x: area.x + 340 + 20, y: area.y, width: 480, height: area.height })
};



let launcherWindow: BrowserWindow | null = null;
let overlayWindow:  BrowserWindow | null = null;
let dockWindow:     BrowserWindow | null = null;

const panelWindows: Partial<Record<PanelId, BrowserWindow>> = {};

let panelOrder: PanelId[] = [];

let keepOnTopTimer: NodeJS.Timeout | null = null;



function preloadPath(fileName: string): string
{
    return path.join(__dirname, fileName);
}



function getScreenBounds(): Electron.Rectangle
{
    return screen.getPrimaryDisplay().bounds;
}



function isAlive(win: BrowserWindow | null | undefined): win is BrowserWindow
{
    return win !== null && win !== undefined && !win.isDestroyed();
}



export function createLauncherWindow(onClosed: () => void): BrowserWindow
{
    launcherWindow = new BrowserWindow(
    {
        width:           980,
        height:          760,
        minWidth:        760,
        minHeight:       640,
        backgroundColor: "#171614",
        webPreferences:
        {
            preload:          preloadPath("preload.js"),
            contextIsolation: true,
            nodeIntegration:  false
        }
    });

    launcherWindow.loadFile(path.join(rootDir, "index.html"));

    launcherWindow.on("closed", () =>
    {
        launcherWindow = null;
        onClosed();
    });

    return launcherWindow;
}



export function getLauncherWindow(): BrowserWindow | null
{
    return isAlive(launcherWindow) ? launcherWindow : null;
}



export function minimizeLauncher(): void
{
    if (isAlive(launcherWindow))
    {
        launcherWindow.minimize();
    }
}



function createOverlayWindow(): BrowserWindow
{
    const { x, y, width, height } = getScreenBounds();

    const win = new BrowserWindow(
    {
        x,
        y,
        width,
        height,
        transparent:     true,
        frame:           false,
        resizable:       false,
        movable:         false,
        hasShadow:       false,
        alwaysOnTop:     true,
        skipTaskbar:     true,
        focusable:       false,
        show:            false,
        backgroundColor: "#00000000",
        webPreferences:
        {
            preload:          preloadPath("overlay-preload.js"),
            contextIsolation: true,
            nodeIntegration:  false
        }
    });

    win.setAlwaysOnTop(true, "screen-saver");
    win.setIgnoreMouseEvents(true);
    win.loadFile(path.join(rootDir, "overlay.html"));

    win.on("closed", () =>
    {
        overlayWindow = null;
    });

    return win;
}



function createDockWindow(moduleCount: number): BrowserWindow
{
    const { x, y, width } = getScreenBounds();

    const dockWidth  = moduleCount * DOCK_BUTTON_SIZE + (moduleCount - 1) * DOCK_GAP + DOCK_PADDING * 2;
    const dockHeight = DOCK_BUTTON_SIZE + DOCK_PADDING * 2;

    const win = new BrowserWindow(
    {
        x:               Math.round(x + (width - dockWidth) / 2),
        y:               y + DOCK_MARGIN_TOP,
        width:           dockWidth,
        height:          dockHeight,
        transparent:     true,
        frame:           false,
        resizable:       false,
        movable:         false,
        hasShadow:       false,
        alwaysOnTop:     true,
        skipTaskbar:     true,
        focusable:       false,
        show:            false,
        backgroundColor: "#00000000",
        webPreferences:
        {
            preload:          preloadPath("dock-preload.js"),
            contextIsolation: true,
            nodeIntegration:  false
        }
    });

    win.setAlwaysOnTop(true, "screen-saver");
    win.loadFile(path.join(rootDir, "dock.html"));

    win.on("closed", () =>
    {
        dockWindow = null;
    });

    return win;
}



function createPanelWindow(panelId: PanelId): BrowserWindow
{
    const { x, y, width, height } = PANEL_LAYOUTS[panelId](getScreenBounds());

    const win = new BrowserWindow(
    {
        x,
        y,
        width,
        height,
        transparent:     true,
        frame:           false,
        resizable:       false,
        movable:         false,
        hasShadow:       false,
        alwaysOnTop:     true,
        skipTaskbar:     true,
        focusable:       true,
        show:            false,
        backgroundColor: "#00000000",
        webPreferences:
        {
            preload:          preloadPath(PANEL_FILES[panelId].preload),
            contextIsolation: true,
            nodeIntegration:  false
        }
    });

    win.setAlwaysOnTop(true, "screen-saver");
    win.loadFile(path.join(rootDir, PANEL_FILES[panelId].html));

    win.on("closed", () =>
    {
        delete panelWindows[panelId];

        panelOrder = panelOrder.filter((id: PanelId) => id !== panelId);
    });

    return win;
}



function startKeepOnTop(): void
{
    if (keepOnTopTimer)
    {
        return;
    }

    keepOnTopTimer = setInterval(() =>
    {
        for (const win of [overlayWindow, dockWindow, ...panelOrder.map((panelId: PanelId) => panelWindows[panelId])])
        {
            if (isAlive(win) && win.isVisible())
            {
                win.setAlwaysOnTop(true, "screen-saver");
                win.moveTop();
            }
        }
    }, KEEP_ON_TOP_INTERVAL_MS);
}



export function ensureOverlayLayer(moduleCount: number): void
{
    if (!isAlive(overlayWindow))
    {
        overlayWindow = createOverlayWindow();
    }

    if (!isAlive(dockWindow))
    {
        dockWindow = createDockWindow(moduleCount);
    }

    for (const panelId of PANEL_IDS)
    {
        if (!isAlive(panelWindows[panelId]))
        {
            panelWindows[panelId] = createPanelWindow(panelId);
        }
    }

    overlayWindow.showInactive();

    startKeepOnTop();
}



export function setDockVisible(visible: boolean): void
{
    if (!isAlive(dockWindow))
    {
        return;
    }

    if (visible)
    {
        dockWindow.showInactive();
    }
    else
    {
        dockWindow.hide();
    }
}



export function isDockVisible(): boolean
{
    return isAlive(dockWindow) && dockWindow.isVisible();
}



export function getOpenPanels(): PanelId[]
{
    return panelOrder.filter((panelId: PanelId) => isPanelVisible(panelId));
}



function notifyDock(): void
{
    if (isAlive(dockWindow))
    {
        dockWindow.webContents.send("dock:openPanels", getOpenPanels());
    }
}



export function showPanel(panelId: PanelId): void
{
    const panel = panelWindows[panelId] ?? null;

    if (!isAlive(panel))
    {
        return;
    }

    panel.webContents.send("panel:refresh");
    panel.show();
    panel.focus();

    panelOrder = [...panelOrder.filter((id: PanelId) => id !== panelId), panelId];

    notifyDock();
}



export function hidePanel(panelId?: PanelId): void
{
    const ids = panelId ? [panelId] : [...PANEL_IDS];

    for (const id of ids)
    {
        const panel = panelWindows[id] ?? null;

        if (isAlive(panel) && panel.isVisible())
        {
            panel.hide();
        }
    }

    panelOrder = panelOrder.filter((id: PanelId) => !ids.includes(id));

    notifyDock();
}



export function hideTopPanel(): void
{
    const open = getOpenPanels();

    if (open.length > 0)
    {
        hidePanel(open[open.length - 1]);
    }
}



export function closePanelOf(sender: unknown): void
{
    const owner = PANEL_IDS.find((panelId: PanelId) =>
    {
        const panel = panelWindows[panelId] ?? null;

        return isAlive(panel) && panel.webContents === sender;
    });

    if (owner)
    {
        hidePanel(owner);
    }
}



export function isPanelVisible(panelId?: PanelId): boolean
{
    const ids = panelId ? [panelId] : PANEL_IDS;

    return ids.some((id: PanelId) =>
    {
        const panel = panelWindows[id] ?? null;

        return isAlive(panel) && panel.isVisible();
    });
}



export function togglePanel(panelId: PanelId): void
{
    if (isPanelVisible(panelId))
    {
        hidePanel(panelId);
    }
    else
    {
        showPanel(panelId);
    }
}



export function sendToOverlay(channel: string, payload?: unknown): void
{
    if (isAlive(overlayWindow))
    {
        overlayWindow.webContents.send(channel, payload);
    }
}
