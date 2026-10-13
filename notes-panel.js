const api = window.notesPanelApi;

const profileNameEl    = document.getElementById("profileName");
const pinnedNotesList  = document.getElementById("pinnedNotesList");
const otherNotesList   = document.getElementById("otherNotesList");
const createNoteButton = document.getElementById("createNoteButton");
const closeButton      = document.getElementById("closeButton");

const SAVE_DELAY_MS    = 400;
const DELETE_CONFIRM_MS = 3000;


function createEmptyMessage(text)
{
    const el = document.createElement("div");

    el.className   = "panel-empty";
    el.textContent = text;

    return el;
}


function createNoteCard(note)
{
    const cardEl      = document.createElement("div");
    const titleEl     = document.createElement("input");
    const contentEl   = document.createElement("textarea");
    const actionsEl   = document.createElement("div");
    const pinButton   = document.createElement("button");
    const deleteButton = document.createElement("button");

    let saveTimer    = null;
    let confirmTimer = null;

    cardEl.className = note.pinned ? "panel-note is-pinned" : "panel-note";

    titleEl.className   = "panel-note-title";
    titleEl.value       = note.title;
    titleEl.placeholder = "Titre";

    contentEl.className   = "panel-note-content";
    contentEl.value       = note.content;
    contentEl.placeholder = "Contenu";

    actionsEl.className = "panel-note-actions";

    pinButton.type        = "button";
    pinButton.textContent = note.pinned ? "Désépingler" : "Épingler";

    deleteButton.type        = "button";
    deleteButton.className   = "secondary";
    deleteButton.textContent = "Supprimer";


    async function saveNow()
    {
        clearTimeout(saveTimer);
        saveTimer = null;

        await api.saveNote(note.id,
        {
            title:   titleEl.value,
            content: contentEl.value
        });
    }


    function scheduleSave()
    {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
    }


    titleEl.addEventListener("input", scheduleSave);
    contentEl.addEventListener("input", scheduleSave);


    pinButton.addEventListener("click", async () =>
    {
        await saveNow();

        if (note.pinned)
        {
            await api.unpinNote(note.id);
        }
        else
        {
            await api.pinNote(note.id);
        }

        await loadNotes();
    });


    deleteButton.addEventListener("click", async () =>
    {
        if (confirmTimer === null)
        {
            deleteButton.textContent = "Confirmer ?";
            deleteButton.className   = "danger";

            confirmTimer = setTimeout(() =>
            {
                confirmTimer             = null;
                deleteButton.textContent = "Supprimer";
                deleteButton.className   = "secondary";
            }, DELETE_CONFIRM_MS);

            return;
        }

        clearTimeout(confirmTimer);
        clearTimeout(saveTimer);

        await api.deleteNote(note.id);
        await loadNotes();
    });


    actionsEl.append(pinButton, deleteButton);
    cardEl.append(titleEl, contentEl, actionsEl);

    return cardEl;
}


function renderList(listEl, notes, emptyText)
{
    if (notes.length === 0)
    {
        listEl.replaceChildren(createEmptyMessage(emptyText));
        return;
    }

    listEl.replaceChildren(...notes.map(createNoteCard));
}


async function loadNotes()
{
    const data = await api.listNotes();

    profileNameEl.textContent  = data.profileName ?? "Aucun profil de jeu";
    createNoteButton.disabled  = !data.profileName;

    renderList(
        pinnedNotesList,
        data.notes.filter((note) => note.pinned),
        "Aucune note épinglée."
    );

    renderList(
        otherNotesList,
        data.notes.filter((note) => !note.pinned),
        data.profileName ? "Aucune autre note." : "Sélectionne un profil dans la fenêtre PAUL."
    );
}


createNoteButton.addEventListener("click", async () =>
{
    await api.createNote();
    await loadNotes();
});


closeButton.addEventListener("click", () =>
{
    api.close();
});


api.onRefresh(loadNotes);

loadNotes();
