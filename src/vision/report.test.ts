import assert           from "node:assert/strict";
import { describe, it } from "node:test";

import { renderFakeGui, resampleNearest } from "./fake-gui";
import { detectGui }                  from "./gui-detect";
import { cardToLines, describeCapture } from "./report";
import type { CaptureMeta }           from "./report";



const meta: CaptureMeta =
{
    sourceName:       "Minecraft 1.21",
    sourceKind:       "window",
    width:            1920,
    height:           1080,
    fileName:         "capture-a.png",
    analysisFileName: "capture-a-analyse.png",
    blank:            false,
    notice:           null
};



// ---------------------------------------------------------------------------
// Description d'une capture
// ---------------------------------------------------------------------------

describe("description d'une capture", () =>
{
    it("décrit un inventaire reconnu", () =>
    {
        const detection = detectGui(renderFakeGui({ width: 1920, height: 1080, scale: 3, originX: 700, originY: 300, furnace: false }));
        const card      = describeCapture(meta, detection);

        assert.equal(card.headline, "Inventaire reconnu · interface ×3");
        assert.deepEqual(card.stats.find((stat) => stat.label === "Source")?.value, "Fenêtre « Minecraft 1.21 » (1920×1080)");
        assert.deepEqual(card.stats.find((stat) => stat.label === "Emplacements")?.value, "36 (27 + barre rapide)");
        assert.deepEqual(card.notes, []);
    });

    it("affiche l'échelle entière et signale une capture réduite (cas de Lunar Client)", () =>
    {
        const detection = detectGui(resampleNearest(renderFakeGui({ width: 1936, height: 1096, scale: 4, originX: 610, originY: 225, furnace: true, items: true }), 1909, 1080));
        const card      = describeCapture(meta, detection);

        assert.equal(card.headline, "Four reconnu · interface ×4");
        assert.equal(card.stats.find((stat) => stat.label === "Échelle de l'interface")?.value, "×4 (capture à 99 % de la taille réelle)");
    });

    it("décrit un four reconnu", () =>
    {
        const detection = detectGui(renderFakeGui({ width: 1920, height: 1080, scale: 2, originX: 700, originY: 300, furnace: true }));
        const card      = describeCapture(meta, detection);

        assert.equal(card.headline, "Four reconnu · interface ×2");
        assert.ok(card.stats.some((stat) => stat.label === "Four"));
    });

    it("avertit quand la barre rapide n'est pas visible", () =>
    {
        const detection = detectGui(renderFakeGui({ width: 1920, height: 1080, scale: 3, originX: 700, originY: 300, furnace: false, hotbar: false }));
        const card      = describeCapture(meta, detection);

        assert.ok(card.notes.some((note) => note.message.includes("barre rapide")));
    });

    it("garde l'avertissement sur la fenêtre même quand l'inventaire est reconnu", () =>
    {
        const detection = detectGui(renderFakeGui({ width: 1920, height: 1080, scale: 3, originX: 700, originY: 300, furnace: false }));
        const card      = describeCapture({ ...meta, sourceKind: "screen", notice: "Fenêtre du jeu non reconnue, tout l'écran a été capturé." }, detection);

        assert.equal(card.headline, "Inventaire reconnu · interface ×3");
        assert.ok(card.notes.some((note) => note.message.startsWith("Fenêtre du jeu non reconnue")));
    });

    it("explique quoi faire quand rien n'est reconnu", () =>
    {
        const card = describeCapture(meta, detectGui({ width: 32, height: 32, data: new Uint8Array(32 * 32 * 4) }));

        assert.equal(card.headline, "Aucun inventaire reconnu");
        assert.ok(card.notes.some((note) => note.message.includes("Ouvre ton inventaire")));
    });

    it("signale une image noire (plein écran exclusif) et une capture de l'écran entier", () =>
    {
        const empty = detectGui({ width: 32, height: 32, data: new Uint8Array(32 * 32 * 4) });
        const card  = describeCapture({ ...meta, sourceKind: "screen", blank: true }, empty);

        assert.deepEqual(card.stats.find((stat) => stat.label === "Source")?.value, "Écran entier (1920×1080)");
        assert.ok(card.notes.some((note) => note.message.includes("plein écran exclusif")));
        assert.ok(card.notes.some((note) => note.message.includes("Fenêtre du jeu introuvable")));
    });

    it("transforme la carte en lignes lisibles", () =>
    {
        const detection = detectGui(renderFakeGui({ width: 1920, height: 1080, scale: 3, originX: 700, originY: 300, furnace: false }));
        const lines     = cardToLines(describeCapture(meta, detection));

        assert.equal(lines[0], "Inventaire reconnu · interface ×3");
        assert.ok(lines.includes("Échelle de l'interface : ×3"));
    });
});
