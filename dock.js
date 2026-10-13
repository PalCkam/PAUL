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
    `
};


function createModuleButton(module)
{
    const button = document.createElement("button");
    const label  = document.createElement("span");

    button.className = "dock-button";
    button.type      = "button";
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


window.dockApi.getModules().then((modules) =>
{
    dockEl.replaceChildren(...modules.map(createModuleButton));
});
