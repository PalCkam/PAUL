import { contextBridge, ipcRenderer } from "electron";



contextBridge.exposeInMainWorld("visionPanelApi",
{
    captureGame()
    {
        return ipcRenderer.invoke("vision:capture");
    },

    openCapturesFolder()
    {
        return ipcRenderer.invoke("vision:openFolder");
    },

    listCaptureWindows()
    {
        return ipcRenderer.invoke("vision:listWindows");
    },

    selectCaptureWindow(key: string | null)
    {
        return ipcRenderer.invoke("vision:selectWindow", key);
    },

    learnContext()
    {
        return ipcRenderer.invoke("vision:learnContext");
    },

    scanItems()
    {
        return ipcRenderer.invoke("vision:scanItems");
    },

    saveLearned(assignments: { key: string; itemId: string }[])
    {
        return ipcRenderer.invoke("vision:saveLearned", assignments);
    },

    forgetItem(itemId: string)
    {
        return ipcRenderer.invoke("vision:forgetItem", itemId);
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
