import assert           from "node:assert/strict";
import { describe, it } from "node:test";

import { annotateDetection } from "./annotate";
import { addColorNoise, breakSlotBorder, renderFakeGui, resampleNearest } from "./fake-gui";
import { detectGui }         from "./gui-detect";
import type { FakeGuiOptions } from "./fake-gui";



function options(extra: Partial<FakeGuiOptions> = {}): FakeGuiOptions
{
    return { width: 1920, height: 1080, scale: 3, originX: 700, originY: 300, furnace: false, items: true, ...extra };
}



// ---------------------------------------------------------------------------
// Reconnaissance de l'interface
// ---------------------------------------------------------------------------

describe("reconnaissance de l'inventaire", () =>
{
    for (const scale of [1, 2, 3, 4, 5, 6])
    {
        it(`reconnaît la grille d'inventaire avec l'interface à l'échelle ×${scale}`, () =>
        {
            const originX = 120 + scale * 20;
            const originY = 40 + scale * 10;
            const detection = detectGui(renderFakeGui(options({ scale, originX, originY })));

            assert.equal(detection.found, true);
            assert.equal(detection.scale, scale);
            assert.equal(detection.screen, "inventory");
            assert.equal(detection.hotbar, true);
            assert.equal(detection.inventory.length, 36);
            assert.deepEqual(detection.inventory[0], { x: originX + 8 * scale, y: originY + 84 * scale, size: 16 * scale });
        });
    }

    it("place chaque emplacement à la bonne position (27 de l'inventaire puis 9 de la barre rapide)", () =>
    {
        const detection = detectGui(renderFakeGui(options({ scale: 3, originX: 700, originY: 300 })));
        const slot = (index: number) => detection.inventory[index];

        assert.deepEqual(slot(8),  { x: 700 + (8 + 8 * 18) * 3,  y: 300 + 84 * 3,  size: 48 });
        assert.deepEqual(slot(9),  { x: 700 + 8 * 3,             y: 300 + 102 * 3, size: 48 });
        assert.deepEqual(slot(26), { x: 700 + (8 + 8 * 18) * 3,  y: 300 + 120 * 3, size: 48 });
        assert.deepEqual(slot(27), { x: 700 + 8 * 3,             y: 300 + 142 * 3, size: 48 });
        assert.deepEqual(slot(35), { x: 700 + (8 + 8 * 18) * 3,  y: 300 + 142 * 3, size: 48 });
    });

    it("reconnaît un four et ses trois emplacements", () =>
    {
        const detection = detectGui(renderFakeGui(options({ scale: 3, furnace: true })));

        assert.equal(detection.screen, "furnace");
        assert.deepEqual(detection.furnace?.input,  { x: 700 + 56 * 3,  y: 300 + 17 * 3, size: 48 });
        assert.deepEqual(detection.furnace?.fuel,   { x: 700 + 56 * 3,  y: 300 + 53 * 3, size: 48 });
        assert.deepEqual(detection.furnace?.output, { x: 700 + 116 * 3, y: 300 + 35 * 3, size: 48 });
    });

    it("distingue le four d'un simple inventaire", () =>
    {
        assert.equal(detectGui(renderFakeGui(options({ furnace: false }))).screen, "inventory");
        assert.equal(detectGui(renderFakeGui(options({ furnace: true }))).screen, "furnace");
    });

    it("fonctionne avec des emplacements vides et avec des items qui les remplissent", () =>
    {
        for (const items of [false, true])
        {
            const detection = detectGui(renderFakeGui(options({ items })));

            assert.equal(detection.found, true, `items=${items}`);
            assert.equal(detection.inventory.length, 36);
        }
    });

    it("fonctionne en 2560×1440 et en 3840×2160", () =>
    {
        const qhd = detectGui(renderFakeGui({ width: 2560, height: 1440, scale: 4, originX: 800, originY: 300, furnace: true, items: true }));
        const uhd = detectGui(renderFakeGui({ width: 3840, height: 2160, scale: 6, originX: 1200, originY: 400, furnace: false, items: true }));

        assert.deepEqual([qhd.found, qhd.scale, qhd.screen], [true, 4, "furnace"]);
        assert.deepEqual([uhd.found, uhd.scale, uhd.screen], [true, 6, "inventory"]);
    });

    it("signale une barre rapide non visible tout en reconnaissant la grille", () =>
    {
        const detection = detectGui(renderFakeGui(options({ hotbar: false })));

        assert.equal(detection.found, true);
        assert.equal(detection.hotbar, false);
        assert.equal(detection.inventory.length, 27);
    });

    it("ne reconnaît rien sur une scène de jeu sans interface", () =>
    {
        const image = renderFakeGui(options());

        for (let y = 0; y < image.height; y += 1)
        {
            for (let x = 0; x < image.width; x += 1)
            {
                const offset = (y * image.width + x) * 4;

                image.data[offset] = 60 + (x % 7);
                image.data[offset + 1] = 100 + (y % 5);
                image.data[offset + 2] = 70;
            }
        }

        assert.equal(detectGui(image).found, false);
    });

    it("ne se laisse pas tromper par de longues barres sombres isolées", () =>
    {
        const detection = detectGui(renderFakeGui({ width: 1920, height: 1080, scale: 3, originX: 700, originY: 300, furnace: false, decoys: true, items: false, hotbar: false }));

        assert.equal(detection.found, true);
        assert.equal(detection.scale, 3);

        const scene = renderFakeGui({ width: 800, height: 600, scale: 3, originX: 5000, originY: 5000, furnace: false, decoys: true });

        assert.equal(detectGui(scene).found, false);
    });

    it("ne reconnaît pas une image vide ou noire", () =>
    {
        assert.equal(detectGui({ width: 64, height: 64, data: new Uint8Array(64 * 64 * 4) }).found, false);
    });
});



