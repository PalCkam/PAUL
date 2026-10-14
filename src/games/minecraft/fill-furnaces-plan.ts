import type { ItemDefinition, ParameterValues } from "../../tasks/types";
import { ACCEPTED_TAG, COOK_SECONDS, FURNACE_LABELS } from "./furnace-types";
import type
{
    FurnaceEnvironment,
    FurnacePlan,
    FurnaceState,
    ItemStack,
    KeptFurnace,
    PendingOutput,
    PlanAssignment,
    PlanNote,
    PlanRound
} from "./furnace-types";
import { createItemNamer } from "./item-names";



type Context =
{
    stackSize:   (itemId: string) => number;
    burnSeconds: (itemId: string) => number;
    accepts:     (type: FurnaceState["type"], itemId: string) => boolean;
    nameOf:      (itemId: string) => string;
};



type PoolEntry =
{
    furnace:      FurnaceState;
    label:        string;
    order:        number;
    existingFuel: ItemStack | null;
};



type Draft =
{
    entry:  PoolEntry;
    itemId: string;
    count:  number;
};



type Classification =
{
    free:         PoolEntry[];
    kept:         { entry: PoolEntry; stack: ItemStack }[];
    collectFirst: PendingOutput[];
    notes:        PlanNote[];
};



const PRODUCT_STACK_SIZE = 64;



function createContext(items: ItemDefinition[]): Context
{
    const catalog = new Map(items.map((item: ItemDefinition) => [item.id, item]));

    return {
        stackSize:   (itemId: string) => catalog.get(itemId)?.stackSize ?? 64,
        burnSeconds: (itemId: string) => catalog.get(itemId)?.burnSeconds ?? 0,
        accepts:     (type, itemId) => catalog.get(itemId)?.tags.includes(ACCEPTED_TAG[type]) ?? false,
        nameOf:      createItemNamer(items)
    };
}



function asStringList(value: unknown): string[]
{
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}



function stacksOf(count: number, stackSize: number): number
{
    return Math.ceil(count / stackSize);
}



function describeStack(stack: ItemStack, context: Context): string
{
    return `${context.nameOf(stack.itemId)} ×${stack.count}`;
}



function classifyFurnaces(
    furnaces:      FurnaceState[],
    selectedItems: string[],
    selectedFuels: string[],
    collectOutput: boolean,
    context:       Context
): Classification
{
    const result: Classification = { free: [], kept: [], collectFirst: [], notes: [] };

    furnaces.forEach((furnace: FurnaceState, order: number) =>
    {
        const label = `${FURNACE_LABELS[furnace.type]} ${furnace.id}`;
        const entry: PoolEntry = { furnace, label, order, existingFuel: null };

        if (furnace.output && !collectOutput)
        {
            result.notes.push({
                level:   "warning",
                message: `${label} : sa sortie contient ${describeStack(furnace.output, context)}. Vide-la ou active la récupération.`
            });
            return;
        }

        if (furnace.input)
        {
            if (selectedItems.includes(furnace.input.itemId))
            {
                result.kept.push({ entry, stack: furnace.input });
            }
            else
            {
                result.notes.push({
                    level:   "warning",
                    message: `${label} : contient déjà ${describeStack(furnace.input, context)}, ignoré.`
                });
            }

            return;
        }

        if (furnace.fuel && !selectedFuels.includes(furnace.fuel.itemId))
        {
            result.notes.push({
                level:   "warning",
                message: `${label} : contient un autre carburant (${describeStack(furnace.fuel, context)}), ignoré.`
            });
            return;
        }

        if (furnace.output)
        {
            result.collectFirst.push({
                furnaceLabel: label,
                itemId:       furnace.output.itemId,
                count:        furnace.output.count
            });
        }

        result.free.push({ ...entry, existingFuel: furnace.fuel });
    });

    return result;
}



