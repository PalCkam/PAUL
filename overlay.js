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


window.overlayApi.onPinnedNotesChanged(renderPinnedNotes);

window.overlayApi.getPinnedNotes().then(renderPinnedNotes);
