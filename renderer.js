const state =
{
	monthlyLimit: 1000,
	usedRequests: 0,
	activeMod:    "game",
	inputMode:    "text",
	history:      [],
	theme:        "dark"
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
	themeToggle:     document.getElementById("themeToggle"),
	textModeButton:  document.getElementById("textModeButton"),
	voiceModeButton: document.getElementById("voiceModeButton"),
	launchButton:    document.getElementById("launchButton"),
	launchHint:      document.getElementById("launchHint"),
	activeModBadge:  document.getElementById("activeModBadge"),
	quotaValue:      document.getElementById("quotaValue"),
	quotaText:       document.getElementById("quotaText"),
	quotaBarFill:    document.getElementById("quotaBarFill"),
	historyList:     document.getElementById("historyList"),
	clearHistory:    document.getElementById("clearHistory"),
	modButtons:      Array.from(document.querySelectorAll("[data-mod]"))
};

function addHistory()
{
	const activeMod = modMap[state.activeMod];
	const time      = new Date().toLocaleTimeString("fr-FR",
	{
		hour:   "2-digit",
		minute: "2-digit"
	});

	state.history.unshift(
	{
		mode: state.inputMode === "voice" ? "Vocal" : "Texte",
		mod:  activeMod.label,
		time
	});

	state.history = state.history.slice(0, 8);
}

function consumeRequest()
{
	if (state.usedRequests >= state.monthlyLimit)
	{
		render();
		return false;
	}

	state.usedRequests += 1;
	return true;
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

function launchPaul()
{
	if (!consumeRequest())
	{
		return;
	}

	addHistory();
	render();
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

	els.textModeButton.classList.toggle ("is-active", isText );
	els.voiceModeButton.classList.toggle("is-active", isVoice);

	els.launchHint.textContent = isVoice
		? "Le mode vocal est sélectionné avant lancement."
		: "Le mode texte est sélectionné avant lancement.";
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

function renderQuota()
{
	const remaining   = Math.max(state.monthlyLimit - state.usedRequests, 0);
	const usedPercent = (state.usedRequests / state.monthlyLimit) * 100;

	els.quotaValue.textContent     = String(remaining);
	els.quotaText.textContent      = `${state.usedRequests} requête${state.usedRequests > 1 ? "s" : ""} utilisée${state.usedRequests > 1 ? "s" : ""} sur ${state.monthlyLimit}.`;
	els.quotaBarFill.style.width   = `${usedPercent}%`;
	els.launchButton.disabled      = remaining <= 0;
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
			return `
				<li class="history-item">
					<span>${item.mode} · ${item.mod}</span>
					<span class="history-meta">${item.time}</span>
				</li>
			`;
		})
		.join("");
}

function render()
{
	renderModes();
	renderMods();
	renderQuota();
	renderHistory();
}

els.themeToggle.addEventListener    ("click", toggleTheme             );
els.textModeButton.addEventListener ("click", () => setInputMode("text"));
els.voiceModeButton.addEventListener("click", () => setInputMode("voice"));
els.launchButton.addEventListener   ("click", launchPaul             );
els.clearHistory.addEventListener   ("click", clearHistory           );

els.modButtons.forEach((button) =>
{
	button.addEventListener("click", () =>
	{
		const modKey = button.getAttribute("data-mod");
		selectMod(modKey);
	});
});

document.documentElement.setAttribute("data-theme", state.theme);
render();