import type { ItemDefinition, ReportNote, SimulationReport, SimulationStep } from "../../tasks/task-types";
import type { FurnacePlan, ItemStack, PlanAssignment, PlanRound } from "./furnace-types";
import { createItemNamer } from "./item-names";



export function formatDuration(totalSeconds: number): string
{
    const seconds = Math.round(totalSeconds);

    if (seconds < 60)
    {
        return `${seconds} s`;
    }

    const hours   = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest    = seconds % 60;

    if (hours > 0)
    {
        return `${hours} h ${String(minutes).padStart(2, "0")} min`;
    }

    return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}



export function describeFurnacePlan(plan: FurnacePlan, items: ItemDefinition[]): SimulationReport
{
    const nameOf  = createItemNamer(items);
    const stackOf = (stack: ItemStack): string => `${nameOf(stack.itemId)} ×${stack.count}`;

    const notes: ReportNote[] = plan.notes.map((note) => ({ level: note.level, message: note.message }));

    if (plan.rounds.length === 0)
    {
        return {
            headline: "Rien à faire avec ces réglages.",
            stats:    [],
            steps:    [],
            notes
        };
    }

    const furnacesUsed = new Set<string>();

    for (const round of plan.rounds)
    {
        for (const assignment of round.assignments)
        {
            furnacesUsed.add(assignment.furnaceLabel);
        }
    }

    const steps: SimulationStep[] = [];

    if (plan.collectFirst.length > 0)
    {
        steps.push({
            title: "Avant de commencer",
            lines: plan.collectFirst.map((pending) =>
            {
                return `Récupérer la sortie de ${pending.furnaceLabel} : ${stackOf(pending)}`;
            })
        });
    }

    plan.rounds.forEach((round: PlanRound) =>
    {
        const lines = round.assignments.map((assignment: PlanAssignment) =>
        {
            const fuel = describeFuel(assignment, nameOf);

            return `${assignment.furnaceLabel} : ${nameOf(assignment.itemId)} ×${assignment.count}${fuel} (${formatDuration(assignment.seconds)})`;
        });

        if (round.number === 1)
        {
            for (const kept of plan.kept)
            {
                lines.push(`${kept.furnaceLabel} : déjà rempli (${nameOf(kept.itemId)} ×${kept.count}), conservé (${formatDuration(kept.seconds)})`);
            }
        }

        lines.push(`Attendre ${formatDuration(round.waitSeconds)}`);

        if (plan.collectOutput)
        {
            lines.push("Récupérer les produits cuits");
        }

        steps.push({ title: `Tour ${round.number} sur ${plan.rounds.length}`, lines });
    });

    return {
        headline: `${plan.rounds.length} tour(s) · attente totale ${formatDuration(plan.totalSeconds)}`,
        stats:
        [
            { label: "Fours utilisés", value: String(furnacesUsed.size) },
            { label: "Items à cuire",  value: plan.itemTotals.map(stackOf).join(", ") },
            { label: "Carburant",      value: plan.fuelTotals.length > 0 ? plan.fuelTotals.map(stackOf).join(", ") : "aucun à ajouter" },
            { label: "Non cuit", value: plan.leftovers.length > 0 ? plan.leftovers.map(stackOf).join(", ") : "rien" }
        ],
        steps,
        notes
    };
}



function describeFuel(assignment: PlanAssignment, nameOf: (itemId: string) => string): string
{
    const name = nameOf(assignment.fuelId);

    if (assignment.fuelCount === 0)
    {
        return ` · carburant déjà présent (${name} ×${assignment.fuelPresent})`;
    }

    if (assignment.fuelPresent > 0)
    {
        return ` + ${name} ×${assignment.fuelCount} (en plus de ×${assignment.fuelPresent} déjà présents)`;
    }

    return ` + ${name} ×${assignment.fuelCount}`;
}
