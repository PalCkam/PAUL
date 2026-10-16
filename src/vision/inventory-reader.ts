import { readCount } from "./digits";
import type { DigitTemplates } from "./digits";
import { matchIcon, sampleIcon } from "./icons";
import type { GuiDetection, RawImage, SlotRect } from "./vision-types";



export type SlotReading =
    | { index: number; kind: "empty" }
    | { index: number; kind: "item"; itemId: string | null; count: number | null };



export type FurnaceReading =
{
    input:  SlotReading;
    fuel:   SlotReading;
    output: SlotReading;
};



export type InventoryReading =
{
    slots:           SlotReading[];
    furnace:         FurnaceReading | null;
    totals:          Record<string, number>;
    unknownSlots:    number[];
    unreadableSlots: number[];
    freeSlots:       number;
};



export type LearnResult =
    | { ok: true;  cells: number[] }
    | { ok: false; message: string };



function readSlot(
    image:     RawImage,
    rect:      SlotRect,
    scale:     number,
    index:     number,
    digits:    DigitTemplates | null,
    templates: Map<string, number[]>
): SlotReading
{
    const sample = sampleIcon(image, rect);

    if (sample.empty)
    {
        return { index, kind: "empty" };
    }

    const match = matchIcon(sample.cells, templates);
    const count = digits ? readCount(image, rect, scale, digits).count : null;

    return { index, kind: "item", itemId: match.itemId, count };
}



export function readInventory(
    image:     RawImage,
    detection: GuiDetection,
    digits:    DigitTemplates | null,
    templates: Map<string, number[]>
): InventoryReading
{
    const slots = detection.inventory.map((rect: SlotRect, index: number) =>
    {
        return readSlot(image, rect, detection.scale, index, digits, templates);
    });

    const totals: Record<string, number> = {};
    const unknownSlots: number[]    = [];
    const unreadableSlots: number[] = [];

    for (const slot of slots)
    {
        if (slot.kind !== "item")
        {
            continue;
        }

        if (slot.itemId === null)
        {
            unknownSlots.push(slot.index);
        }
        else if (slot.count === null)
        {
            unreadableSlots.push(slot.index);
        }
        else
        {
            totals[slot.itemId] = (totals[slot.itemId] ?? 0) + slot.count;
        }
    }

    const furnace = detection.furnace
        ? {
            input:  readSlot(image, detection.furnace.input,  detection.scale, 0, digits, templates),
            fuel:   readSlot(image, detection.furnace.fuel,   detection.scale, 1, digits, templates),
            output: readSlot(image, detection.furnace.output, detection.scale, 2, digits, templates)
        }
        : null;

    return {
        slots,
        furnace,
        totals,
        unknownSlots,
        unreadableSlots,
        freeSlots: slots.filter((slot: SlotReading) => slot.kind === "empty").length
    };
}



export function learnIconAt(image: RawImage, detection: GuiDetection, slotIndex: number): LearnResult
{
    const rect = detection.inventory[slotIndex];

    if (!rect)
    {
        return { ok: false, message: `L'emplacement ${slotIndex + 1} n'existe pas (1 à ${detection.inventory.length}).` };
    }

    const sample = sampleIcon(image, rect);

    if (sample.empty)
    {
        return { ok: false, message: `L'emplacement ${slotIndex + 1} est vide : place l'item à apprendre dedans.` };
    }

    return { ok: true, cells: sample.cells };
}
