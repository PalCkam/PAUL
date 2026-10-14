import assert           from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_PRESET_NAME_LENGTH, parsePresetMeta, toOverlayCard, upsertPreset } from "./presets";
import type { Preset } from "./types";



let counter = 0;

const newId = (): string => `id${++counter}`;

const iron   = { items: ["raw_iron"], fuel: ["coal"] };
const copper = { items: ["raw_copper"], fuel: ["coal"] };



// ---------------------------------------------------------------------------
// Nom et touche d'un préréglage
// ---------------------------------------------------------------------------

describe("nom et touche d'un préréglage", () =>
{
    it("accepte un nom et une touche du pavé 1 à 9, ou aucune touche", () =>
    {
        assert.deepEqual(parsePresetMeta("  Fer  ", 3), { ok: true, meta: { name: "Fer", key: 3 } });
        assert.deepEqual(parsePresetMeta("Fer", null), { ok: true, meta: { name: "Fer", key: null } });
        assert.deepEqual(parsePresetMeta("Fer", ""), { ok: true, meta: { name: "Fer", key: null } });
    });

    it("refuse un nom vide ou trop long", () =>
    {
        for (const name of ["", "   ", undefined, 5, "x".repeat(MAX_PRESET_NAME_LENGTH + 1)])
        {
            const result = parsePresetMeta(name, null);

            assert.equal(result.ok, false);

            if (!result.ok)
            {
                assert.equal(result.errors[0].parameterId, "name");
            }
        }
    });

    it("refuse les touches hors du pavé 1 à 9 (0 est réservé à l'arrêt)", () =>
    {
        for (const key of [0, 10, -1, 2.5, "3", "a"])
        {
            const result = parsePresetMeta("Fer", key);

            assert.equal(result.ok, false, String(key));
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
        const result = upsertPreset([], { taskId: "fill-furnaces", name: "Fer", values: iron, key: 1 }, newId);

        assert.equal(result.created, true);
        assert.equal(result.presets.length, 1);
        assert.equal(result.notice, null);
        assert.equal(result.preset.key, 1);
    });

    it("remplace un préréglage du même nom (sans tenir compte de la casse) en gardant son identifiant", () =>
    {
        const first  = upsertPreset([], { taskId: "fill-furnaces", name: "Fer", values: iron, key: 1 }, newId);
        const second = upsertPreset(first.presets, { taskId: "fill-furnaces", name: "fer", values: copper, key: 2 }, newId);

        assert.equal(second.created, false);
        assert.equal(second.presets.length, 1);
        assert.equal(second.preset.id, first.preset.id);
        assert.deepEqual(second.presets[0].values, copper);
        assert.equal(second.presets[0].key, 2);
    });

    it("deux tâches différentes peuvent avoir un préréglage du même nom", () =>
    {
        const first  = upsertPreset([], { taskId: "fill-furnaces", name: "Rapide", values: iron, key: null }, newId);
        const second = upsertPreset(first.presets, { taskId: "autre-tache", name: "Rapide", values: {}, key: null }, newId);

        assert.equal(second.presets.length, 2);
    });

    it("retire la touche à l'ancien préréglage et le signale", () =>
    {
        const first  = upsertPreset([], { taskId: "fill-furnaces", name: "Fer", values: iron, key: 1 }, newId);
        const second = upsertPreset(first.presets, { taskId: "fill-furnaces", name: "Cuivre", values: copper, key: 1 }, newId);

        const byName = (name: string): Preset | undefined => second.presets.find((preset) => preset.name === name);

        assert.equal(byName("Fer")?.key, null);
        assert.equal(byName("Cuivre")?.key, 1);
        assert.match(second.notice ?? "", /Pavé 1 était utilisé par « Fer »/);
    });

    it("garder la même touche sur le même préréglage ne produit aucun avertissement", () =>
    {
        const first  = upsertPreset([], { taskId: "fill-furnaces", name: "Fer", values: iron, key: 4 }, newId);
        const second = upsertPreset(first.presets, { taskId: "fill-furnaces", name: "Fer", values: iron, key: 4 }, newId);

        assert.equal(second.notice, null);
        assert.equal(second.presets[0].key, 4);
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
