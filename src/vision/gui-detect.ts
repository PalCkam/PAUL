import { EMPTY_DETECTION } from "./vision-types";
import type { GuiDetection, RawImage, SlotRect } from "./vision-types";



const DARK_GRAY   = 55;
const TOLERANCE   = 12;
const MIN_RUN     = 14;
const MIN_SCALE   = 1;
const MAX_SCALE   = 16;
const SLOT_COUNT  = 9;
const MIN_MATCHES = 8;
const MAIN_ROWS   = 3;

const POSITION_TOLERANCE = 2.2;
const LENGTH_TOLERANCE   = 2.5;
const BAND_TOLERANCE     = 3.2;

const BORDER_ORIGIN_X = 7;
const BORDER_ORIGIN_Y = 83;
const HOTBAR_GAP      = 58;
const FURNACE_INPUT   = { x: 55, y: 16 };
const FURNACE_FUEL    = { x: 55, y: 52 };
const FURNACE_OUTPUT  = { x: 116, y: 35 };



type Run =
{
    x:      number;
    length: number;
};



type Chain =
{
    x:     number;
    pitch: number;
    scale: number;
};



type Band =
{
    y:     number;
    chain: Chain;
};



function isDark(data: Uint8Array, offset: number): boolean
{
    return Math.abs(data[offset] - DARK_GRAY) <= TOLERANCE
        && Math.abs(data[offset + 1] - DARK_GRAY) <= TOLERANCE
        && Math.abs(data[offset + 2] - DARK_GRAY) <= TOLERANCE;
}



function findRuns(image: RawImage): Map<number, Run[]>
{
    const rows = new Map<number, Run[]>();

    for (let y = 0; y < image.height; y += 1)
    {
        const runs: Run[] = [];

        let x = 0;

        while (x < image.width)
        {
            if (!isDark(image.data, (y * image.width + x) * 4))
            {
                x += 1;
                continue;
            }

            const start = x;

            while (x < image.width && isDark(image.data, (y * image.width + x) * 4))
            {
                x += 1;
            }

            if (x - start >= MIN_RUN)
            {
                runs.push({ x: start, length: x - start });
            }
        }

        if (runs.length > 0)
        {
            rows.set(y, runs);
        }
    }

    return rows;
}



function matchesSlot(runs: Run[], x: number, scale: number): boolean
{
    return runs.some((run: Run) =>
    {
        return Math.abs(run.x - x) <= POSITION_TOLERANCE && Math.abs(run.length - 17 * scale) <= LENGTH_TOLERANCE;
    });
}



function refineChain(runs: Run[], chain: Chain): Chain
{
    const points: { column: number; x: number }[] = [];

    for (let column = 0; column < SLOT_COUNT; column += 1)
    {
        const expected = chain.x + column * chain.pitch;
        const run      = runs.find((candidate: Run) => Math.abs(candidate.x - expected) <= POSITION_TOLERANCE);

        if (run && Math.abs(run.length - 17 * chain.scale) <= LENGTH_TOLERANCE)
        {
            points.push({ column, x: run.x });
        }
    }

    const count   = points.length;
    const meanCol = points.reduce((total: number, point) => total + point.column, 0) / count;
    const meanX   = points.reduce((total: number, point) => total + point.x, 0) / count;

    let numerator   = 0;
    let denominator = 0;

    for (const point of points)
    {
        numerator   += (point.column - meanCol) * (point.x - meanX);
        denominator += (point.column - meanCol) ** 2;
    }

    if (denominator === 0)
    {
        return chain;
    }

    const pitch = numerator / denominator;

    return { x: meanX - meanCol * pitch, pitch, scale: pitch / 18 };
}



function findChain(runs: Run[]): Chain | null
{
    if (runs.length < MIN_MATCHES)
    {
        return null;
    }

    for (let first = 0; first < runs.length; first += 1)
    {
        for (let other = first + 1; other < runs.length; other += 1)
        {
            for (let steps = 1; steps < SLOT_COUNT; steps += 1)
            {
                const pitch = (runs[other].x - runs[first].x) / steps;
                const scale = pitch / 18;

                if (scale < MIN_SCALE || scale > MAX_SCALE)
                {
                    continue;
                }

                if (!matchesSlot(runs, runs[first].x, scale))
                {
                    continue;
                }

                let matches = 0;

                for (let column = 0; column < SLOT_COUNT; column += 1)
                {
                    if (matchesSlot(runs, runs[first].x + column * pitch, scale))
                    {
                        matches += 1;
                    }
                }

                if (matches >= MIN_MATCHES)
                {
                    return refineChain(runs, { x: runs[first].x, pitch, scale });
                }
            }
        }
    }

    return null;
}