function allocateRound(
    pool:      PoolEntry[],
    remaining: Map<string, number>,
    order:     string[],
    context:   Context
): Draft[]
{
    const types    = order.filter((itemId: string) => (remaining.get(itemId) ?? 0) > 0);
    const free     = [...pool];
    const assigned = new Map<string, PoolEntry[]>();

    const take = (itemId: string, entry: PoolEntry): void =>
    {
        free.splice(free.indexOf(entry), 1);
        assigned.get(itemId)?.push(entry);
    };

    for (const itemId of types)
    {
        assigned.set(itemId, []);

        const needed     = stacksOf(remaining.get(itemId) ?? 0, context.stackSize(itemId));
        const compatible = free.filter((entry: PoolEntry) => context.accepts(entry.furnace.type, itemId));

        for (const entry of compatible.slice(0, needed))
        {
            take(itemId, entry);
        }
    }

    for (;;)
    {
        let best: { itemId: string; entry: PoolEntry; load: number } | null = null;

        for (const itemId of types)
        {
            const group = assigned.get(itemId) ?? [];
            const total = remaining.get(itemId) ?? 0;

            if (group.length === 0 || group.length >= total)
            {
                continue;
            }

            const spare = free.find((entry: PoolEntry) => context.accepts(entry.furnace.type, itemId));

            if (!spare)
            {
                continue;
            }

            const load = total / group.length;

            if (best === null || load > best.load)
            {
                best = { itemId, entry: spare, load };
            }
        }

        if (best === null)
        {
            break;
        }

        take(best.itemId, best.entry);
    }

    const drafts: Draft[] = [];

    for (const itemId of types)
    {
        const group    = (assigned.get(itemId) ?? []).sort((a: PoolEntry, b: PoolEntry) => a.order - b.order);
        const capacity = group.length * context.stackSize(itemId);
        const total    = Math.min(remaining.get(itemId) ?? 0, capacity);

        if (group.length === 0)
        {
            continue;
        }

        const base  = Math.floor(total / group.length);
        const extra = total % group.length;

        group.forEach((entry: PoolEntry, position: number) =>
        {
            drafts.push({ entry, itemId, count: base + (position < extra ? 1 : 0) });
        });
    }

    return drafts.sort((a: Draft, b: Draft) => a.entry.order - b.entry.order);
}



function fundDraft(
    draft:         Draft,
    stocks:        Map<string, number>,
    selectedFuels: string[],
    context:       Context
): { assignment: PlanAssignment | null; reduced: boolean }
{
    const type    = draft.entry.furnace.type;
    const cook    = COOK_SECONDS[type];
    const present = draft.entry.existingFuel;

    let partial: { fuelId: string; items: number } | null = null;

    for (const fuelId of selectedFuels)
    {
        const burn = context.burnSeconds(fuelId);

        if (burn <= 0 || (present && present.itemId !== fuelId))
        {
            continue;
        }

        const have     = present ? present.count : 0;
        const stock    = stocks.get(fuelId) ?? 0;
        const room     = context.stackSize(fuelId) - have;
        const maxAdd   = Math.max(0, Math.min(stock, room));
        const maxItems = Math.floor(((have + maxAdd) * burn) / cook);

        if (maxItems >= draft.count)
        {
            const add = Math.max(0, Math.ceil((draft.count * cook) / burn) - have);

            stocks.set(fuelId, stock - add);

            return { assignment: buildAssignment(draft, draft.count, fuelId, add, have, cook), reduced: false };
        }

        if (maxItems > (partial?.items ?? 0))
        {
            partial = { fuelId, items: maxItems };
        }
    }

    if (!partial)
    {
        return { assignment: null, reduced: false };
    }

    const burn  = context.burnSeconds(partial.fuelId);
    const have  = present ? present.count : 0;
    const add   = Math.max(0, Math.ceil((partial.items * cook) / burn) - have);
    const stock = stocks.get(partial.fuelId) ?? 0;

    stocks.set(partial.fuelId, stock - add);

    return { assignment: buildAssignment(draft, partial.items, partial.fuelId, add, have, cook), reduced: true };
}



function buildAssignment(
    draft:       Draft,
    count:       number,
    fuelId:      string,
    fuelCount:   number,
    fuelPresent: number,
    cook:        number
): PlanAssignment
{
    return {
        furnaceId:    draft.entry.furnace.id,
        furnaceLabel: draft.entry.label,
        itemId:       draft.itemId,
        count,
        fuelId,
        fuelCount,
        fuelPresent,
        seconds:      count * cook
    };
}



