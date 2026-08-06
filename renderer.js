const state =
{
    monthlyLimit:  1000,
    webRequests:   0,
    launchCount:   0,
    activeMod:     "game",
    inputMode:     "text",
    history:       [],
    theme:         "dark",
    gameProfiles:  [],
    selectedGame:  null,
    isNewGameOpen: false
};

const modMap =
{
    game:
    {
        label:       "Jeu",
        available:   true,
        description: "Disponible en V1"
    },
    dev:
    {
        label:       "Développement",
        available:   false,
        description: "Bientôt disponible"
    },
    life:
    {
        label:       "Personnel",
        available:   false,
        description: "Bientôt disponible"
    }
};

const els =
{
    themeToggle:          document.getElementById("themeToggle"),
    textModeButton:       document.getElementById("textModeButton"),
    voiceModeButton:      document.getElementById("voiceModeButton"),
    launchButton:         document.getElementById("launchButton"),
    launchHint:           document.getElementById("launchHint"),
    activeModBadge:       document.getElementById("activeModBadge"),
    quotaValue:           document.getElementById("quotaValue"),
    quotaText:            document.getElementById("quotaText"),
    quotaBarFill:         document.getElementById("quotaBarFill"),
    historyList:          document.getElementById("historyList"),
    clearHistory:         document.getElementById("clearHistory"),
    gameProfilesPanel:    document.getElementById("gameProfilesPanel"),
    gameProfilesList:     document.getElementById("gameProfilesList"),
    gameProfilesHint:     document.getElementById("gameProfilesHint"),
    newGameToggleButton:  document.getElementById("newGameToggleButton"),
    newGameForm:          document.getElementById("newGameForm"),
    newGameInput:         document.getElementById("newGameInput"),
    createGameButton:     document.getElementById("createGameButton"),
    modButtons:           Array.from(document.querySelectorAll("[data-mod]"))
};

function addHistory(result)
{
    const launchedDate = new Date(result.launchedAt);
    const time         = launchedDate.toLocaleTimeString("fr-FR",
    {
        hour:   "2-digit",
        minute: "2-digit"
    });

    const profileLabel = state.activeMod === "game" && state.selectedGame
        ? state.selectedGame.name
        : modMap[state.activeMod].label;

    state.history.unshift(
    {
        mode:    state.inputMode === "voice" ? "Vocal" : "Texte",
        mod:     modMap[state.activeMod].label,
        time,
        profile: profileLabel
    });

    state.history = state.history.slice(0, 10);
}

function setInputMode(mode)
{
    state.inputMode = mode;
    render();
}

function selectMod(modKey)
{
    const mod = modMap[modKey];

    if (!mod)
    {
        return;
    }

    state.activeMod = modKey;
    render();
}

function toggleNewGameForm()
{
    state.isNewGameOpen = !state.isNewGameOpen;
    render();
}

async function loadProfiles()
{
    if (!window.paulApi || typeof window.paulApi.listProfiles !== "function")
    {
        return;
    }

    try
    {
        const profiles = await window.paulApi.listProfiles();

        state.gameProfiles = Array.isArray(profiles) ? profiles : [];

        if (!state.selectedGame && state.gameProfiles.length > 0)
        {
            state.selectedGame = state.gameProfiles[0];
        }
        else if (state.selectedGame)
        {
            state.selectedGame = state.gameProfiles.find((profile) =>
            {
                return profile.name === state.selectedGame.name;
            }) || null;
        }

        render();
    }
    catch
    {
        els.gameProfilesHint.textContent = "Impossible de charger les profils.";
    }
}

async function createGameProfile()
{
    const gameName = els.newGameInput.value.trim();

    if (!gameName)
    {
        els.gameProfilesHint.textContent = "Entre un nom de jeu.";
        return;
    }

    if (!window.paulApi || typeof window.paulApi.createProfile !== "function")
    {
        return;
    }

    try
    {
        const result = await window.paulApi.createProfile(gameName);

        if (!result.ok)
        {
            els.gameProfilesHint.textContent = result.message || "Création impossible.";
            return;
        }

        state.gameProfiles  = Array.isArray(result.profiles) ? result.profiles : [];
        state.selectedGame  = state.gameProfiles.find((profile) =>
        {
            return profile.name === gameName;
        }) || null;
        state.isNewGameOpen = false;

        els.newGameInput.value           = "";
        els.gameProfilesHint.textContent = "Profil sauvegardé.";

        render();
    }
    catch
    {
        els.gameProfilesHint.textContent = "Erreur pendant la sauvegarde.";
    }
}

