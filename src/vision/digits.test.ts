import assert           from "node:assert/strict";
import fs               from "node:fs";
import path             from "node:path";
import { describe, it } from "node:test";

import { parseDigitTemplates, readCount }  from "./digits";
import type { DigitTemplates }             from "./digits";
import { addColorNoise, drawStackCount, resampleNearest } from "./fake-gui";
import { fixtureImage, loadSlotFixtures }               from "./fixtures-helper";
import type { RawImage, SlotRect }         from "./vision-types";



const ROOT = path.join(__dirname, "..", "..");

const parsed = parseDigitTemplates(JSON.parse(fs.readFileSync(path.join(ROOT, "games", "minecraft", "digits.json"), "utf-8")));

assert.deepEqual(parsed.errors, []);

const TEMPLATES = parsed.value as DigitTemplates;

const TEST_TEMPLATES: DigitTemplates = TEMPLATES;



const FIXTURES = loadSlotFixtures();



function blankSlot(scale: number, width = 140, height = 140): { image: RawImage; slot: SlotRect }
{
    const image: RawImage = { width, height, data: new Uint8Array(width * height * 4) };

    for (let offset = 0; offset < image.data.length; offset += 4)
    {
        image.data[offset] = 139;
        image.data[offset + 1] = 139;
        image.data[offset + 2] = 139;
        image.data[offset + 3] = 255;
    }

    return { image, slot: { x: 30, y: 30, size: Math.round(16 * scale) } };
}



// ---------------------------------------------------------------------------
// Formes des chiffres
// ---------------------------------------------------------------------------

describe("formes des chiffres", () =>
{
    it("le fichier fourni décrit les dix chiffres", () =>
    {
        assert.deepEqual(Object.keys(TEMPLATES).sort(), ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    });

    it("refuse un fichier mal formé", () =>
    {
        assert.ok(parseDigitTemplates(null).errors.length > 0);
        assert.ok(parseDigitTemplates({ "10": [".....", ".....", ".....", ".....", ".....", ".....", "....."] }).errors.length > 0);
        assert.ok(parseDigitTemplates({ "1": ["....."] }).errors.length > 0);
        assert.ok(parseDigitTemplates({ "1": [".....", ".....", ".....", ".....", ".....", ".....", "...x."] }).errors.length > 0);
    });

    it("deux chiffres n'ont jamais la même forme", () =>
    {
        const shapes = Object.values(TEST_TEMPLATES).map((rows) => rows.join(""));

        assert.equal(new Set(shapes).size, shapes.length);
    });
});



// ---------------------------------------------------------------------------
// Lecture sur des extraits réels de captures Lunar Client
// ---------------------------------------------------------------------------

describe("lecture des quantités sur de vraies captures", () =>
{
    const stacks = FIXTURES.filter((fixture) => fixture.kind === "item");

    it("dispose d'extraits de stacks aux quantités variées", () =>
    {
        assert.ok(stacks.length >= 12);
        assert.ok(new Set(stacks.map((fixture) => fixture.count)).size >= 9);
    });

    for (const fixture of stacks)
    {
        it(`lit ${fixture.count} sur ${fixture.name}`, () =>
        {
            const reading = readCount(fixtureImage(fixture), fixture.rect, fixture.scale, TEMPLATES);

            assert.deepEqual(reading, { count: fixture.count, unreadable: false });
        });
    }

    it("un emplacement vide n'a aucun chiffre", () =>
    {
        for (const fixture of FIXTURES.filter((candidate) => candidate.kind === "empty"))
        {
            assert.equal(readCount(fixtureImage(fixture), fixture.rect, fixture.scale, TEMPLATES).count, 1, fixture.name);
        }
    });
});



// ---------------------------------------------------------------------------
// Lecture sur des images fabriquées
// ---------------------------------------------------------------------------

describe("lecture des quantités sur des images fabriquées", () =>
{
    const counts = ["2", "9", "10", "12", "16", "21", "34", "47", "58", "63", "64", "70", "75", "87", "99"];

    it("lit toutes les quantités de 2 à 99 à plusieurs échelles", () =>
    {
        for (const scale of [2, 3, 4, 5])
        {
            for (let value = 2; value <= 99; value += 1)
            {
                const { image, slot } = blankSlot(scale);

                drawStackCount(image, slot, scale, String(value), TEST_TEMPLATES);

                assert.deepEqual(readCount(image, slot, scale, TEST_TEMPLATES), { count: value, unreadable: false }, `${value} à l'échelle ${scale}`);
            }
        }
    });

    it("lit encore quand l'emplacement est décalé d'un ou deux pixels", () =>
    {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 1], [-2, -1]])
        {
            for (const value of counts)
            {
                const { image, slot } = blankSlot(4);

                drawStackCount(image, slot, 4, value, TEST_TEMPLATES);

                const shifted = { ...slot, x: slot.x + dx, y: slot.y + dy };

                assert.equal(readCount(image, shifted, 4, TEST_TEMPLATES).count, Number(value), `${value} décalé de ${dx},${dy}`);
            }
        }
    });

    it("lit sur une capture réduite à 98,6 % et avec un peu de bruit", () =>
    {
        for (const value of counts)
        {
            const { image, slot } = blankSlot(4, 160, 160);

            drawStackCount(image, slot, 4, value, TEST_TEMPLATES);

            const reduced = addColorNoise(resampleNearest(image, 158, 158), 6);
            const rect    = { x: Math.round(slot.x * 158 / 160), y: Math.round(slot.y * 158 / 160), size: 63 };

            assert.equal(readCount(reduced, rect, 4 * 158 / 160, TEST_TEMPLATES).count, Number(value), value);
        }
    });

    it("un item seul, sans nombre, vaut 1", () =>
    {
        const { image, slot } = blankSlot(4);

        assert.deepEqual(readCount(image, slot, 4, TEST_TEMPLATES), { count: 1, unreadable: false });
    });

    it("lit les quantités qui contiennent un 7 (7, 17, 27, 57, 70, 77)", () =>
    {
        for (const value of ["7", "17", "27", "57", "70", "77"])
        {
            const { image, slot } = blankSlot(4);

            drawStackCount(image, slot, 4, value, TEMPLATES);

            assert.deepEqual(readCount(image, slot, 4, TEMPLATES), { count: Number(value), unreadable: false }, value);
        }
    });

    it("sans la forme du 7, une quantité qui le contient reste illisible plutôt que mal lue", () =>
    {
        const { 7: _seven, ...withoutSeven } = TEMPLATES;

        for (const value of ["7", "17", "27", "70"])
        {
            const { image, slot } = blankSlot(4);

            drawStackCount(image, slot, 4, value, TEMPLATES);

            assert.deepEqual(readCount(image, slot, 4, withoutSeven), { count: null, unreadable: true }, value);
        }
    });

    it("des taches blanches qui ne ressemblent pas à un chiffre rendent la quantité illisible", () =>
    {
        const { image, slot } = blankSlot(4);

        for (let y = slot.y + 40; y < slot.y + 60; y += 1)
        {
            for (let x = slot.x + 30; x < slot.x + 60; x += 1)
            {
                const offset = (y * image.width + x) * 4;

                image.data[offset] = 255;
                image.data[offset + 1] = 255;
                image.data[offset + 2] = 255;
            }
        }

        assert.deepEqual(readCount(image, slot, 4, TEMPLATES), { count: null, unreadable: true });
    });
});
