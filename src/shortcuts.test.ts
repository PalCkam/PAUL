import assert           from "node:assert/strict";
import { describe, it } from "node:test";

import { actionToValue, bindingsFromLegacyKeys, parseActionValue, parseBinding, setBinding } from "./shortcuts";
import type { Binding } from "./types";



const fer: Binding    = { key: 1, action: { type: "preset", presetId: "p1" } };
const notes: Binding  = { key: 4, action: { type: "panel", panelId: "notes" } };



// ---------------------------------------------------------------------------
// Actions et valeurs
// ---------------------------------------------------------------------------

describe("actions des raccourcis", () =>
{
    it("convertit une action en valeur et inversement", () =>
    {
        for (const action of [
            { type: "preset" as const, presetId: "preset_abc" },
            { type: "note" as const, noteId: "note_1" },
            { type: "panel" as const, panelId: "tasks" as const },
            { type: "tool" as const, toolId: "capture" as const }
        ])
        {
            assert.deepEqual(parseActionValue(actionToValue(action)), action);
        }
    });

    it("refuse une valeur inconnue ou incomplète", () =>
    {
        for (const value of ["", "preset", "preset:", "panel:inconnu", "tool:inconnu", "autre:x", 5, null, undefined])
        {
            assert.equal(parseActionValue(value), null, String(value));
        }
    });

    it("un identifiant qui contient « : » reste intact", () =>
    {
        assert.deepEqual(parseActionValue("note:a:b"), { type: "note", noteId: "a:b" });
    });

    it("relit une action enregistrée et refuse une action ou une touche invalide", () =>
    {
        assert.deepEqual(parseBinding({ key: 2, action: { type: "note", noteId: "n" } }), { key: 2, action: { type: "note", noteId: "n" } });

        for (const raw of [null, { key: 0, action: { type: "note", noteId: "n" } }, { key: 10, action: { type: "note", noteId: "n" } },
            { key: 2, action: { type: "note" } }, { key: 2, action: { type: "panel", panelId: "x" } }, { key: 2 }, { key: "2", action: {} }])
        {
            assert.equal(parseBinding(raw), null, JSON.stringify(raw));
        }
    });
});



// ---------------------------------------------------------------------------
// Affectation des touches
// ---------------------------------------------------------------------------

describe("affectation des touches", () =>
{
    it("ajoute, remplace et retire une touche en gardant l'ordre", () =>
    {
        let bindings = setBinding([], 4, notes.action);

        bindings = setBinding(bindings, 1, fer.action);
        assert.deepEqual(bindings.map((binding) => binding.key), [1, 4]);

        bindings = setBinding(bindings, 1, { type: "panel", panelId: "tasks" });
        assert.equal(bindings.length, 2);
        assert.deepEqual(bindings[0].action, { type: "panel", panelId: "tasks" });

        bindings = setBinding(bindings, 4, null);
        assert.deepEqual(bindings.map((binding) => binding.key), [1]);
    });

    it("retirer une touche libre ne change rien", () =>
    {
        assert.deepEqual(setBinding([fer], 7, null), [fer]);
    });
});



// ---------------------------------------------------------------------------
// Anciennes touches de préréglages
// ---------------------------------------------------------------------------

describe("anciennes touches de préréglages", () =>
{
    const profiles = [
        { name: "Survie",   gameId: "minecraft" },
        { name: "Créatif",  gameId: "minecraft" },
        { name: "Elden",    gameId: null }
    ];

    it("crée un raccourci par profil du même jeu", () =>
    {
        const result = bindingsFromLegacyKeys([{ gameId: "minecraft", presetId: "p1", key: 3 }], profiles, {});

        assert.deepEqual(result, {
            "Survie":  [{ key: 3, action: { type: "preset", presetId: "p1" } }],
            "Créatif": [{ key: 3, action: { type: "preset", presetId: "p1" } }]
        });
    });

    it("ne remplace jamais une touche déjà utilisée et garde l'existant", () =>
    {
        const existing = { "Survie": [notes, { key: 3, action: { type: "note" as const, noteId: "n" } }] };
        const result   = bindingsFromLegacyKeys([{ gameId: "minecraft", presetId: "p1", key: 3 }], profiles, existing);

        assert.deepEqual(result["Survie"], existing["Survie"]);
        assert.equal(result["Créatif"].length, 1);
        assert.deepEqual(existing["Survie"].length, 2);
    });

    it("ignore les profils d'un autre jeu et les jeux sans profil", () =>
    {
        const result = bindingsFromLegacyKeys([{ gameId: "minecraft", presetId: "p1", key: 3 }, { gameId: "autre", presetId: "p2", key: 5 }], profiles, {});

        assert.equal("Elden" in result, false);
        assert.equal(Object.keys(result).length, 2);
    });
});