async function deleteGameProfile(gameName)
{
    if (!window.paulApi || typeof window.paulApi.deleteProfile !== "function")
    {
        return;
    }

    try
    {
        const result = await window.paulApi.deleteProfile(gameName);

        if (!result.ok)
        {
            els.gameProfilesHint.textContent = "Suppression impossible.";
            return;
        }

        state.gameProfiles = Array.isArray(result.profiles) ? result.profiles : [];

        if (state.selectedGame && state.selectedGame.name === gameName)
        {
            state.selectedGame = state.gameProfiles[0] || null;
        }

        els.gameProfilesHint.textContent = "Profil supprimé.";
        render();
    }
    catch
    {
        els.gameProfilesHint.textContent = "Erreur pendant la suppression.";
    }
}

function selectGameProfile(gameName)
{
    const selectedProfile = state.gameProfiles.find((profile) =>
    {
        return profile.name === gameName;
    }) || null;

    state.selectedGame = selectedProfile;

    if (selectedProfile)
    {
        els.gameProfilesHint.textContent = `Profil sélectionné : ${selectedProfile.name}`;
    }
    if (window.overlayApi && typeof window.overlayApi.setProfileName === "function")
    {
        window.overlayApi.setProfileName(selectedProfile.name);
    }

    render();
}

function canLaunch()
{
    if (state.activeMod !== "game")
    {
        return true;
    }

    return Boolean(state.selectedGame);
}

async function launchPaul()
{
    if (!canLaunch())
    {
        els.launchHint.textContent = "Sélectionne un profil de jeu avant de lancer PAUL.";
        return;
    }

    if (!window.paulApi || typeof window.paulApi.launch !== "function")
    {
        return;
    }

    els.launchButton.disabled  = true;
    els.launchHint.textContent = "Lancement en cours...";

    try
    {
        const payload =
        {
            inputMode: state.inputMode,
            mod:       state.activeMod
        };

        if (state.activeMod === "game" && state.selectedGame)
        {
            payload.gameName = state.selectedGame.name;
        }

        const result = await window.paulApi.launch(payload);

        if (!result || result.ok !== true)
        {
            els.launchHint.textContent = "Échec du lancement.";
            return;
        }

        if (!result || result.ok !== true)
        {
            els.launchHint.textContent = "Échec du lancement.";
            return;
        }

        state.launchCount = result.usage?.launchCount ?? state.launchCount;
        state.webRequests = result.usage?.webRequests ?? state.webRequests;
        state.history     = Array.isArray(result.launchHistory) ? result.launchHistory : [];
        render();
    }
    catch
    {
        els.launchHint.textContent = "Erreur pendant le lancement.";
    }
    finally
    {
        els.launchButton.disabled = false;
    }
}

async function loadUsage()
{
    if (!window.paulApi || typeof window.paulApi.getUsage !== "function")
    {
        return;
    }

    try
    {
        const result = await window.paulApi.getUsage();

        if (result?.ok && result.usage)
        {
            state.webRequests = result.usage.webRequests ?? 0;
            state.launchCount = result.usage.launchCount ?? 0;
        }

        render();
    }
    catch
    {
        // On peut afficher un hint si tu veux, mais ce n’est pas obligatoire.
    }
}

function clearHistory()
{
    state.history = [];
    render();
}

function toggleTheme()
{
    state.theme = state.theme === "dark" ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", state.theme);
    els.themeToggle.textContent = state.theme === "dark" ? "☼" : "☾";
}

function renderModes()
{
    const isText  = state.inputMode === "text";
    const isVoice = state.inputMode === "voice";

    els.textModeButton.classList.toggle ("is-active", isText);
    els.voiceModeButton.classList.toggle("is-active", isVoice);
}

function renderMods()
{
    const activeMod = modMap[state.activeMod];

    els.activeModBadge.textContent = activeMod.label;

    els.modButtons.forEach((button) =>
    {
        const buttonMod = button.getAttribute("data-mod");

        button.classList.toggle("is-active", buttonMod === state.activeMod);
    });
}

function renderGameProfiles()
{
    const isGameMod = state.activeMod === "game";

    els.gameProfilesPanel.classList.toggle("is-hidden", !isGameMod);

    if (!isGameMod)
    {
        return;
    }

    els.newGameForm.classList.toggle("is-hidden", !state.isNewGameOpen);

    if (state.gameProfiles.length === 0)
    {
        els.gameProfilesList.innerHTML = '<li class="history-empty">Aucun profil de jeu pour l’instant.</li>';
        return;
    }

    els.gameProfilesList.innerHTML = state.gameProfiles
        .map((profile) =>
        {
            const isActive        = state.selectedGame && state.selectedGame.name === profile.name;
            const folderLabel     = profile.folderPath ? profile.folderPath : "Aucun dossier sélectionné";
            const buttonLabel     = isActive ? "Sélectionné" : "Choisir";

            return `
                <li class="game-profile-item">
                    <div class="game-profile-main">
                        <span class="game-profile-name">${profile.name}</span>
                        <span class="game-profile-path">${folderLabel}</span>
                    </div>

                    <div class="game-profile-actions">
                        <button
                            class="game-profile-button ${isActive ? "is-active" : ""}"
                            type="button"
                            data-game-profile="${profile.name}"
                        >
                            ${buttonLabel}
                        </button>

                        <button
                            class="game-profile-delete-button"
                            type="button"
                            data-delete-game-profile="${profile.name}"
                        >
                            Supprimer
                        </button>
                    </div>
                </li>
            `;
        })
        .join("");
}

