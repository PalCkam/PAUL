import assert           from "node:assert/strict";
import fs               from "node:fs";
import path             from "node:path";
import { describe, it } from "node:test";

import { parseItems }       from "../../tasks/schema";
import type { ItemDefinition, ParameterValues } from "../../tasks/types";
import { FAKE_SCENARIOS }   from "./fake-environments";
import { planFillFurnaces } from "./fill-furnaces-plan";
import { describeFurnacePlan, formatDuration } from "./fill-furnaces-report";
import type { FurnaceEnvironment, FurnaceState, FurnaceType } from "./furnace-types";



const ITEMS_FILE = path.join(__dirname, "..", "..", "..", "games", "minecraft", "items.json");

const parsedItems = parseItems(JSON.parse(fs.readFileSync(ITEMS_FILE, "utf-8")));

assert.deepEqual(parsedItems.errors, []);

const ITEMS = parsedItems.value as ItemDefinition[];



function furnaces(count: number, type: FurnaceType = "furnace"): FurnaceState[]
{
    return Array.from({ length: count }, (_, position) =>
    {
        return { id: String(position + 1), type, input: null, fuel: null, output: null };
    });
}



function environment(inventory: Record<string, number>, line: FurnaceState[] = furnaces(8), freeSlots = 20): FurnaceEnvironment
{
    return { furnaces: line, inventory, freeSlots };
}



function values(extra: ParameterValues = {}): ParameterValues
{
    return { items: ["raw_iron"], fuel: ["coal"], collectOutput: true, ...extra };
}



function scenario(id: string): FurnaceEnvironment
{
    const found = FAKE_SCENARIOS.find((candidate) => candidate.id === id);

    assert.ok(found, id);

    return found.environment;
}



function counts(plan: ReturnType<typeof planFillFurnaces>, round = 0): number[]
{
    return plan.rounds[round].assignments.map((assignment) => assignment.count);
}



// ---------------------------------------------------------------------------
// Calcul du plan
// ---------------------------------------------------------------------------

