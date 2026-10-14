import { contextBridge, ipcRenderer } from "electron";



contextBridge.exposeInMainWorld("tasksPanelApi",
{
    getContext()
    {
        return ipcRenderer.invoke("tasks:current");
    },

    validate(taskId: string, values: Record<string, unknown>)
    {
        return ipcRenderer.invoke("tasks:validate", taskId, values);
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
