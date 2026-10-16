import { readCount } from "./digits";
import type { DigitTemplates } from "./digits";
import { iconDistance, matchIcon, sampleIcon } from "./icons";
import type { GuiDetection, RawImage, SlotRect } from "./vision-types";



export const CLUSTER_DISTANCE = 8;

export const MAX_CLUSTERS = 24;



export type IconCluster =
{
    key:   string;
    cells: number[];
    slots: string[];
    total: number | null;
};



export type KnownGroup =
{
    itemId: string;
    slots:  string[];
    total:  number | null;
};



export type ScanResult =
{
    unknown: IconCluster[];
    known:   KnownGroup[];
};



type Candidate =
{
    label:  string;
    cells:  number[];
    count:  number | null;
    itemId: string | null;
};



function addTotal(total: number | null, count: number | null, first: boolean): number | null
{
    if (count === null || (total === null && !first))
    {
        return null;
    }

    return (total ?? 0) + count;
}



function collectCandidates(
    image:     RawImage,
    detection: GuiDetection,
    digits:    DigitTemplates | null,
    templates: Map<string, number[]>
): Candidate[]
{
    const slots: { label: string; rect: SlotRect }[] = detection.inventory.map((rect: SlotRect, index: number) =>
    {
        return { label: `n° ${index + 1}`, rect };
    });

    if (detection.furnace)
    {
        slots.push(
            { label: "entrée du four",    rect: detection.furnace.input },
            { label: "carburant du four", rect: detection.furnace.fuel },
            { label: "sortie du four",    rect: detection.furnace.output }
        );
    }

    const candidates: Candidate[] = [];

    for (const slot of slots)
    {
        const sample = sampleIcon(image, slot.rect);

        if (sample.empty)
        {
            continue;
        }

        candidates.push({
            label:  slot.label,
            cells:  sample.cells,
            count:  digits ? readCount(image, slot.rect, detection.scale, digits).count : null,
            itemId: matchIcon(sample.cells, templates).itemId
        });
    }

    return candidates;
}



export function scanIcons(
    image:     RawImage,
    detection: GuiDetection,
    digits:    DigitTemplates | null,
    templates: Map<string, number[]>
): ScanResult
{
    const candidates = collectCandidates(image, detection, digits, templates);
    const known      = new Map<string, KnownGroup>();
    const unknown: IconCluster[] = [];

    for (const candidate of candidates)
    {
        if (candidate.itemId !== null)
        {
            const group = known.get(candidate.itemId);

            if (group)
            {
                group.slots.push(candidate.label);
                group.total = addTotal(group.total, candidate.count, false);
            }
            else
            {
                known.set(candidate.itemId, { itemId: candidate.itemId, slots: [candidate.label], total: addTotal(null, candidate.count, true) });
            }

            continue;
        }

        const cluster = unknown.find((existing: IconCluster) => iconDistance(candidate.cells, existing.cells) <= CLUSTER_DISTANCE);

        if (cluster)
        {
            cluster.slots.push(candidate.label);
            cluster.total = addTotal(cluster.total, candidate.count, false);
        }
        else if (unknown.length < MAX_CLUSTERS)
        {
            unknown.push({
                key:   `c${unknown.length}`,
                cells: candidate.cells,
                slots: [candidate.label],
                total: addTotal(null, candidate.count, true)
            });
        }
    }

    return { unknown, known: [...known.values()] };
}
