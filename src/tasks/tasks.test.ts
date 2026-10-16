import assert                  from "node:assert/strict";
import fs                      from "node:fs/promises";
import os                      from "node:os";
import path                    from "node:path";
import { after, describe, it } from "node:test";

import { loadGames }                          from "./loader";
import { parseGameManifest, parseItems, parseTaskDefinition } from "./schema";
import type { ItemCatalog, TaskDefinition }   from "./task-types";
import { createItemCatalog, resolveParameterValues } from "./values";



const REAL_GAMES_DIRECTORY = path.join(__dirname, "..", "..", "games");



function parseTask(raw: unknown): TaskDefinition
{
    const result = parseTaskDefinition(raw);

    assert.deepEqual(result.errors, []);
    assert.ok(result.value);

    return result.value;
}



function taskWith(parameters: unknown[]): unknown
{
    return { id: "test-task", name: "Test", description: "Tâche de test", requires: [], parameters };
}



function errorsOf(raw: unknown): string[]
{
    return parseTaskDefinition(raw).errors;
}



// ---------------------------------------------------------------------------
// Lecture des fichiers de description
// ---------------------------------------------------------------------------

describe("description d'une tâche", () =>
{
    it("accepte une tâche valide sans paramètre", () =>
    {
        const task = parseTask(taskWith([]));

        assert.equal(task.id, "test-task");
        assert.deepEqual(task.parameters, []);
    });

    it("refuse un identifiant de tâche invalide", () =>
    {
        const errors = errorsOf({ ...(taskWith([]) as object), id: "Fill Furnaces" });

        assert.equal(errors.length, 1);
        assert.match(errors[0], /"id" invalide/);
    });

    it("refuse un type de paramètre inconnu", () =>
    {
        const errors = errorsOf(taskWith([{ id: "a", type: "couleur", label: "A" }]));

        assert.match(errors[0], /"type" doit valoir/);
    });

    it("refuse deux paramètres avec le même identifiant", () =>
    {
        const errors = errorsOf(taskWith([
            { id: "a", type: "text", label: "A" },
            { id: "a", type: "text", label: "B" }
        ]));

        assert.match(errors[0], /en double/);
    });

    it("refuse un nombre dont min dépasse max", () =>
    {
        const errors = errorsOf(taskWith([{ id: "n", type: "number", label: "N", min: 5, max: 2 }]));

        assert.match(errors[0], /"min" ne peut pas dépasser "max"/);
    });

    it("refuse une valeur par défaut hors limites", () =>
    {
        const errors = errorsOf(taskWith([{ id: "n", type: "number", label: "N", min: 1, max: 4, default: 9 }]));

        assert.match(errors[0], /supérieur à "max"/);
    });

    it("refuse un choix dont la valeur par défaut n'est pas une option", () =>
    {
        const errors = errorsOf(taskWith([{
            id: "c", type: "choice", label: "C", default: "z", options: [{ value: "a", label: "A" }]
        }]));

        assert.match(errors[0], /aucune option/);
    });

    it("refuse emptyMeans sur un paramètre obligatoire", () =>
    {
        const errors = errorsOf(taskWith([{ id: "n", type: "number", label: "N", required: true, emptyMeans: "tous" }]));

        assert.match(errors[0], /emptyMeans/);
    });

    it("signale toutes les erreurs d'un paramètre d'un coup", () =>
    {
        const errors = errorsOf(taskWith([{ id: "n", type: "number", label: "", min: "x" }]));

        assert.ok(errors.length >= 2);
    });

    it("accepte un réglage d'items avec quantité et refuse une valeur par défaut", () =>
    {
        const task = parseTask(taskWith([{ id: "items", type: "itemAmounts", label: "Items", filter: "smeltable", required: true }]));

        assert.equal(task.parameters[0].type, "itemAmounts");

        const withDefault = errorsOf(taskWith([{ id: "items", type: "itemAmounts", label: "Items", default: [] }]));

        assert.match(withDefault[0], /itemAmounts/);
    });

    it("accepte un manifeste de jeu valide et refuse une capacité en double", () =>
    {
        const capability = { id: "move-player", label: "Se déplacer", description: "Déplace le joueur" };

        assert.ok(parseGameManifest({ id: "minecraft", name: "Minecraft", capabilities: [capability] }).value);

        const duplicated = parseGameManifest({ id: "minecraft", name: "Minecraft", capabilities: [capability, capability] });

        assert.equal(duplicated.value, null);
        assert.match(duplicated.errors[0], /en double/);
    });
});



