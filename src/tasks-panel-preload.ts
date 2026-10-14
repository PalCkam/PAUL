import { contextBridge, ipcRenderer } from "electron";



contextBridge.exposeInMainWorld("tasksPanelApi",
{
    getContext()
    {
        return ipcRenderer.invoke("tasks:current");
    },

    simulate(taskId: string, values: Record<string, unknown>, scenarioId: string)
    {
        return ipcRenderer.invoke("tasks:simulate", taskId, values, scenarioId);
    },

    listPresets()
    {
        return ipcRenderer.invoke("presets:list");
    },

    savePreset(taskId: string, name: string, values: Record<string, unknown>)
    {
        return ipcRenderer.invoke("presets:save", taskId, name, values);
    },

    deletePreset(presetId: string)
    {
        return ipcRenderer.invoke("presets:delete", presetId);
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
