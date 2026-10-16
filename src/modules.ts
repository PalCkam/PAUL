export type PaulModule =
{
    id:    string;
    label: string;
    icon:  string;
};



export const GAME_MODULES: PaulModule[] =
[
    { id: "notes", label: "Notes", icon: "notes" },
    { id: "tasks", label: "Tâches", icon: "tasks" },
    { id: "shortcuts", label: "Raccourcis", icon: "shortcuts" },
    { id: "vision", label: "Lecture", icon: "vision" }
];
