import type { OverlayCard } from "../app-types";
import type { InventoryReading, SlotReading } from "./inventory-reader";
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



export type InventoryContext =
{
    reading:        InventoryReading;
    nameOf:         (itemId: string) => string;
    learnedCount:   number;
    hasDigits:      boolean;
    missingDigits:  string[];
};



function describeSlot(slot: SlotReading, nameOf: (itemId: string) => string): string
{
    if (slot.kind === "empty")
    {
        return "vide";
    }

    const quantity = slot.count === null ? "?" : String(slot.count);

    return slot.itemId === null ? `item inconnu ×${quantity}` : `${nameOf(slot.itemId)} ×${quantity}`;
}



function listSlots(indexes: number[]): string
{
    return indexes.map((index: number) => index + 1).join(", ");
}



function describeInventory(context: InventoryContext): { stats: OverlayCard["stats"]; notes: OverlayCard["notes"] }
{
    const { reading, nameOf } = context;
    const stats: OverlayCard["stats"] = [];
    const notes: OverlayCard["notes"] = [];

    const totals = Object.entries(reading.totals).map(([itemId, count]) => `${nameOf(itemId)} ×${count}`);

    stats.push({ label: "Inventaire lu", value: totals.length > 0 ? totals.join(" · ") : "aucun item reconnu" });
    stats.push({ label: "Emplacements libres", value: String(reading.freeSlots) });

    if (reading.furnace)
    {
        const { input, fuel, output } = reading.furnace;

        stats.push({
            label: "Four ouvert",
            value: `entrée ${describeSlot(input, nameOf)} · carburant ${describeSlot(fuel, nameOf)} · sortie ${describeSlot(output, nameOf)}`
        });
    }

    if (context.learnedCount === 0)
    {
        notes.push({
            level:   "warning",
            message: "PAUL ne connaît encore aucun item. Apprends-lui ceux que tu utilises (Raw Iron, Coal…) dans le panneau Lecture du jeu, étape 2."
        });
    }
    else if (reading.unknownSlots.length > 0)
    {
        notes.push({
            level:   "warning",
            message: `Item inconnu dans ${reading.unknownSlots.length} emplacement(s) : n° ${listSlots(reading.unknownSlots)}. Apprends-le dans le panneau Lecture du jeu, étape 2.`
        });
    }

    if (reading.unreadableSlots.length > 0)
    {
        const reason = !context.hasDigits
            ? " Les formes des chiffres de ce jeu ne sont pas disponibles."
            : context.missingDigits.length > 0
                ? ` PAUL ne connaît pas encore le chiffre ${context.missingDigits.join(", ")} : une quantité qui le contient reste illisible.`
                : "";

        notes.push({ level: "warning", message: `Quantité illisible : emplacement(s) n° ${listSlots(reading.unreadableSlots)}.${reason}` });
    }

    return { stats, notes };
}



export function inventoryLines(context: InventoryContext): string[]
{
    const described = describeInventory(context);

    return [
        ...described.stats.map((stat) => `${stat.label} : ${stat.value}`),
        ...described.notes.map((note) => note.message)
    ];
}



export function describeCapture(meta: CaptureMeta, detection: GuiDetection, inventory?: InventoryContext): OverlayCard
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

        if (inventory)
        {
            const described = describeInventory(inventory);

            stats.push(...described.stats);
            notes.push(...described.notes);
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