function sumStacks(entries: { itemId: string; count: number }[]): ItemStack[]
{
    const totals = new Map<string, number>();

    for (const entry of entries)
    {
        totals.set(entry.itemId, (totals.get(entry.itemId) ?? 0) + entry.count);
    }

    return [...totals.entries()]
        .filter(([, count]) => count > 0)
        .map(([itemId, count]) => ({ itemId, count }));
}



function findInventoryProblem(
    rounds:       PlanRound[],
    collectFirst: PendingOutput[],
    environment:  FurnaceEnvironment,
    context:      Context
): string | null
{
    const products = new Map<string, number>();
    const consumed = new Map<string, number>();

    for (const pending of collectFirst)
    {
        products.set(pending.itemId, (products.get(pending.itemId) ?? 0) + pending.count);
    }

    const slotsNeeded = (): number =>
    {
        let needed = 0;

        for (const count of products.values())
        {
            needed += stacksOf(count, PRODUCT_STACK_SIZE);
        }

        return needed;
    };

    const slotsFreed = (): number =>
    {
        let freed = 0;

        for (const [itemId, count] of consumed.entries())
        {
            const have  = environment.inventory[itemId] ?? 0;
            const size  = context.stackSize(itemId);
            const taken = Math.min(count, have);

            freed += stacksOf(have, size) - stacksOf(have - taken, size);
        }

        return freed;
    };

    if (slotsNeeded() > environment.freeSlots)
    {
        return `Inventaire trop plein pour récupérer les sorties déjà présentes : il manque ${slotsNeeded() - environment.freeSlots} emplacement(s) libre(s).`;
    }

    for (const round of rounds)
    {
        for (const assignment of round.assignments)
        {
            consumed.set(assignment.itemId, (consumed.get(assignment.itemId) ?? 0) + assignment.count);
            consumed.set(assignment.fuelId, (consumed.get(assignment.fuelId) ?? 0) + assignment.fuelCount);

            const productKey = `product:${assignment.itemId}`;

            products.set(productKey, (products.get(productKey) ?? 0) + assignment.count);
        }

        const available = environment.freeSlots + slotsFreed();

        if (slotsNeeded() > available)
        {
            return `Inventaire trop plein au tour ${round.number} : il manque ${slotsNeeded() - available} emplacement(s) libre(s) pour récupérer les produits.`;
        }
    }

    return null;
}



