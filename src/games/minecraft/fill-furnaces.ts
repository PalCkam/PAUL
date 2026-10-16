import type { ItemDefinition, ParameterValues, SimulationReport } from "../../tasks/task-types";
import type { LiveInventory, TaskImplementation } from "../registry";
import { FAKE_SCENARIOS, furnaceLine } from "./fake-environments";
import { planFillFurnaces } from "./fill-furnaces-plan";
import { describeFurnacePlan } from "./fill-furnaces-report";
import type { FurnaceType } from "./furnace-types";



const LIVE_SCENARIO = { id: "live", label: "Inventaire réel (dernière capture du jeu)" };

const ASSUMED_FURNACES = 8;



function simulateLive(values: ParameterValues, items: ItemDefinition[], live: LiveInventory | null): SimulationReport
{
    if (!live)
    {
        return {
            headline: "Aucune capture du jeu",
            stats:    [],
            steps:    [],
            notes:
            [
                {
                    level:   "warning",
                    message: "Ouvre ton inventaire dans le jeu, puis lance une capture (panneau Lecture du jeu) avant de simuler."
                }
            ]
        };
    }

    const furnaces = furnaceLine(Array(ASSUMED_FURNACES).fill("furnace") as FurnaceType[]);
    const plan     = planFillFurnaces(values, { furnaces, inventory: live.inventory, freeSlots: live.freeSlots }, items);
    const report   = describeFurnacePlan(plan, items);
    const time     = new Date(live.capturedAt).toLocaleTimeString("fr-FR");

    report.notes.unshift({
        level:   "info",
        message: `Inventaire lu sur la capture de ${time}. Les fours sont supposés : ${ASSUMED_FURNACES} fours vides (la lecture des fours viendra plus tard).`
    });

    return report;
}



export const fillFurnaces: TaskImplementation =
{
    scenarios: [...FAKE_SCENARIOS.map((scenario) => ({ id: scenario.id, label: scenario.label })), LIVE_SCENARIO],

    simulate(values, scenarioId, items, live)
    {
        if (scenarioId === LIVE_SCENARIO.id)
        {
            return simulateLive(values, items, live);
        }

        const scenario = FAKE_SCENARIOS.find((candidate) => candidate.id === scenarioId) ?? FAKE_SCENARIOS[0];
        const plan     = planFillFurnaces(values, scenario.environment, items);

        return describeFurnacePlan(plan, items);
    }
};
