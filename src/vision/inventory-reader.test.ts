import assert           from "node:assert/strict";
import fs               from "node:fs";
import path             from "node:path";
import { describe, it } from "node:test";

import { parseDigitTemplates }                    from "./digits";
import type { DigitTemplates }                    from "./digits";
import { drawIcon, drawStackCount, renderFakeGui } from "./fake-gui";
import type { FakeGuiOptions }                    from "./fake-gui";
import { detectGui }                              from "./gui-detect";
import { learnIconAt, readInventory }             from "./inventory-reader";
import type { GuiDetection, RawImage, SlotRect } from "./vision-types";



const parsed = parseDigitTemplates(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "games", "minecraft", "digits.json"), "utf-8")));

const DIGITS: DigitTemplates = parsed.value as DigitTemplates;

const PALETTE: Record<string, [number, number, number]> =
{
    a: [214, 160, 130],
    b: [150, 96, 74],
    c: [250, 220, 200],
    d: [38, 38, 42],
    e: [96, 96, 110],
    f: [40, 190, 120],
    g: [220, 60, 60]
};



function pattern(seed: number): string[]
{
    const letters = "abcdefg";

    return Array.from({ length: 16 }, (_, row) =>
    {
        return Array.from({ length: 16 }, (_, column) =>
        {
            const edge = row < 2 || row > 13 || column < 2 || column > 13;

            return edge && (row + column + seed) % 3 === 0 ? "." : letters[(row * 5 + column * 3 + seed * 11 + Math.floor(row / 4) * seed) % letters.length];
        }).join("");
    });
}



const ITEMS = { raw_iron: pattern(1), coal: pattern(4), emerald: pattern(9) };



function scene(furnace = false): { image: RawImage; detection: GuiDetection } & { scale: number }
{
    const options: FakeGuiOptions = { width: 1920, height: 1080, scale: 4, originX: 610, originY: 225, furnace, items: false };
    const image = renderFakeGui(options);

    return { image, detection: detectGui(image), scale: 4 };
}



function place(image: RawImage, rect: SlotRect, scale: number, item: keyof typeof ITEMS, count: number): void
{
    drawIcon(image, rect, scale, ITEMS[item], PALETTE);

    if (count > 1)
    {
        drawStackCount(image, rect, scale, String(count), DIGITS);
    }
}



function learned(image: RawImage, detection: GuiDetection, slots: Record<string, number>): Map<string, number[]>
{
    const templates = new Map<string, number[]>();

    for (const [itemId, index] of Object.entries(slots))
    {
        const result = learnIconAt(image, detection, index);

        assert.equal(result.ok, true, itemId);

        if (result.ok)
        {
            templates.set(itemId, result.cells);
        }
    }

    return templates;
}



// ---------------------------------------------------------------------------
// Lecture de l'inventaire
// ---------------------------------------------------------------------------

