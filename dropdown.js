document.addEventListener("click", (event) =>
{
    for (const list of document.querySelectorAll(".dropdown-list"))
    {
        if (!list.parentElement.contains(event.target))
        {
            list.classList.add("is-hidden");
        }
    }
});


function createDropdown(options, initialValue, onChange)
{
    const container = document.createElement("div");
    const toggle    = document.createElement("button");
    const list      = document.createElement("div");

    container.className = "dropdown";
    toggle.className    = "dropdown-toggle";
    toggle.type         = "button";
    list.className      = "dropdown-list is-hidden";

    let value = initialValue;

    function render()
    {
        const selected = options.find((option) => option.value === value);

        toggle.textContent = `${selected ? selected.label : "—"} ▾`;

        list.replaceChildren(...options.map((option) =>
        {
            const button = document.createElement("button");

            button.className   = option.value === value ? "dropdown-option is-selected" : "dropdown-option";
            button.type        = "button";
            button.textContent = option.label;

            button.addEventListener("click", () =>
            {
                value = option.value;
                list.classList.add("is-hidden");
                render();
                onChange(value);
            });

            return button;
        }));
    }

    toggle.addEventListener("click", () =>
    {
        list.classList.toggle("is-hidden");
    });

    container.append(toggle, list);
    render();

    return container;
}
