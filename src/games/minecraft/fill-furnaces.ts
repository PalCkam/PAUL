import type { TaskImplementation } from "../registry";
import { FAKE_SCENARIOS } from "./fake-environments";
import { planFillFurnaces } from "./fill-furnaces-plan";
import { describeFurnacePlan } from "./fill-furnaces-report";



export const fillFurnaces: TaskImplementation =
{
    scenarios: FAKE_SCENARIOS.map((scenario) => ({ id: scenario.id, label: scenario.label })),

    simulate(values, scenarioId, items)
    {
        const scenario = FAKE_SCENARIOS.find((candidate) => candidate.id === scenarioId) ?? FAKE_SCENARIOS[0];
        const plan     = planFillFurnaces(values, scenario.environment, items);

        return describeFurnacePlan(plan, items);
    }
};
