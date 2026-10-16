import { contextBridge, ipcRenderer } from "electron";

import type { NoteChanges } from "./app-types";



contextBridge.exposeInMainWorld("notesPanelApi",
{
    listNotes()
    {
        return ipcRenderer.invoke("notes:list");
    },

    createNote()
    {
        return ipcRenderer.invoke("notes:create");
    },

    saveNote(noteId: string, changes: NoteChanges)
    {
        return ipcRenderer.invoke("notes:save", noteId, changes);
    },

    deleteNote(noteId: string)
    {
        return ipcRenderer.invoke("notes:delete", noteId);
    },

    pinNote(noteId: string)
    {
        return ipcRenderer.invoke("notes:pin", noteId);
    },

    unpinNote(noteId: string)
    {
        return ipcRenderer.invoke("notes:unpin", noteId);
    },

    close()
    {
        return ipcRenderer.invoke("panel:close");
    },

    onRefresh(callback: () => void)
    {
        ipcRenderer.on("panel:refresh", () =>
        {
            callback();
        });
    }
});
