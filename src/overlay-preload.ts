import { contextBridge, ipcRenderer } from "electron";

import type { OverlayCard, PinnedNoteView } from "./app-types";



contextBridge.exposeInMainWorld("overlayApi",
{
    getPinnedNotes()
    {
        return ipcRenderer.invoke("overlay:getPinnedNotes");
    },

    getTaskReport()
    {
        return ipcRenderer.invoke("overlay:getTaskReport");
    },

    onTaskReportChanged(callback: (card: OverlayCard | null) => void)
    {
        ipcRenderer.on("overlay:taskReport", (_event, card: OverlayCard | null) =>
        {
            callback(card);
        });
    },

    onPinnedNotesChanged(callback: (notes: PinnedNoteView[]) => void)
    {
        ipcRenderer.on("overlay:pinnedNotes", (_event, notes: PinnedNoteView[]) =>
        {
            callback(notes);
        });
    }
});
