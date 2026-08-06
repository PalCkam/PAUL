import { contextBridge, ipcRenderer } from "electron";


contextBridge.exposeInMainWorld("notesPanelApi",
{
    pinNote(profileName: string, note: { title: string; content: string })
    {
        return ipcRenderer.invoke("notes:pinNote", { profileName, note });
    },


    unpinNote()
    {
        return ipcRenderer.invoke("notes:unpinNote");
    }
});