describe("lecture de l'inventaire", () =>
{
    it("additionne les quantités de chaque item sur tout l'inventaire", () =>
    {
        const { image, detection, scale } = scene();

        place(image, detection.inventory[0],  scale, "raw_iron", 52);
        place(image, detection.inventory[1],  scale, "raw_iron", 12);
        place(image, detection.inventory[9],  scale, "coal", 64);
        place(image, detection.inventory[27], scale, "raw_iron", 1);
        place(image, detection.inventory[35], scale, "coal", 9);

        const known   = learned(image, detection, { raw_iron: 0, coal: 9 });
        const reading = readInventory(image, detection, DIGITS, known);

        assert.deepEqual(reading.totals, { raw_iron: 65, coal: 73 });
        assert.equal(reading.freeSlots, 31);
        assert.deepEqual(reading.unknownSlots, []);
        assert.deepEqual(reading.unreadableSlots, []);
    });

    it("lit chaque emplacement : vide, item avec quantité, item seul", () =>
    {
        const { image, detection, scale } = scene();

        place(image, detection.inventory[3], scale, "coal", 37);
        place(image, detection.inventory[4], scale, "coal", 1);

        const known   = learned(image, detection, { coal: 3 });
        const reading = readInventory(image, detection, DIGITS, known);

        assert.deepEqual(reading.slots[3], { index: 3, kind: "item", itemId: "coal", count: 37 });
        assert.deepEqual(reading.slots[4], { index: 4, kind: "item", itemId: "coal", count: 1 });
        assert.deepEqual(reading.slots[5], { index: 5, kind: "empty" });
        assert.equal(reading.slots.length, 36);
    });

    it("signale les emplacements dont l'item n'a jamais été appris", () =>
    {
        const { image, detection, scale } = scene();

        place(image, detection.inventory[0], scale, "raw_iron", 20);
        place(image, detection.inventory[1], scale, "emerald", 7);
        place(image, detection.inventory[2], scale, "emerald", 3);

        const known   = learned(image, detection, { raw_iron: 0 });
        const reading = readInventory(image, detection, DIGITS, known);

        assert.deepEqual(reading.totals, { raw_iron: 20 });
        assert.deepEqual(reading.unknownSlots, [1, 2]);
    });

    it("signale une quantité illisible sans l'ajouter aux totaux", () =>
    {
        const { image, detection, scale } = scene();

        place(image, detection.inventory[0], scale, "raw_iron", 20);
        place(image, detection.inventory[1], scale, "raw_iron", 30);

        const known = learned(image, detection, { raw_iron: 0 });
        const rect  = detection.inventory[1];

        for (let y = rect.y + 8 * scale; y < rect.y + 14 * scale; y += 1)
        {
            for (let x = rect.x + 5 * scale; x < rect.x + 14 * scale; x += 1)
            {
                const offset = (y * image.width + x) * 4;

                image.data[offset] = 255;
                image.data[offset + 1] = 255;
                image.data[offset + 2] = 255;
            }
        }

        const reading = readInventory(image, detection, DIGITS, known);

        assert.deepEqual(reading.unreadableSlots, [1]);
        assert.deepEqual(reading.totals, { raw_iron: 20 });
    });

    it("sans formes de chiffres, les quantités restent inconnues mais les items sont reconnus", () =>
    {
        const { image, detection, scale } = scene();

        place(image, detection.inventory[0], scale, "coal", 12);

        const known   = learned(image, detection, { coal: 0 });
        const reading = readInventory(image, detection, null, known);

        assert.deepEqual(reading.slots[0], { index: 0, kind: "item", itemId: "coal", count: null });
        assert.deepEqual(reading.unreadableSlots, [0]);
    });

    it("lit l'entrée, le carburant et la sortie d'un four ouvert", () =>
    {
        const { image, detection, scale } = scene(true);

        assert.ok(detection.furnace);

        place(image, detection.inventory[5], scale, "raw_iron", 64);
        place(image, detection.inventory[6], scale, "coal", 8);

        const furnace = detection.furnace as NonNullable<GuiDetection["furnace"]>;

        place(image, furnace.input,  scale, "raw_iron", 32);
        place(image, furnace.fuel,   scale, "coal", 5);
        place(image, furnace.output, scale, "raw_iron", 11);

        const known   = learned(image, detection, { raw_iron: 5, coal: 6 });
        const reading = readInventory(image, detection, DIGITS, known);

        assert.deepEqual(reading.furnace?.input,  { index: 0, kind: "item", itemId: "raw_iron", count: 32 });
        assert.deepEqual(reading.furnace?.fuel,   { index: 1, kind: "item", itemId: "coal", count: 5 });
        assert.deepEqual(reading.furnace?.output, { index: 2, kind: "item", itemId: "raw_iron", count: 11 });
        assert.deepEqual(reading.totals, { raw_iron: 64, coal: 8 });
    });

    it("un four vide est lu comme vide", () =>
    {
        const { image, detection } = scene(true);
        const reading = readInventory(image, detection, DIGITS, new Map());

        assert.equal(reading.furnace?.input.kind, "empty");
        assert.equal(reading.furnace?.fuel.kind, "empty");
        assert.equal(reading.furnace?.output.kind, "empty");
    });

    it("un inventaire sans four n'a pas de lecture de four", () =>
    {
        const { image, detection } = scene(false);

        assert.equal(readInventory(image, detection, DIGITS, new Map()).furnace, null);
    });
});



// ---------------------------------------------------------------------------
// Apprentissage d'un item
// ---------------------------------------------------------------------------

describe("apprentissage d'un item", () =>
{
    it("garde l'apparence d'un item placé dans un emplacement", () =>
    {
        const { image, detection, scale } = scene();

        place(image, detection.inventory[10], scale, "emerald", 5);

        const result = learnIconAt(image, detection, 10);

        assert.equal(result.ok, true);
        assert.equal(result.ok && result.cells.length, 16 * 16 * 3);
    });

    it("refuse un emplacement vide avec un message clair", () =>
    {
        const { image, detection } = scene();
        const result = learnIconAt(image, detection, 4);

        assert.equal(result.ok, false);
        assert.match(result.ok ? "" : result.message, /emplacement 5 est vide/);
    });

    it("refuse un emplacement qui n'existe pas", () =>
    {
        const { image, detection } = scene();

        assert.equal(learnIconAt(image, detection, 40).ok, false);
        assert.equal(learnIconAt(image, detection, -1).ok, false);
    });
});
