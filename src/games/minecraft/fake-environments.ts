import type { FurnaceEnvironment, FurnaceState, FurnaceType, ItemStack } from "./furnace-types";



export type FakeScenario =
{
    id:          string;
    label:       string;
    environment: FurnaceEnvironment;
};



function stack(itemId: string, count: number): ItemStack
{
    return { itemId, count };
}



function furnaceLine(types: FurnaceType[], overrides: Record<string, Partial<FurnaceState>> = {}): FurnaceState[]
{
    return types.map((type: FurnaceType, position: number) =>
    {
        const id = String(position + 1);

        return { id, type, input: null, fuel: null, output: null, ...overrides[id] };
    });
}



const EIGHT_FURNACES: FurnaceType[] = Array(8).fill("furnace");



export const FAKE_SCENARIOS: FakeScenario[] =
[
    {
        id:          "full",
        label:       "8 fours vides, 16 stacks de Raw Iron, 160 Coal",
        environment:
        {
            furnaces:  furnaceLine(EIGHT_FURNACES),
            inventory: { raw_iron: 1024, coal: 160 },
            freeSlots: 4
        }
    },
    {
        id:          "low-fuel",
        label:       "Peu de carburant (8 fours, 512 Raw Iron, 20 Coal)",
        environment:
        {
            furnaces:  furnaceLine(EIGHT_FURNACES),
            inventory: { raw_iron: 512, coal: 20 },
            freeSlots: 10
        }
    },
    {
        id:          "resume",
        label:       "Reprise : fours déjà en partie remplis",
        environment:
        {
            furnaces: furnaceLine(EIGHT_FURNACES,
            {
                "1": { input: stack("raw_iron", 64), fuel: stack("coal", 8) },
                "2": { input: stack("raw_iron", 64), fuel: stack("coal", 8) },
                "3": { input: stack("raw_iron", 64), fuel: stack("coal", 8) },
                "4": { input: stack("raw_copper", 32), fuel: stack("coal", 4) },
                "5": { output: stack("iron_ingot", 12) }
            }),
            inventory: { raw_iron: 320, coal: 100 },
            freeSlots: 12
        }
    },
    {
        id:          "full-inventory",
        label:       "Inventaire presque plein, sortie déjà présente",
        environment:
        {
            furnaces:  furnaceLine(EIGHT_FURNACES, { "8": { output: stack("iron_ingot", 64) } }),
            inventory: { raw_iron: 64, coal: 100 },
            freeSlots: 0
        }
    },
    {
        id:          "mixed",
        label:       "Fours mélangés (4 Blast Furnace, 2 Smoker, 2 Furnace)",
        environment:
        {
            furnaces: furnaceLine(["blast_furnace", "blast_furnace", "blast_furnace", "blast_furnace", "smoker", "smoker", "furnace", "furnace"]),
            inventory: { raw_iron: 200, raw_copper: 100, raw_beef: 128, sand: 64, coal: 120 },
            freeSlots: 20
        }
    }
];
