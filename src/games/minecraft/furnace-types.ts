export type FurnaceType = "furnace" | "blast_furnace" | "smoker";



export type ItemStack =
{
    itemId: string;
    count:  number;
};



export type FurnaceState =
{
    id:     string;
    type:   FurnaceType;
    input:  ItemStack | null;
    fuel:   ItemStack | null;
    output: ItemStack | null;
};



export type FurnaceEnvironment =
{
    furnaces:  FurnaceState[];
    inventory: Record<string, number>;
    freeSlots: number;
};



export type PlanAssignment =
{
    furnaceId:     string;
    furnaceLabel:  string;
    itemId:        string;
    count:         number;
    fuelId:        string;
    fuelCount:     number;
    fuelPresent:   number;
    seconds:       number;
};



export type PlanRound =
{
    number:      number;
    assignments: PlanAssignment[];
    waitSeconds: number;
};



export type KeptFurnace =
{
    furnaceLabel: string;
    itemId:       string;
    count:        number;
    seconds:      number;
};



export type PendingOutput =
{
    furnaceLabel: string;
    itemId:       string;
    count:        number;
};



export type PlanNote =
{
    level:   "info" | "warning";
    message: string;
};



export type FurnacePlan =
{
    rounds:        PlanRound[];
    kept:          KeptFurnace[];
    collectFirst:  PendingOutput[];
    collectOutput: boolean;
    totalSeconds:  number;
    itemTotals:    ItemStack[];
    fuelTotals:    ItemStack[];
    leftovers:     ItemStack[];
    notes:         PlanNote[];
};



export const FURNACE_LABELS: Record<FurnaceType, string> =
{
    furnace:       "Furnace",
    blast_furnace: "Blast Furnace",
    smoker:        "Smoker"
};



export const COOK_SECONDS: Record<FurnaceType, number> =
{
    furnace:       10,
    blast_furnace: 5,
    smoker:        5
};



export const ACCEPTED_TAG: Record<FurnaceType, string> =
{
    furnace:       "smeltable",
    blast_furnace: "blastable",
    smoker:        "smokable"
};