function renderQuota()
{
    const remaining   = Math.max(state.monthlyLimit - state.webRequests, 0);
    const usedPercent = (state.webRequests / state.monthlyLimit) * 100;

    els.quotaValue.textContent   = String(remaining);
    els.quotaText.textContent    = `${state.webRequests} demande${state.webRequests > 1 ? "s" : ""} web utilisée${state.webRequests > 1 ? "s" : ""} sur ${state.monthlyLimit} · ${state.launchCount} lancement${state.launchCount > 1 ? "s" : ""}.`;
    els.quotaBarFill.style.width = `${usedPercent}%`;
}

function renderHistory()
{
    if (state.history.length === 0)
    {
        els.historyList.innerHTML = '<li class="history-empty">Aucune utilisation pour l’instant.</li>';
        return;
    }

    els.historyList.innerHTML = state.history
        .map((item) =>
        {
            const modeLabel = item.inputMode === "voice" ? "Vocal" : "Texte";

            const modLabel = item.mod === "game"
                ? "Jeu"
                : item.mod === "dev"
                    ? "Développement"
                    : "Personnel";

            const profileLabel = item.gameName ?? "Aucun profil";

            const launchedDate = new Date(item.launchedAt);
            const timeLabel = Number.isNaN(launchedDate.getTime())
                ? "Date inconnue"
                : launchedDate.toLocaleTimeString("fr-FR",
                {
                    hour:   "2-digit",
                    minute: "2-digit"
                });

            return `
                <li class="history-item">
                    <span>${modeLabel} · ${modLabel}</span>
                    <span class="history-meta">${profileLabel} · ${timeLabel}</span>
                </li>
            `;
        })
        .join("");
}

function renderLaunchState()
{
    if (state.activeMod === "game" && !state.selectedGame)
    {
        els.launchHint.textContent = "Sélectionne un profil de jeu avant le lancement.";
        return;
    }

    if (state.activeMod === "game" && state.selectedGame)
    {
        els.launchHint.textContent = `Profil actif : ${state.selectedGame.name}`;
        return;
    }

    els.launchHint.textContent = state.inputMode === "voice"
        ? "Le mode vocal est sélectionné avant lancement."
        : "Le mode texte est sélectionné avant lancement.";
}

function bindProfileEvents()
{
    els.gameProfilesList.addEventListener("click", (event) =>
    {
        const target = event.target;

        if (!(target instanceof HTMLElement))
        {
            return;
        }

        const selectButton = target.closest("[data-game-profile]");
        const deleteButton = target.closest("[data-delete-game-profile]");

        if (selectButton instanceof HTMLElement)
        {
            const gameName = selectButton.getAttribute("data-game-profile");

            if (gameName)
            {
                selectGameProfile(gameName);
            }

            return;
        }

        if (deleteButton instanceof HTMLElement)
        {
            const gameName = deleteButton.getAttribute("data-delete-game-profile");

            if (gameName)
            {
                deleteGameProfile(gameName);
            }

            return;
        }
    });
}

function render()
{
    renderModes();
    renderMods();
    renderGameProfiles();
    renderQuota();
    renderHistory();
    renderLaunchState();
}

els.themeToggle.addEventListener("click", toggleTheme);

els.textModeButton.addEventListener("click", () =>
{
    setInputMode("text");
});

els.voiceModeButton.addEventListener("click", () =>
{
    setInputMode("voice");
});

els.launchButton.addEventListener("click", () =>
{
    launchPaul();
});

els.clearHistory.addEventListener("click", () =>
{
    clearHistory();
});

els.newGameToggleButton.addEventListener("click", () =>
{
    toggleNewGameForm();
});

els.createGameButton.addEventListener("click", () =>
{
    createGameProfile();
});

els.modButtons.forEach((button) =>
{
    button.addEventListener("click", () =>
    {
        const modKey = button.getAttribute("data-mod");

        if (!modKey)
        {
            return;
        }

        selectMod(modKey);
    });
});

document.documentElement.setAttribute("data-theme", state.theme);

bindProfileEvents();
loadProfiles();
loadUsage();
render();