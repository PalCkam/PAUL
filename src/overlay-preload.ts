import { contextBridge, ipcRenderer } from "electron";


// Pas d'API exposée ici, le désépinglage se fait depuis le panneau Notes


ipcRenderer.on("overlay:pinNote", (_event, payload) =>
{
    window.postMessage({ type: "overlay:pinNote", payload }, "*");
});


ipcRenderer.on("overlay:unpinNote", () =>
{
    window.postMessage({ type: "overlay:unpinNote" }, "*");
});