// ---------------------------------------------------------------------------
// Validation des valeurs saisies
// ---------------------------------------------------------------------------

describe("valeurs des paramètres", () =>
{
    const task = parseTask(taskWith([
        { id: "items",   type: "items",   label: "Items",  required: true, filter: "smeltable" },
        { id: "furnaces", type: "number",  label: "Fours",  integer: true, min: 1, emptyMeans: "tous les fours" },
        { id: "collect",  type: "boolean", label: "Récupérer", default: true },
        { id: "mode",     type: "choice",  label: "Mode", default: "fast", options: [
            { value: "fast", label: "Rapide" }, { value: "safe", label: "Prudent" }
        ] }
    ]));

    it("applique les valeurs par défaut et laisse vide un paramètre optionnel", () =>
    {
        const result = resolveParameterValues(task, { items: ["iron_ore"] });

        assert.deepEqual(result, { ok: true, values: { items: ["iron_ore"], collect: true, mode: "fast" } });
    });

    it("refuse un paramètre obligatoire manquant", () =>
    {
        const result = resolveParameterValues(task, {});

        assert.equal(result.ok, false);

        if (!result.ok)
        {
            assert.equal(result.errors[0].parameterId, "items");
        }
    });

    it("traite une liste vide comme manquante", () =>
    {
        assert.equal(resolveParameterValues(task, { items: [] }).ok, false);
    });

    it("refuse un nombre décimal, trop petit ou donné en texte", () =>
    {
        for (const furnaces of [2.5, 0, "3"])
        {
            assert.equal(resolveParameterValues(task, { items: ["iron_ore"], furnaces }).ok, false, String(furnaces));
        }
    });

    it("accepte un nombre valide", () =>
    {
        const result = resolveParameterValues(task, { items: ["iron_ore"], furnaces: 4 });

        assert.ok(result.ok && result.values.furnaces === 4);
    });

    it("refuse un paramètre inconnu, un choix inconnu et un oui/non invalide", () =>
    {
        assert.equal(resolveParameterValues(task, { items: ["iron_ore"], inconnu: 1 }).ok, false);
        assert.equal(resolveParameterValues(task, { items: ["iron_ore"], mode: "autre" }).ok, false);
        assert.equal(resolveParameterValues(task, { items: ["iron_ore"], collect: "oui" }).ok, false);
    });

    it("refuse un item en double dans une liste", () =>
    {
        assert.equal(resolveParameterValues(task, { items: ["iron_ore", "iron_ore"] }).ok, false);
    });

    it("applique le catalogue d'items du jeu quand il est fourni", () =>
    {
        const catalog: ItemCatalog =
        {
            isAllowed: (filter, itemId) => filter !== "smeltable" || itemId.endsWith("_ore")
        };

        assert.equal(resolveParameterValues(task, { items: ["iron_ore"] }, catalog).ok, true);
        assert.equal(resolveParameterValues(task, { items: ["dirt"] }, catalog).ok, false);
    });

    it("refuse des paramètres qui ne sont pas un objet", () =>
    {
        assert.equal(resolveParameterValues(task, "n'importe quoi").ok, false);
    });

    it("réglage d'items avec quantité : accepte des noms, des quantités ou « tout »", () =>
    {
        const amounts = parseTask(taskWith([{ id: "items", type: "itemAmounts", label: "Items", required: true }]));

        const result = resolveParameterValues(amounts, { items: ["raw_iron", { itemId: "raw_copper", amount: 128 }, { itemId: "raw_gold", amount: null }] });

        assert.deepEqual(result, {
            ok:     true,
            values: { items: [
                { itemId: "raw_iron",   amount: null },
                { itemId: "raw_copper", amount: 128 },
                { itemId: "raw_gold",   amount: null }
            ] }
        });
    });

    it("réglage d'items avec quantité : refuse une quantité invalide, un doublon ou une liste vide", () =>
    {
        const amounts = parseTask(taskWith([{ id: "items", type: "itemAmounts", label: "Items", required: true }]));

        for (const amount of [0, -3, 2.5, "5"])
        {
            assert.equal(resolveParameterValues(amounts, { items: [{ itemId: "raw_iron", amount }] }).ok, false, String(amount));
        }

        assert.equal(resolveParameterValues(amounts, { items: ["raw_iron", { itemId: "raw_iron", amount: 5 }] }).ok, false);
        assert.equal(resolveParameterValues(amounts, { items: [] }).ok, false);
        assert.equal(resolveParameterValues(amounts, { items: "raw_iron" }).ok, false);
        assert.equal(resolveParameterValues(amounts, { items: [42] }).ok, false);
    });

    it("réglage d'items avec quantité : applique le catalogue du jeu", () =>
    {
        const amounts = parseTask(taskWith([{ id: "items", type: "itemAmounts", label: "Items", filter: "smeltable", required: true }]));
        const catalog = createItemCatalog([
            { id: "raw_iron", name: "Raw Iron", tags: ["smeltable"], stackSize: 64, burnSeconds: undefined },
            { id: "coal",     name: "Coal",     tags: ["fuel"],      stackSize: 64, burnSeconds: 80 }
        ]);

        assert.equal(resolveParameterValues(amounts, { items: [{ itemId: "raw_iron", amount: 64 }] }, catalog).ok, true);
        assert.equal(resolveParameterValues(amounts, { items: [{ itemId: "coal", amount: 64 }] }, catalog).ok, false);
    });

    it("ne prend pas un texte commençant par error: pour une erreur", () =>
    {
        const textTask = parseTask(taskWith([{ id: "note", type: "text", label: "Note" }]));
        const result   = resolveParameterValues(textTask, { note: "error: ceci est du texte" });

        assert.ok(result.ok);
    });
});



