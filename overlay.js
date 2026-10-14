const container = document.getElementById("pinnedNotes");


function createNoteElement(note)
{
    const noteEl    = document.createElement("div");
    const titleEl   = document.createElement("div");
    const contentEl = document.createElement("div");

    noteEl.className    = "pinned-note";
    titleEl.className   = "pinned-note-title";
    contentEl.className = "pinned-note-content";

    titleEl.textContent   = note.title;
    contentEl.textContent = note.content;

    noteEl.appendChild(titleEl);

    if (note.content)
    {
        noteEl.appendChild(contentEl);
    }

    return noteEl;
}


function renderPinnedNotes(notes)
{
    container.replaceChildren(...notes.map(createNoteElement));
}


const taskCardEl = document.getElementById("taskCard");


function createCardLine(className, text)
{
    const line = document.createElement("div");

    line.className   = className;
    line.textContent = text;

    return line;
}


function renderTaskCard(card)
{
    if (!card)
    {
        taskCardEl.classList.add("is-hidden");
        taskCardEl.replaceChildren();
        return;
    }

    taskCardEl.replaceChildren(
        createCardLine("task-card-title", card.title),
        createCardLine("task-card-headline", card.headline),
        ...card.stats.map((stat) => createCardLine("task-card-line", `${stat.label} : ${stat.value}`)),
        ...card.notes.map((note) => createCardLine("task-card-warning", note.message)),
        createCardLine("task-card-hint", "Pavé 0 : fermer (barre F4 ouverte)")
    );

    taskCardEl.classList.remove("is-hidden");
}


window.overlayApi.onPinnedNotesChanged(renderPinnedNotes);
window.overlayApi.onTaskReportChanged(renderTaskCard);

window.overlayApi.getPinnedNotes().then(renderPinnedNotes);
window.overlayApi.getTaskReport().then(renderTaskCard);
