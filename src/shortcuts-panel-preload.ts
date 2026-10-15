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

    captureGame()
    {
        return ipcRenderer.invoke("vision:capture");
    },

    listCaptureWindows()
    {
        return ipcRenderer.invoke("vision:listWindows");
    },

    selectCaptureWindow(key: string | null)
    {
        return ipcRenderer.invoke("vision:selectWindow", key);
    },

    openCapturesFolder()
    {
        return ipcRenderer.invoke("vision:openFolder");
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