// ---------------------------------------------------------------------------
// Items d'un jeu
// ---------------------------------------------------------------------------

describe("items d'un jeu", () =>
{
    it("accepte une liste d'items valide", () =>
    {
        const result = parseItems([{ id: "raw_iron", name: "Fer brut", tags: ["smeltable"] }, { id: "coal", name: "Charbon" }]);

        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.value?.map((item) => item.tags), [["smeltable"], []]);
        assert.deepEqual(result.value?.map((item) => item.stackSize), [64, 64]);
    });

    it("refuse un identifiant invalide, un nom vide et un doublon", () =>
    {
        const result = parseItems([
            { id: "Raw Iron", name: "Fer" },
            { id: "coal", name: "" },
            { id: "stick", name: "Bâton" },
            { id: "stick", name: "Bâton bis" }
        ]);

        assert.equal(result.value, null);
        assert.equal(result.errors.length, 3);
    });

    it("lit la taille de stack et la durée de combustion, et exige une durée pour un carburant", () =>
    {
        const valid = parseItems([{ id: "lava_bucket", name: "Lava Bucket", tags: ["fuel"], stackSize: 1, burnSeconds: 1000 }]);

        assert.deepEqual(valid.errors, []);
        assert.equal(valid.value?.[0].stackSize, 1);
        assert.equal(valid.value?.[0].burnSeconds, 1000);

        assert.match(parseItems([{ id: "coal", name: "Coal", tags: ["fuel"] }]).errors[0], /burnSeconds/);
        assert.equal(parseItems([{ id: "x", name: "X", stackSize: 0 }]).value, null);
        assert.equal(parseItems([{ id: "x", name: "X", stackSize: 65 }]).value, null);
        assert.equal(parseItems([{ id: "x", name: "X", burnSeconds: -5 }]).value, null);
    });

    it("le catalogue filtre par étiquette et refuse un item inconnu", () =>
    {
        const catalog = createItemCatalog([
            { id: "raw_iron", name: "Fer brut", tags: ["smeltable"], stackSize: 64, burnSeconds: undefined },
            { id: "coal",     name: "Charbon",  tags: ["fuel"],      stackSize: 64, burnSeconds: 80 }
        ]);

        assert.equal(catalog.isAllowed("smeltable", "raw_iron"), true);
        assert.equal(catalog.isAllowed("smeltable", "coal"), false);
        assert.equal(catalog.isAllowed(undefined, "coal"), true);
        assert.equal(catalog.isAllowed("fuel", "dirt"), false);
    });

    it("le catalogue Minecraft livré sépare items à cuire et carburants", async () =>
    {
        const { games } = await loadGames(REAL_GAMES_DIRECTORY);
        const minecraft = games.find((game) => game.id === "minecraft");

        assert.ok(minecraft && minecraft.items.length > 0);

        const tagsOf = (id: string) => minecraft.items.find((item) => item.id === id)?.tags;

        assert.deepEqual(tagsOf("raw_iron")?.slice().sort(), ["blastable", "smeltable"]);
        assert.deepEqual(tagsOf("raw_beef")?.slice().sort(), ["smeltable", "smokable"]);
        assert.deepEqual(tagsOf("coal"), ["fuel"]);
        assert.deepEqual(tagsOf("oak_log")?.slice().sort(), ["fuel", "smeltable"]);
    });

    it("le catalogue Minecraft ne contient aucun bloc brut cuisable", async () =>
    {
        const { games } = await loadGames(REAL_GAMES_DIRECTORY);

        const rawBlocks = games[0].items.filter((item) => /^raw_.*_block$/.test(item.id));

        assert.deepEqual(rawBlocks, []);
    });

    it("les noms d'items Minecraft sont en anglais", async () =>
    {
        const { games } = await loadGames(REAL_GAMES_DIRECTORY);
        const names     = new Map(games[0].items.map((item) => [item.id, item.name]));

        assert.equal(names.get("raw_iron"), "Raw Iron");
        assert.equal(names.get("coal_block"), "Block of Coal");
        assert.equal(names.get("dark_oak_planks"), "Dark Oak Planks");
    });

    it("la tâche des fours refuse du charbon à cuire et du fer comme carburant", async () =>
    {
        const { games } = await loadGames(REAL_GAMES_DIRECTORY);
        const minecraft = games[0];
        const task      = minecraft.tasks[0];
        const catalog   = createItemCatalog(minecraft.items);

        assert.equal(resolveParameterValues(task, { items: ["raw_iron", "raw_beef"], fuel: ["coal", "oak_planks"] }, catalog).ok, true);
        assert.equal(resolveParameterValues(task, { items: ["coal"], fuel: ["coal"] }, catalog).ok, false);
        assert.equal(resolveParameterValues(task, { items: ["raw_iron"], fuel: ["raw_iron"] }, catalog).ok, false);
        assert.equal(resolveParameterValues(task, { items: ["diamant_inconnu"], fuel: ["coal"] }, catalog).ok, false);
    });
});



