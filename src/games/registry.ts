import type { ItemDefinition, ParameterValues, SimulationReport, SimulationScenario } from "../tasks/types";
import { fillFurnaces } from "./minecraft/fill-furnaces";



export type TaskImplementation =
{
    scenarios: SimulationScenario[];
    simulate(values: ParameterValues, scenarioId: string, items: ItemDefinition[]): SimulationReport;
};



const IMPLEMENTATIONS: Record<string, TaskImplementation> =
{
    "minecraft/fill-furnaces": fillFurnaces
};



export function getTaskImplementation(gameId: string, taskId: string): TaskImplementation | null
{
    return IMPLEMENTATIONS[`${gameId}/${taskId}`] ?? null;
}
