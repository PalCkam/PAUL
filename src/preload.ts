import { contextBridge, ipcRenderer } from "electron";

type LaunchPayload =
{
    inputMode: "text" | "voice";
    mod:       "game" | "dev" | "life";
};

contextBridge.exposeInMainWorld("paulApi",
{
    launch(payload: LaunchPayload)
    {
        return ipcRenderer.invoke("paul:launch", payload);
    },

    listProfiles()
    {
        return ipcRenderer.invoke("profiles:list");
    },

    createProfile(gameName: string)
    {
        return ipcRenderer.invoke("profiles:create", gameName);
    },

    deleteProfile(gameName: string)
    {
        return ipcRenderer.invoke("profiles:delete", gameName);
    },

    historyList()
    {
        return ipcRenderer.invoke("history:list");
    },

    getUsage()
    {
        return ipcRenderer.invoke("usage:get");
    }
});