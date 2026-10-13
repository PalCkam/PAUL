import { contextBridge, ipcRenderer } from "electron";

import type { PinnedNoteView } from "./types";



contextBridge.exposeInMainWorld("overlayApi",
{
    getPinnedNotes()
    {
        return ipcRenderer.invoke("overlay:getPinnedNotes");
    },

    onPinnedNotesChanged(callback: (notes: PinnedNoteView[]) => void)
    {
        ipcRenderer.on("overlay:pinnedNotes", (_event, notes: PinnedNoteView[]) =>
        {
            callback(notes);
        });
    }
});
