import { contextBridge, ipcRenderer } from "electron";



contextBridge.exposeInMainWorld("dockApi",
{
    getModules()
    {
        return ipcRenderer.invoke("dock:getModules");
    },

    openModule(moduleId: string)
    {
        return ipcRenderer.invoke("dock:openModule", moduleId);
    },

    getOpenPanels()
    {
        return ipcRenderer.invoke("dock:getOpenPanels");
    },

    onOpenPanelsChanged(callback: (panelIds: string[]) => void)
    {
        ipcRenderer.on("dock:openPanels", (_event, panelIds: string[]) =>
        {
            callback(panelIds);
        });
    }
});
