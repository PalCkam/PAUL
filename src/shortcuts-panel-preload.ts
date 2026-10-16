import { contextBridge, ipcRenderer } from "electron";



contextBridge.exposeInMainWorld("shortcutsPanelApi",
{
    getContext()
    {
        return ipcRenderer.invoke("shortcuts:context");
    },

    setShortcut(key: number, value: string)
    {
        return ipcRenderer.invoke("shortcuts:set", key, value);
    },

    openPanel(panelId: string)
    {
        return ipcRenderer.invoke("panel:open", panelId);
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
