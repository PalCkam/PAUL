import { BrowserWindow, screen } from "electron";
import path from "node:path";



const rootDir = path.join(__dirname, "..");

const PANEL_WIDTH             = 340;
const DOCK_BUTTON_SIZE        = 56;
const DOCK_GAP                = 8;
const DOCK_PADDING            = 8;
const DOCK_MARGIN_TOP         = 16;
const KEEP_ON_TOP_INTERVAL_MS = 2000;



let launcherWindow:   BrowserWindow | null = null;
let overlayWindow:    BrowserWindow | null = null;
let dockWindow:       BrowserWindow | null = null;
let notesPanelWindow: BrowserWindow | null = null;

let keepOnTopTimer: NodeJS.Timeout | null = null;



function preloadPath(fileName: string): string
{
    return path.join(__dirname, fileName);
}



function getScreenBounds(): Electron.Rectangle
{
    return screen.getPrimaryDisplay().bounds;
}



function isAlive(win: BrowserWindow | null): win is BrowserWindow
{
    return win !== null && !win.isDestroyed();
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



function createNotesPanelWindow(): BrowserWindow
{
    const { x, y, width, height } = getScreenBounds();

    const win = new BrowserWindow(
    {
        x:               x + width - PANEL_WIDTH,
        y,
        width:           PANEL_WIDTH,
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
            preload:          preloadPath("notes-panel-preload.js"),
            contextIsolation: true,
            nodeIntegration:  false
        }
    });

    win.setAlwaysOnTop(true, "screen-saver");
    win.loadFile(path.join(rootDir, "notes-panel.html"));

    win.on("closed", () =>
    {
        notesPanelWindow = null;
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
        for (const win of [overlayWindow, dockWindow, notesPanelWindow])
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

    if (!isAlive(notesPanelWindow))
    {
        notesPanelWindow = createNotesPanelWindow();
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



export function showPanel(): void
{
    if (!isAlive(notesPanelWindow))
    {
        return;
    }

    notesPanelWindow.webContents.send("panel:refresh");
    notesPanelWindow.show();
    notesPanelWindow.focus();
}



export function hidePanel(): void
{
    if (!isAlive(notesPanelWindow))
    {
        return;
    }

    notesPanelWindow.hide();
}



export function isPanelVisible(): boolean
{
    return isAlive(notesPanelWindow) && notesPanelWindow.isVisible();
}



export function togglePanel(): void
{
    if (isPanelVisible())
    {
        hidePanel();
    }
    else
    {
        showPanel();
    }
}



export function sendToOverlay(channel: string, payload?: unknown): void
{
    if (isAlive(overlayWindow))
    {
        overlayWindow.webContents.send(channel, payload);
    }
}
