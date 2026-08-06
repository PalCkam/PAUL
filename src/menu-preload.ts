import { contextBridge, ipcRenderer } from "electron";


contextBridge.exposeInMainWorld("menuApi",
{
    openNotesPanel()
    {
        return ipcRenderer.invoke("menu:openNotesPanel");
    }
});