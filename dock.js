const dockEl = document.getElementById("dock");


const ICONS =
{
    notes: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 3h9l4 4v14H6z"></path>
            <path d="M15 3v4h4"></path>
            <path d="M9 12h7M9 16h7"></path>
        </svg>
    `,

    tasks: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 7l2 2 3-3"></path>
            <path d="M12 7h8"></path>
            <path d="M4 16l2 2 3-3"></path>
            <path d="M12 16h8"></path>
        </svg>
    `,

    vision: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"></path>
            <circle cx="12" cy="12" r="2.6"></circle>
        </svg>
    `,

    shortcuts: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="6" width="18" height="12" rx="2"></rect>
            <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"></path>
        </svg>
    `
};


function createModuleButton(module)
{
    const button = document.createElement("button");
    const label  = document.createElement("span");

    button.className = "dock-button";
    button.type      = "button";

    button.setAttribute("data-module", module.id);
    button.title     = module.label;

    button.insertAdjacentHTML("afterbegin", ICONS[module.icon] ?? "");

    label.textContent = module.label;
    button.appendChild(label);

    button.addEventListener("click", () =>
    {
        window.dockApi.openModule(module.id);
    });

    return button;
}


function markOpenModules(openIds)
{
    for (const button of dockEl.querySelectorAll(".dock-button"))
    {
        button.classList.toggle("is-open", openIds.includes(button.getAttribute("data-module")));
    }
}


window.dockApi.onOpenPanelsChanged(markOpenModules);

window.dockApi.getModules().then(async (modules) =>
{
    dockEl.replaceChildren(...modules.map(createModuleButton));

    markOpenModules(await window.dockApi.getOpenPanels());
});