describe("plan de remplissage des fours", () =>
{
    it("remplit 8 fours avec 16 stacks et assez de carburant : 2 tours", () =>
    {
        const plan = planFillFurnaces(values(), scenario("full"), ITEMS);

        assert.equal(plan.rounds.length, 2);
        assert.deepEqual(counts(plan, 0), Array(8).fill(64));
        assert.deepEqual(counts(plan, 1), Array(8).fill(64));
        assert.deepEqual(plan.fuelTotals, [{ itemId: "coal", count: 128 }]);
        assert.equal(plan.totalSeconds, 1280);
        assert.deepEqual(plan.leftovers, []);
        assert.deepEqual(plan.notes, []);
    });

    it("répartit un petit nombre d'items sur tous les fours pour aller plus vite", () =>
    {
        const plan = planFillFurnaces(values(), environment({ raw_iron: 100, coal: 50 }), ITEMS);

        assert.equal(plan.rounds.length, 1);
        assert.deepEqual(counts(plan), [13, 13, 13, 13, 12, 12, 12, 12]);
        assert.equal(plan.totalSeconds, 130);
    });

    it("ne cuit que la quantité demandée pour un item", () =>
    {
        const plan = planFillFurnaces(values({ items: [{ itemId: "raw_iron", amount: 128 }] }), scenario("full"), ITEMS);

        assert.equal(plan.rounds.length, 1);
        assert.deepEqual(counts(plan), Array(8).fill(16));
        assert.equal(plan.totalSeconds, 160);
        assert.deepEqual(plan.itemTotals, [{ itemId: "raw_iron", count: 128 }]);
        assert.deepEqual(plan.fuelTotals, [{ itemId: "coal", count: 16 }]);
        assert.deepEqual(plan.leftovers, []);
        assert.deepEqual(plan.notes, []);
    });

    it("règle la quantité item par item : une quantité pour l'un, tout pour l'autre", () =>
    {
        const plan = planFillFurnaces(
            values({ items: [{ itemId: "raw_iron", amount: 100 }, { itemId: "raw_copper", amount: null }] }),
            scenario("mixed"),
            ITEMS
        );

        const total = (itemId: string): number | undefined => plan.itemTotals.find((stack) => stack.itemId === itemId)?.count;

        assert.equal(total("raw_iron"), 100);
        assert.equal(total("raw_copper"), 100);
        assert.deepEqual(plan.leftovers, []);
    });

    it("signale une quantité demandée supérieure à l'inventaire et cuit ce qui est disponible", () =>
    {
        const plan = planFillFurnaces(values({ items: [{ itemId: "raw_iron", amount: 500 }] }), environment({ raw_iron: 100, coal: 50 }), ITEMS);

        assert.ok(plan.notes.some((note) => note.message === "Raw Iron : 500 demandés, 100 dans l'inventaire."));
        assert.deepEqual(plan.itemTotals, [{ itemId: "raw_iron", count: 100 }]);
    });

    it("une quantité plus petite que l'inventaire ne laisse rien de « non cuit »", () =>
    {
        const plan = planFillFurnaces(values({ items: [{ itemId: "raw_iron", amount: 10 }] }), environment({ raw_iron: 1000, coal: 50 }), ITEMS);

        assert.deepEqual(plan.itemTotals, [{ itemId: "raw_iron", count: 10 }]);
        assert.deepEqual(plan.leftovers, []);
        assert.deepEqual(plan.notes, []);
    });

    it("n'utilise pas plus de fours que d'items", () =>
    {
        const plan = planFillFurnaces(values(), environment({ raw_iron: 3, coal: 5 }), ITEMS);

        assert.deepEqual(counts(plan), [1, 1, 1]);
    });

    it("réduit la charge quand il manque du carburant et le signale", () =>
    {
        const plan = planFillFurnaces(values(), scenario("low-fuel"), ITEMS);

        assert.equal(plan.rounds.length, 1);
        assert.deepEqual(counts(plan), [64, 64, 32]);
        assert.deepEqual(plan.fuelTotals, [{ itemId: "coal", count: 20 }]);
        assert.deepEqual(plan.leftovers, [{ itemId: "raw_iron", count: 352 }]);
        assert.ok(plan.notes.some((note) => note.message.includes("Carburant insuffisant au tour 1 : 1 four(s) chargé(s) partiellement, 5 sans carburant")));
        assert.ok(plan.notes.some((note) => note.message.includes("Non cuit : Raw Iron ×352")));
    });

    it("respecte la limite de fours", () =>
    {
        const plan = planFillFurnaces(values({ maxFurnaces: 3 }), scenario("full"), ITEMS);

        assert.equal(plan.rounds.length, 6);
        assert.deepEqual(counts(plan, 0), [64, 64, 64]);
        assert.deepEqual(counts(plan, 5), [22, 21, 21]);

        const used = new Set(plan.rounds.flatMap((round) => round.assignments.map((assignment) => assignment.furnaceId)));

        assert.deepEqual([...used].sort(), ["1", "2", "3"]);
    });

    it("signale une limite de fours supérieure au nombre de fours trouvés", () =>
    {
        const plan = planFillFurnaces(values({ maxFurnaces: 12 }), scenario("full"), ITEMS);

        assert.ok(plan.notes.some((note) => note.message === "12 fours demandés, 8 trouvés."));
        assert.equal(plan.rounds.length, 2);
    });

    it("respecte la limite de tours", () =>
    {
        const plan = planFillFurnaces(values({ maxRounds: 1 }), scenario("full"), ITEMS);

        assert.equal(plan.rounds.length, 1);
        assert.deepEqual(plan.leftovers, [{ itemId: "raw_iron", count: 512 }]);
        assert.ok(plan.notes.some((note) => note.message.startsWith("Limite de 1 tour(s) atteinte")));
    });

    it("limite à un tour quand la récupération est désactivée", () =>
    {
        const plan = planFillFurnaces(values({ collectOutput: false }), scenario("full"), ITEMS);

        assert.equal(plan.rounds.length, 1);
        assert.equal(plan.collectOutput, false);
        assert.ok(plan.notes.some((note) => note.message.startsWith("Récupération désactivée")));
    });

    it("conserve les fours déjà remplis, ignore les autres et récupère les sorties (reprise)", () =>
    {
        const plan = planFillFurnaces(values(), scenario("resume"), ITEMS);

        assert.deepEqual(plan.kept.map((kept) => kept.furnaceLabel), ["Furnace 1", "Furnace 2", "Furnace 3"]);
        assert.deepEqual(plan.rounds[0].assignments.map((assignment) => assignment.furnaceId), ["5", "6", "7", "8"]);
        assert.deepEqual(counts(plan, 0), [64, 64, 64, 64]);
        assert.deepEqual(plan.collectFirst, [{ furnaceLabel: "Furnace 5", itemId: "iron_ingot", count: 12 }]);
        assert.ok(plan.notes.some((note) => note.message.startsWith("Furnace 4 : contient déjà Raw Copper ×32, ignoré")));
        assert.equal(plan.rounds[0].waitSeconds, 640);
        assert.equal(plan.rounds[1].assignments.length, 7);
        assert.equal(plan.rounds[1].assignments.reduce((total, assignment) => total + assignment.count, 0), 64);
    });

    it("signale un inventaire trop plein pour récupérer une sortie déjà présente", () =>
    {
        const plan = planFillFurnaces(values(), scenario("full-inventory"), ITEMS);

        assert.ok(plan.notes.some((note) => note.message.startsWith("Inventaire trop plein pour récupérer les sorties déjà présentes")));
    });

    it("choisit les fours compatibles : Blast Furnace, Smoker et Furnace, avec leur vitesse", () =>
    {
        const plan = planFillFurnaces(
            { items: ["raw_iron", "raw_copper", "raw_beef"], fuel: ["coal"], collectOutput: true },
            scenario("mixed"),
            ITEMS
        );

        const byFurnace = new Map(plan.rounds[0].assignments.map((assignment) => [assignment.furnaceLabel, assignment]));

        assert.equal(plan.rounds.length, 1);
        assert.deepEqual(["1", "2", "3", "4"].map((id) => byFurnace.get(`Blast Furnace ${id}`)?.itemId), Array(4).fill("raw_iron"));
        assert.deepEqual(["5", "6"].map((id) => byFurnace.get(`Smoker ${id}`)?.itemId), Array(2).fill("raw_beef"));
        assert.deepEqual(["7", "8"].map((id) => byFurnace.get(`Furnace ${id}`)?.itemId), Array(2).fill("raw_copper"));
        assert.equal(byFurnace.get("Blast Furnace 1")?.seconds, 250);
        assert.equal(byFurnace.get("Smoker 5")?.seconds, 320);
        assert.equal(byFurnace.get("Furnace 7")?.seconds, 500);
        assert.equal(plan.rounds[0].waitSeconds, 500);
        assert.deepEqual(plan.fuelTotals, [{ itemId: "coal", count: 38 }]);
    });

    it("signale un item absent de l'inventaire ou sans four compatible", () =>
    {
        const missing = planFillFurnaces(values({ items: ["raw_gold"] }), environment({ coal: 10 }), ITEMS);

        assert.equal(missing.rounds.length, 0);
        assert.ok(missing.notes.some((note) => note.message === "Raw Gold : aucun dans l'inventaire."));

        const smokersOnly = planFillFurnaces(values(), environment({ raw_iron: 10, coal: 10 }, furnaces(2, "smoker")), ITEMS);

        assert.equal(smokersOnly.rounds.length, 0);
        assert.ok(smokersOnly.notes.some((note) => note.message === "Raw Iron : aucun four compatible."));
    });

    it("ignore un four qui contient un autre carburant", () =>
    {
        const line = furnaces(2);

        line[0].fuel = { itemId: "stick", count: 3 };

        const plan = planFillFurnaces(values(), environment({ raw_iron: 64, coal: 20 }, line), ITEMS);

        assert.deepEqual(plan.rounds[0].assignments.map((assignment) => assignment.furnaceId), ["2"]);
        assert.ok(plan.notes.some((note) => note.message.startsWith("Furnace 1 : contient un autre carburant")));
    });

    it("tient compte de la taille de stack du carburant (Lava Bucket = 1)", () =>
    {
        const plan = planFillFurnaces(values({ fuel: ["lava_bucket"] }), environment({ raw_iron: 128, lava_bucket: 2 }, furnaces(2)), ITEMS);

        assert.deepEqual(plan.rounds[0].assignments.map((assignment) => [assignment.count, assignment.fuelCount]), [[64, 1], [64, 1]]);
    });

    it("passe à un carburant plus puissant quand le premier ne suffit pas (Stick puis Coal)", () =>
    {
        const plan = planFillFurnaces(values({ fuel: ["stick", "coal"] }), environment({ raw_iron: 64, stick: 64, coal: 20 }, furnaces(1)), ITEMS);

        assert.equal(plan.rounds[0].assignments[0].fuelId, "coal");
        assert.equal(plan.rounds[0].assignments[0].count, 64);
    });

    it("complète le carburant déjà présent dans un four", () =>
    {
        const line = furnaces(1);

        line[0].fuel = { itemId: "coal", count: 3 };

        const plan = planFillFurnaces(values(), environment({ raw_iron: 64, coal: 20 }, line), ITEMS);

        assert.equal(plan.rounds[0].assignments[0].fuelPresent, 3);
        assert.equal(plan.rounds[0].assignments[0].fuelCount, 5);
    });
});



