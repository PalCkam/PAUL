import { app, BrowserWindow } from "electron";
import path                  from "node:path";

function createWindow(): void
{
	const win = new BrowserWindow(
	{
		width:           1320,
		height:          900,
		minWidth:        1080,
		minHeight:       760,
		backgroundColor: "#171614",
		webPreferences:
		{
			preload: path.join(__dirname, "preload.js")
		}
	});

	win.loadFile(path.join(__dirname, "../index.html"));
}

app.whenReady().then(() =>
{
	createWindow();

	app.on("activate", () =>
	{
		if (BrowserWindow.getAllWindows().length === 0)
		{
			createWindow();
		}
	});
});

app.on("window-all-closed", () =>
{
	if (process.platform !== "darwin")
	{
		app.quit();
	}
});