// ---------------------------------------------------------------------------
// Captures réelles : image redimensionnée, bruit, bordures altérées
// ---------------------------------------------------------------------------

describe("captures redimensionnées ou imparfaites", () =>
{
    const base = options({ scale: 4, originX: 610, originY: 225, furnace: true, width: 1936, height: 1096 });

    it("reconnaît une capture réduite à 98,6 % (fenêtre rétrécie par Windows), comme la capture de Lunar Client", () =>
    {
        const factor = 0.986;
        const image  = resampleNearest(renderFakeGui(base), 1909, 1080);
        const found  = detectGui(image);

        assert.equal(found.found, true);
        assert.equal(found.screen, "furnace");
        assert.equal(found.inventory.length, 36);
        assert.ok(Math.abs(found.scale - 4 * factor) < 0.05, `échelle ${found.scale}`);

        const expected = { x: (610 + 8 * 4) * 1909 / 1936, y: (225 + 84 * 4) * 1080 / 1096 };

        assert.ok(Math.abs(found.inventory[0].x - expected.x) <= 2 && Math.abs(found.inventory[0].y - expected.y) <= 2, JSON.stringify(found.inventory[0]));

        const lastExpected = (610 + (8 + 8 * 18) * 4) * 1909 / 1936;

        assert.ok(Math.abs(found.inventory[8].x - lastExpected) <= 2, `dernier emplacement de la ligne : ${found.inventory[8].x} au lieu de ${lastExpected}`);
    });

    it("reconnaît le four et ses emplacements sur une capture redimensionnée", () =>
    {
        const found = detectGui(resampleNearest(renderFakeGui(base), 1909, 1080));

        assert.ok(found.furnace);
        assert.ok(Math.abs((found.furnace?.input.x ?? 0) - (610 + 56 * 4) * 1909 / 1936) <= 2);
        assert.ok(Math.abs((found.furnace?.fuel.y ?? 0) - (225 + 53 * 4) * 1080 / 1096) <= 2);
    });

    it("reconnaît des réductions plus fortes (×0,9 et ×0,75)", () =>
    {
        for (const factor of [0.9, 0.75])
        {
            const image = resampleNearest(renderFakeGui(base), Math.round(1936 * factor), Math.round(1096 * factor));
            const found = detectGui(image);

            assert.equal(found.found, true, `facteur ${factor}`);
            assert.ok(Math.abs(found.scale - 4 * factor) < 0.08, `facteur ${factor} : échelle ${found.scale}`);
        }
    });

    it("supporte un léger bruit de couleur (compression, flou)", () =>
    {
        const noisy = addColorNoise(renderFakeGui(options({ scale: 3 })), 8);

        assert.equal(detectGui(noisy).found, true);
        assert.equal(detectGui(noisy).inventory.length, 36);
    });

    it("reconnaît la grille quand la bordure d'un emplacement est cachée ou altérée", () =>
    {
        const settings = options({ scale: 3 });
        const image    = renderFakeGui(settings);

        breakSlotBorder(image, settings, 0, 3);
        breakSlotBorder(image, settings, 1, 3);

        const found = detectGui(image);

        assert.equal(found.found, true);
        assert.equal(found.hotbar, true);
        assert.equal(found.inventory.length, 36);
    });

    it("reste fiable avec une barre d'objets de jeu (HUD) à l'écran en plus de l'inventaire", () =>
    {
        const settings = options({ scale: 4, originX: 610, originY: 225, width: 1909, height: 1080 });
        const image    = renderFakeGui(settings);

        for (let column = 0; column < 9; column += 1)
        {
            for (let y = 1000; y < 1004; y += 1)
            {
                for (let x = 606 + column * 79; x < 606 + column * 79 + 64; x += 1)
                {
                    const offset = (y * image.width + x) * 4;

                    image.data[offset] = 55;
                    image.data[offset + 1] = 55;
                    image.data[offset + 2] = 55;
                }
            }
        }

        const found = detectGui(image);

        assert.equal(found.found, true);
        assert.equal(found.scale, 4);
    });

    it("ne confond pas une barre d'objets de jeu seule avec un inventaire", () =>
    {
        const image = renderFakeGui(options({ originX: 9000, originY: 9000 }));

        for (let column = 0; column < 9; column += 1)
        {
            for (let y = 1000; y < 1004; y += 1)
            {
                for (let x = 606 + column * 79; x < 606 + column * 79 + 64; x += 1)
                {
                    const offset = (y * image.width + x) * 4;

                    image.data[offset] = 55;
                    image.data[offset + 1] = 55;
                    image.data[offset + 2] = 55;
                }
            }
        }

        assert.equal(detectGui(image).found, false);
    });
});



// ---------------------------------------------------------------------------
// Image annotée
// ---------------------------------------------------------------------------

describe("image annotée", () =>
{
    it("dessine les emplacements reconnus sans modifier l'image d'origine", () =>
    {
        const image     = renderFakeGui(options({ scale: 3 }));
        const detection = detectGui(image);
        const before    = new Uint8Array(image.data);
        const annotated = annotateDetection(image, detection);
        const first     = detection.inventory[0];
        const offset    = (first.y * image.width + first.x) * 4;

        assert.deepEqual([...image.data.slice(0, 5000)], [...before.slice(0, 5000)]);
        assert.deepEqual([annotated.data[offset], annotated.data[offset + 1], annotated.data[offset + 2]], [255, 40, 40]);
        assert.notDeepEqual([...annotated.data.slice(offset, offset + 3)], [...image.data.slice(offset, offset + 3)]);
    });

    it("rend une copie identique quand rien n'est reconnu", () =>
    {
        const image     = renderFakeGui(options({ originX: 9000 }));
        const annotated = annotateDetection(image, detectGui(image));

        assert.deepEqual([...annotated.data.slice(0, 2000)], [...image.data.slice(0, 2000)]);
    });
});
