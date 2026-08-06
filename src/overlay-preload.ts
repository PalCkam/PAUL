import { contextBridge, ipcRenderer } from "electron";


contextBridge.exposeInMainWorld("overlayApi",
{
	setNotes(notes: string)
	{
		return ipcRenderer.invoke("overlay:setNotes", notes);
	},


	setProfileName(profileName: string)
	{
		return ipcRenderer.invoke("overlay:setProfileName", profileName);
	}
});