// ---------------------------------------------------------------------------
// Chargement des jeux
// ---------------------------------------------------------------------------

describe("chargement des jeux", () =>
{
    const temporaryDirectories: string[] = [];

    after(async () =>
    {
        for (const directory of temporaryDirectories)
        {
            await fs.rm(directory, { recursive: true, force: true });
        }
    });

    async function makeGamesDirectory(files: Record<string, unknown>): Promise<string>
    {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), "paul-games-"));

        temporaryDirectories.push(directory);

        for (const [relativePath, content] of Object.entries(files))
        {
            const filePath = path.join(directory, relativePath);

            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, typeof content === "string" ? content : JSON.stringify(content));
        }

        return directory;
    }

    const manifest = { id: "demo", name: "Demo", capabilities: [{ id: "look", label: "Regarder", description: "Regarde" }] };

    it("charge les jeux livrés avec PAUL sans erreur", async () =>
    {
        const result = await loadGames(REAL_GAMES_DIRECTORY);

        assert.deepEqual(result.errors, []);

        const minecraft = result.games.find((game) => game.id === "minecraft");
        const task      = minecraft?.tasks.find((candidate) => candidate.id === "fill-furnaces");

        assert.ok(task);
        assert.deepEqual(task.requires, ["analyze-environment", "move-player"]);
        assert.deepEqual(task.parameters.map((parameter) => parameter.id), ["items", "fuel", "maxFurnaces", "maxRounds", "collectOutput"]);
    });

    it("la tâche des fours accepte « tous les fours » quand la limite est vide", async () =>
    {
        const result = await loadGames(REAL_GAMES_DIRECTORY);
        const task   = result.games[0].tasks[0];

        const resolved = resolveParameterValues(task, { items: ["raw_iron"], fuel: ["coal"] });

        assert.deepEqual(resolved, { ok: true, values: { items: [{ itemId: "raw_iron", amount: null }], fuel: ["coal"], collectOutput: true } });
    });

    it("ignore une tâche invalide, la signale et charge les autres", async () =>
    {
        const directory = await makeGamesDirectory({
            "demo/game.json":         manifest,
            "demo/tasks/good.json":   { id: "good", name: "Bonne", description: "OK", requires: ["look"], parameters: [] },
            "demo/tasks/broken.json": { id: "Broken!", name: "Cassée", description: "KO" },
            "demo/tasks/text.json":   "{ pas du json"
        });

        const result = await loadGames(directory);

        assert.deepEqual(result.games[0].tasks.map((task) => task.id), ["good"]);
        assert.equal(result.errors.length, 2);
        assert.ok(result.errors.some((error) => error.startsWith("demo/tasks/broken.json")));
        assert.ok(result.errors.some((error) => error.includes("JSON invalide")));
    });

    it("refuse une tâche qui demande une capacité que le jeu n'a pas", async () =>
    {
        const directory = await makeGamesDirectory({
            "demo/game.json":       manifest,
            "demo/tasks/fly.json":  { id: "fly", name: "Voler", description: "Vole", requires: ["fly-player"] }
        });

        const result = await loadGames(directory);

        assert.deepEqual(result.games[0].tasks, []);
        assert.match(result.errors[0], /fly-player/);
    });

    it("refuse un jeu dont l'id ne correspond pas à son dossier", async () =>
    {
        const directory = await makeGamesDirectory({ "autre/game.json": manifest });
        const result    = await loadGames(directory);

        assert.deepEqual(result.games, []);
        assert.match(result.errors[0], /identique au nom du dossier/);
    });

    it("refuse deux tâches avec le même id", async () =>
    {
        const task = { id: "same", name: "Même", description: "Doublon", requires: [] };

        const directory = await makeGamesDirectory({
            "demo/game.json":      manifest,
            "demo/tasks/a.json":   task,
            "demo/tasks/b.json":   task
        });

        const result = await loadGames(directory);

        assert.equal(result.games[0].tasks.length, 1);
        assert.match(result.errors[0], /déjà définie/);
    });

    it("signale un dossier des jeux introuvable sans planter", async () =>
    {
        const result = await loadGames(path.join(os.tmpdir(), "paul-dossier-inexistant"));

        assert.deepEqual(result.games, []);
        assert.equal(result.errors.length, 1);
    });
});
