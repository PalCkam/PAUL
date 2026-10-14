import { contextBridge, ipcRenderer } from "electron";

import type { LaunchPayload } from "./types";



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

    listGames()
    {
        return ipcRenderer.invoke("games:list");
    },

    createProfile(profileName: string, gameId: string | null)
    {
        return ipcRenderer.invoke("profiles:create", profileName, gameId);
    },

    deleteProfile(gameName: string)
    {
        return ipcRenderer.invoke("profiles:delete", gameName);
    },

    selectProfile(gameName: string)
    {
        return ipcRenderer.invoke("profiles:select", gameName);
    },

    historyList()
    {
        return ipcRenderer.invoke("history:list");
    },

    clearHistory()
    {
        return ipcRenderer.invoke("history:clear");
    },

    getUsage()
    {
        return ipcRenderer.invoke("usage:get");
    }
});