// ---------------------------------------------------------------------------
// Affichage du plan
// ---------------------------------------------------------------------------

describe("rapport de simulation", () =>
{
    it("formate les durées", () =>
    {
        assert.equal(formatDuration(45), "45 s");
        assert.equal(formatDuration(120), "2 min");
        assert.equal(formatDuration(640), "10 min 40 s");
        assert.equal(formatDuration(3900), "1 h 05 min");
    });

    it("décrit un plan en deux tours", () =>
    {
        const plan   = planFillFurnaces(values(), scenario("full"), ITEMS);
        const report = describeFurnacePlan(plan, ITEMS);

        assert.equal(report.headline, "2 tour(s) · attente totale 21 min 20 s");
        assert.equal(report.steps.length, 2);
        assert.equal(report.steps[0].title, "Tour 1 sur 2");
        assert.equal(report.steps[0].lines[0], "Furnace 1 : Raw Iron ×64 + Coal ×8 (10 min 40 s)");
        assert.ok(report.steps[0].lines.includes("Attendre 10 min 40 s"));
        assert.ok(report.steps[0].lines.includes("Récupérer les produits cuits"));
        assert.deepEqual(report.stats.find((stat) => stat.label === "Fours utilisés"), { label: "Fours utilisés", value: "8" });
        assert.deepEqual(report.stats.find((stat) => stat.label === "Carburant"), { label: "Carburant", value: "Coal ×128" });
    });

    it("décrit la reprise : four conservé, sortie à récupérer, carburant déjà présent", () =>
    {
        const report = describeFurnacePlan(planFillFurnaces(values(), scenario("resume"), ITEMS), ITEMS);

        assert.equal(report.steps[0].title, "Avant de commencer");
        assert.equal(report.steps[0].lines[0], "Récupérer la sortie de Furnace 5 : Iron Ingot ×12");
        assert.ok(report.steps[1].lines.includes("Furnace 1 : déjà rempli (Raw Iron ×64), conservé (10 min 40 s)"));
    });

    it("indique quand il n'y a rien à faire", () =>
    {
        const plan   = planFillFurnaces(values({ items: ["raw_gold"] }), environment({ coal: 10 }), ITEMS);
        const report = describeFurnacePlan(plan, ITEMS);

        assert.equal(report.headline, "Rien à faire avec ces réglages.");
        assert.equal(report.steps.length, 0);
        assert.equal(report.notes.length, 1);
    });

    it("chaque scénario de test produit un rapport sans planter", () =>
    {
        for (const candidate of FAKE_SCENARIOS)
        {
            const report = describeFurnacePlan(
                planFillFurnaces({ items: ["raw_iron", "raw_copper", "raw_beef"], fuel: ["coal"], collectOutput: true }, candidate.environment, ITEMS),
                ITEMS
            );

            assert.ok(report.headline.length > 0, candidate.id);
        }
    });
});
