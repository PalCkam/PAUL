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
    }
});