function findBands(rows: Map<number, Run[]>): Band[]
{
    const bands: Band[] = [];

    let previous: Band | null = null;
    let previousY             = -2;

    for (const y of [...rows.keys()].sort((a: number, b: number) => a - b))
    {
        const chain = findChain(rows.get(y) as Run[]);

        if (!chain)
        {
            continue;
        }

        const sameBand = previous !== null
            && y === previousY + 1
            && Math.abs(chain.x - previous.chain.x) <= POSITION_TOLERANCE
            && Math.abs(chain.scale - previous.chain.scale) <= 0.08 * previous.chain.scale;

        if (!sameBand)
        {
            previous = { y, chain };
            bands.push(previous);
        }

        previousY = y;
    }

    return bands;
}



function hasSlotNear(rows: Map<number, Run[]>, x: number, y: number, scale: number): boolean
{
    for (let offset = -2; offset <= 2; offset += 1)
    {
        if (matchesSlot(rows.get(Math.round(y) + offset) ?? [], x, scale))
        {
            return true;
        }
    }

    return false;
}



function slotRect(borderX: number, borderY: number, scale: number): SlotRect
{
    return { x: Math.round(borderX + scale), y: Math.round(borderY + scale), size: Math.round(16 * scale) };
}



function sameColumn(a: Chain, b: Chain): boolean
{
    return Math.abs(a.x - b.x) <= POSITION_TOLERANCE && Math.abs(a.scale - b.scale) <= 0.08 * a.scale;
}



function findBandNear(bands: Band[], y: number, reference: Chain): Band | undefined
{
    return bands.find((band: Band) => Math.abs(band.y - y) <= BAND_TOLERANCE && sameColumn(band.chain, reference));
}



export function detectGui(image: RawImage): GuiDetection
{
    const rows  = findRuns(image);
    const bands = findBands(rows);

    for (const top of bands)
    {
        const { chain } = top;

        const second = findBandNear(bands, top.y + chain.pitch, chain);
        const third  = findBandNear(bands, top.y + 2 * chain.pitch, chain);

        if (!second || !third || top.y < BORDER_ORIGIN_Y * chain.scale * 0.9)
        {
            continue;
        }

        return buildDetection(rows, bands, top, [top, second, third]);
    }

    return EMPTY_DETECTION;
}



function buildDetection(rows: Map<number, Run[]>, bands: Band[], top: Band, mainBands: Band[]): GuiDetection
{
    const { chain } = top;
    const scale     = chain.scale;
    const slots: SlotRect[] = [];

    for (const band of mainBands)
    {
        for (let column = 0; column < SLOT_COUNT; column += 1)
        {
            slots.push(slotRect(chain.x + column * chain.pitch, band.y, scale));
        }
    }

    const hotbarBand = findBandNear(bands, top.y + HOTBAR_GAP * scale, chain);

    if (hotbarBand)
    {
        for (let column = 0; column < SLOT_COUNT; column += 1)
        {
            slots.push(slotRect(chain.x + column * chain.pitch, hotbarBand.y, scale));
        }
    }

    const originX = chain.x - BORDER_ORIGIN_X * scale;
    const originY = top.y - BORDER_ORIGIN_Y * scale;

    const inputX = originX + FURNACE_INPUT.x * scale;
    const inputY = originY + FURNACE_INPUT.y * scale;
    const fuelX  = originX + FURNACE_FUEL.x * scale;
    const fuelY  = originY + FURNACE_FUEL.y * scale;

    const isFurnace = hasSlotNear(rows, inputX, inputY, scale) && hasSlotNear(rows, fuelX, fuelY, scale);

    return {
        found:     true,
        screen:    isFurnace ? "furnace" : "inventory",
        scale,
        inventory: slots,
        hotbar:    hotbarBand !== undefined,
        furnace:   isFurnace
            ? {
                input:  slotRect(inputX, inputY, scale),
                fuel:   slotRect(fuelX, fuelY, scale),
                output: {
                    x:    Math.round(originX + FURNACE_OUTPUT.x * scale),
                    y:    Math.round(originY + FURNACE_OUTPUT.y * scale),
                    size: Math.round(16 * scale)
                }
            }
            : null
    };
}
