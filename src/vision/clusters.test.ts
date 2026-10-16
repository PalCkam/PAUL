import assert           from "node:assert/strict";
import fs               from "node:fs";
import path             from "node:path";
import { describe, it } from "node:test";

import { scanIcons }                                from "./clusters";
import { parseDigitTemplates }                      from "./digits";
import type { DigitTemplates }                      from "./digits";
import { drawIcon, drawStackCount, renderFakeGui }  from "./fake-gui";
import { fixtureImage, loadSlotFixtures }           from "./fixtures-helper";
import { detectGui }                                from "./gui-detect";
import { learnIconAt }                              from "./inventory-reader";
import { sampleIcon }                               from "./icons";
import type { GuiDetection, RawImage, SlotRect }    from "./vision-types";



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



const ITEMS = { iron: pattern(1), coal: pattern(4), emerald: pattern(9) };



function scene(furnace = false): { image: RawImage; detection: GuiDetection } & { scale: number }
{
    const image = renderFakeGui({ width: 1920, height: 1080, scale: 4, originX: 610, originY: 225, furnace, items: false });

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



// ---------------------------------------------------------------------------
// Regroupement des icônes
// ---------------------------------------------------------------------------

describe("regroupement des icônes identiques", () =>
{
    it("regroupe les emplacements qui contiennent le même item et additionne les quantités", () =>
    {
        const { image, detection, scale } = scene();

        place(image, detection.inventory[0],  scale, "iron", 52);
        place(image, detection.inventory[1],  scale, "iron", 12);
        place(image, detection.inventory[8],  scale, "iron", 4);
        place(image, detection.inventory[9],  scale, "coal", 64);
        place(image, detection.inventory[20], scale, "emerald", 3);

        const result = scanIcons(image, detection, DIGITS, new Map());

        assert.equal(result.unknown.length, 3);
        assert.deepEqual(result.known, []);

        const [iron, coal, emerald] = result.unknown;

        assert.deepEqual([iron.slots, iron.total], [["n° 1", "n° 2", "n° 9"], 68]);
        assert.deepEqual([coal.slots, coal.total], [["n° 10"], 64]);
        assert.deepEqual([emerald.slots, emerald.total], [["n° 21"], 3]);
        assert.deepEqual(result.unknown.map((cluster) => cluster.key), ["c0", "c1", "c2"]);
    });

    it("sépare les items connus de ceux qu'il faut encore nommer", () =>
    {
        const { image, detection, scale } = scene();

        place(image, detection.inventory[0], scale, "iron", 20);
        place(image, detection.inventory[1], scale, "coal", 5);
        place(image, detection.inventory[2], scale, "iron", 6);

        const known = new Map<string, number[]>();
        const learned = learnIconAt(image, detection, 0);

        assert.equal(learned.ok, true);

        if (learned.ok)
        {
            known.set("raw_iron", learned.cells);
        }

        const result = scanIcons(image, detection, DIGITS, known);

        assert.equal(result.known.length, 1);
        assert.deepEqual(result.known[0], { itemId: "raw_iron", slots: ["n° 1", "n° 3"], total: 26 });
        assert.equal(result.unknown.length, 1);
        assert.deepEqual(result.unknown[0].slots, ["n° 2"]);
        assert.equal(result.unknown[0].total, 5);
    });

    it("inclut les emplacements du four ouvert avec un nom lisible", () =>
    {
        const { image, detection, scale } = scene(true);

        assert.ok(detection.furnace);

        const furnace = detection.furnace as NonNullable<GuiDetection["furnace"]>;

        place(image, detection.inventory[0], scale, "iron", 10);
        place(image, furnace.input,  scale, "iron", 32);
        place(image, furnace.fuel,   scale, "coal", 5);
        place(image, furnace.output, scale, "emerald", 11);

        const result = scanIcons(image, detection, DIGITS, new Map());
        const labels = result.unknown.flatMap((cluster) => cluster.slots);

        assert.deepEqual(labels.sort(), ["carburant du four", "entrée du four", "n° 1", "sortie du four"].sort());
        assert.equal(result.unknown[0].total, 42);
    });

    it("rassemble aussi un item survolé par la souris avec le même item non survolé", () =>
    {
        const { image, detection, scale } = scene();

        place(image, detection.inventory[0], scale, "iron", 10);
        place(image, detection.inventory[1], scale, "iron", 20);

        const rect = detection.inventory[1];

        for (let y = rect.y; y < rect.y + rect.size; y += 1)
        {
            for (let x = rect.x; x < rect.x + rect.size; x += 1)
            {
                const offset = (y * image.width + x) * 4;

                for (let channel = 0; channel < 3; channel += 1)
                {
                    image.data[offset + channel] = Math.round(image.data[offset + channel] * 0.5 + 127);
                }
            }
        }

        const result = scanIcons(image, detection, DIGITS, new Map());

        assert.equal(result.unknown.length, 1);
        assert.deepEqual(result.unknown[0].slots, ["n° 1", "n° 2"]);
    });

    it("garde un total inconnu quand une quantité n'est pas lisible", () =>
    {
        const { image, detection, scale } = scene();

        place(image, detection.inventory[0], scale, "iron", 10);
        place(image, detection.inventory[1], scale, "iron", 20);

        const rect = detection.inventory[1];

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

        assert.equal(scanIcons(image, detection, DIGITS, new Map()).unknown[0].total, null);
    });

    it("renvoie une liste vide pour un inventaire vide", () =>
    {
        const { image, detection } = scene();

        assert.deepEqual(scanIcons(image, detection, DIGITS, new Map()), { unknown: [], known: [] });
    });
});
