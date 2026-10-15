import type { OverlayCard } from "../types";
import type { GuiDetection } from "./vision-types";



export type CaptureMeta =
{
    sourceName:       string;
    sourceKind:       "window" | "screen";
    width:            number;
    height:           number;
    fileName:         string;
    analysisFileName: string;
    blank:            boolean;
    notice:           string | null;
};



function describeScale(scale: number): { headline: string; detail: string }
{
    const guiScale = Math.max(1, Math.round(scale));
    const ratio    = scale / guiScale;

    if (Math.abs(ratio - 1) <= 0.01)
    {
        return { headline: `×${guiScale}`, detail: `×${guiScale}` };
    }

    const percent = Math.round(ratio * 100);

    return { headline: `×${guiScale}`, detail: `×${guiScale} (capture à ${percent} % de la taille réelle)` };
}



export function describeCapture(meta: CaptureMeta, detection: GuiDetection): OverlayCard
{
    const source = meta.sourceKind === "window"
        ? `Fenêtre « ${meta.sourceName} » (${meta.width}×${meta.height})`
        : `Écran entier (${meta.width}×${meta.height})`;

    const stats = [{ label: "Source", value: source }];
    const notes: OverlayCard["notes"] = [];

    if (detection.found)
    {
        const screen = detection.screen === "furnace" ? "Four" : "Inventaire";

        const scale = describeScale(detection.scale);

        stats.push({ label: "Échelle de l'interface", value: scale.detail });
        stats.push({
            label: "Emplacements",
            value: detection.hotbar ? `${detection.inventory.length} (27 + barre rapide)` : `${detection.inventory.length} (barre rapide non vue)`
        });

        if (detection.furnace)
        {
            stats.push({ label: "Four", value: "entrée, carburant et sortie repérés" });
        }

        stats.push({ label: "Fichiers", value: `${meta.fileName} · ${meta.analysisFileName}` });

        if (meta.notice)
        {
            notes.push({ level: "warning", message: meta.notice });
        }

        if (!detection.hotbar)
        {
            notes.push({ level: "warning", message: "La barre rapide n'est pas visible : vérifie que l'inventaire est entièrement affiché." });
        }

        return { title: "Capture du jeu", headline: `${screen} reconnu · interface ${scale.headline}`, stats, notes };
    }

    stats.push({ label: "Fichiers", value: meta.fileName });

    if (meta.blank)
    {
        notes.push({ level: "warning", message: "L'image est noire : le jeu est sans doute en plein écran exclusif. Passe en plein écran fenêtré (borderless) pour la capture." });
    }

    if (meta.notice)
    {
        notes.push({ level: "warning", message: meta.notice });
    }
    else if (meta.sourceKind === "screen")
    {
        notes.push({ level: "warning", message: "Fenêtre du jeu introuvable : tout l'écran a été capturé." });
    }

    notes.push({
        level:   "warning",
        message: "Aucun inventaire reconnu. Ouvre ton inventaire (E) ou un four, avec l'interface par défaut, puis recommence. Envoie-moi l'image enregistrée si ça persiste."
    });

    return { title: "Capture du jeu", headline: "Aucun inventaire reconnu", stats, notes };
}



export function cardToLines(card: OverlayCard): string[]
{
    return [
        card.headline,
        ...card.stats.map((stat) => `${stat.label} : ${stat.value}`),
        ...card.notes.map((note) => note.message)
    ];
}
