import assert           from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_PRESET_NAME_LENGTH, parsePresetName, toOverlayCard, upsertPreset } from "./presets";



let counter = 0;

const newId = (): string => `id${++counter}`;

const iron   = { items: [{ itemId: "raw_iron", amount: 128 }], fuel: ["coal"] };
const copper = { items: [{ itemId: "raw_copper", amount: null }], fuel: ["coal"] };



// ---------------------------------------------------------------------------
// Nom d'un préréglage
// ---------------------------------------------------------------------------

describe("nom d'un préréglage", () =>
{
    it("accepte un nom et retire les espaces autour", () =>
    {
        assert.deepEqual(parsePresetName("  Fer  "), { ok: true, name: "Fer" });
    });

    it("refuse un nom vide ou trop long", () =>
    {
        for (const name of ["", "   ", undefined, 5, "x".repeat(MAX_PRESET_NAME_LENGTH + 1)])
        {
            const result = parsePresetName(name);

            assert.equal(result.ok, false);

            if (!result.ok)
            {
                assert.equal(result.errors[0].parameterId, "name");
            }
        }
    });
});



// ---------------------------------------------------------------------------
// Enregistrement des préréglages
// ---------------------------------------------------------------------------

describe("enregistrement des préréglages", () =>
{
    it("ajoute un nouveau préréglage", () =>
    {
        const result = upsertPreset([], { taskId: "fill-furnaces", name: "Fer", values: iron }, newId);

        assert.equal(result.created, true);
        assert.equal(result.presets.length, 1);
        assert.deepEqual(result.preset.values, iron);
    });

    it("remplace un préréglage du même nom (sans tenir compte de la casse) en gardant son identifiant", () =>
    {
        const first  = upsertPreset([], { taskId: "fill-furnaces", name: "Fer", values: iron }, newId);
        const second = upsertPreset(first.presets, { taskId: "fill-furnaces", name: "fer", values: copper }, newId);

        assert.equal(second.created, false);
        assert.equal(second.presets.length, 1);
        assert.equal(second.preset.id, first.preset.id);
        assert.deepEqual(second.presets[0].values, copper);
        assert.equal(second.presets[0].name, "fer");
    });

    it("deux tâches différentes peuvent avoir un préréglage du même nom", () =>
    {
        const first  = upsertPreset([], { taskId: "fill-furnaces", name: "Rapide", values: iron }, newId);
        const second = upsertPreset(first.presets, { taskId: "autre-tache", name: "Rapide", values: {} }, newId);

        assert.equal(second.presets.length, 2);
    });

    it("garde l'ordre des préréglages existants", () =>
    {
        let presets = upsertPreset([], { taskId: "t", name: "A", values: {} }, newId).presets;

        presets = upsertPreset(presets, { taskId: "t", name: "B", values: {} }, newId).presets;
        presets = upsertPreset(presets, { taskId: "t", name: "a", values: iron }, newId).presets;

        assert.deepEqual(presets.map((preset) => preset.name), ["a", "B"]);
    });
});



// ---------------------------------------------------------------------------
// Carte affichée dans le jeu
// ---------------------------------------------------------------------------

describe("carte de l'overlay", () =>
{
    it("garde le titre, les totaux et seulement les avertissements (limités)", () =>
    {
        const notes = [
            { level: "info" as const, message: "info" },
            ...Array.from({ length: 6 }, (_, position) => ({ level: "warning" as const, message: `warning ${position}` }))
        ];

        const card = toOverlayCard("Fer", { headline: "2 tour(s)", stats: [{ label: "Fours utilisés", value: "8" }], steps: [{ title: "Tour 1", lines: ["a"] }], notes });

        assert.equal(card.title, "Fer");
        assert.equal(card.headline, "2 tour(s)");
        assert.deepEqual(card.stats, [{ label: "Fours utilisés", value: "8" }]);
        assert.equal(card.notes.length, 4);
        assert.ok(card.notes.every((note) => note.level === "warning"));
        assert.ok(!("steps" in card));
    });
});