export function planFillFurnaces(values: ParameterValues, environment: FurnaceEnvironment, items: ItemDefinition[]): FurnacePlan
{
    const context       = createContext(items);
    const selectedItems = asStringList(values.items);
    const selectedFuels = asStringList(values.fuel);
    const maxFurnaces   = typeof values.maxFurnaces === "number" ? values.maxFurnaces : undefined;
    const maxRounds     = typeof values.maxRounds === "number" ? values.maxRounds : undefined;
    const collectOutput = values.collectOutput !== false;
    const notes: PlanNote[] = [];

    const limited = maxFurnaces === undefined ? environment.furnaces : environment.furnaces.slice(0, maxFurnaces);

    if (maxFurnaces !== undefined && maxFurnaces > environment.furnaces.length)
    {
        notes.push({ level: "info", message: `${maxFurnaces} fours demandés, ${environment.furnaces.length} trouvés.` });
    }

    const classified = classifyFurnaces(limited, selectedItems, selectedFuels, collectOutput, context);

    notes.push(...classified.notes);

    const usable = [...classified.free, ...classified.kept.map((kept) => kept.entry)];

    const remaining = new Map<string, number>();

    for (const itemId of selectedItems)
    {
        const have = environment.inventory[itemId] ?? 0;

        if (have <= 0)
        {
            notes.push({ level: "warning", message: `${context.nameOf(itemId)} : aucun dans l'inventaire.` });
        }
        else if (!usable.some((entry: PoolEntry) => context.accepts(entry.furnace.type, itemId)))
        {
            notes.push({ level: "warning", message: `${context.nameOf(itemId)} : aucun four compatible.` });
        }
        else
        {
            remaining.set(itemId, have);
        }
    }

    const stocks = new Map<string, number>(selectedFuels.map((fuelId: string) => [fuelId, environment.inventory[fuelId] ?? 0]));

    if (remaining.size > 0 && ![...stocks.values()].some((count: number) => count > 0) && classified.free.every((entry: PoolEntry) => !entry.existingFuel))
    {
        notes.push({ level: "warning", message: "Aucun carburant sélectionné dans l'inventaire." });
    }

    const kept: KeptFurnace[] = classified.kept.map(({ entry, stack }) =>
    {
        return {
            furnaceLabel: entry.label,
            itemId:       stack.itemId,
            count:        stack.count,
            seconds:      stack.count * COOK_SECONDS[entry.furnace.type]
        };
    });

    const keptSeconds = Math.max(0, ...kept.map((furnace: KeptFurnace) => furnace.seconds));
    const roundLimit  = collectOutput ? (maxRounds ?? Infinity) : 1;
    const rounds: PlanRound[] = [];

    let shortage: { round: number; reduced: number; unfunded: number } | null = null;

    while (rounds.length < roundLimit && [...remaining.values()].some((count: number) => count > 0))
    {
        const number = rounds.length + 1;

        const withoutFuel = (entry: PoolEntry): PoolEntry => ({ ...entry, existingFuel: null });

        const pool = number === 1
            ? classified.free
            : [...classified.free.map(withoutFuel), ...classified.kept.map((item) => withoutFuel(item.entry))]
                .sort((a: PoolEntry, b: PoolEntry) => a.order - b.order);

        const drafts      = allocateRound(pool, remaining, selectedItems, context);
        const assignments: PlanAssignment[] = [];

        let reduced  = 0;
        let unfunded = 0;

        for (const draft of drafts)
        {
            const funded = fundDraft(draft, stocks, selectedFuels, context);

            if (!funded.assignment)
            {
                unfunded += 1;
                continue;
            }

            if (funded.reduced)
            {
                reduced += 1;
            }

            assignments.push(funded.assignment);
            remaining.set(draft.itemId, (remaining.get(draft.itemId) ?? 0) - funded.assignment.count);
        }

        if (shortage === null && (reduced > 0 || unfunded > 0))
        {
            shortage = { round: number, reduced, unfunded };
        }

        if (assignments.length === 0)
        {
            break;
        }

        const longest = Math.max(...assignments.map((assignment: PlanAssignment) => assignment.seconds));

        rounds.push({
            number,
            assignments,
            waitSeconds: Math.max(longest, number === 1 ? keptSeconds : 0)
        });
    }

    if (shortage !== null)
    {
        const found = shortage as { round: number; reduced: number; unfunded: number };

        notes.push({
            level:   "warning",
            message: `Carburant insuffisant au tour ${found.round} : ${found.reduced} four(s) chargé(s) partiellement, ${found.unfunded} sans carburant.`
        });
    }

    const leftovers = sumStacks([...remaining.entries()].map(([itemId, count]) => ({ itemId, count })));

    if (leftovers.length > 0)
    {
        const text = leftovers.map((stack: ItemStack) => describeStack(stack, context)).join(", ");

        if (!collectOutput && rounds.length >= 1)
        {
            notes.push({ level: "warning", message: `Récupération désactivée : un seul tour possible. Reste dans l'inventaire : ${text}.` });
        }
        else if (maxRounds !== undefined && rounds.length >= maxRounds)
        {
            notes.push({ level: "warning", message: `Limite de ${maxRounds} tour(s) atteinte. Reste dans l'inventaire : ${text}.` });
        }
        else
        {
            notes.push({ level: "warning", message: `Plan incomplet (carburant insuffisant ou aucun four disponible). Reste dans l'inventaire : ${text}.` });
        }
    }

    const inventoryProblem = collectOutput ? findInventoryProblem(rounds, classified.collectFirst, environment, context) : null;

    if (inventoryProblem)
    {
        notes.push({ level: "warning", message: inventoryProblem });
    }

    const assignmentsOfAll = rounds.flatMap((round: PlanRound) => round.assignments);

    return {
        rounds,
        kept,
        collectFirst: collectOutput ? classified.collectFirst : [],
        collectOutput,
        totalSeconds: rounds.reduce((total: number, round: PlanRound) => total + round.waitSeconds, 0),
        itemTotals:   sumStacks(assignmentsOfAll.map((assignment: PlanAssignment) => ({ itemId: assignment.itemId, count: assignment.count }))),
        fuelTotals:   sumStacks(assignmentsOfAll.map((assignment: PlanAssignment) => ({ itemId: assignment.fuelId, count: assignment.fuelCount }))),
        leftovers,
        notes
    };
}
