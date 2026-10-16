import type { RawImage, SlotRect } from "./vision-types";



export const ICON_CELLS = 16;

const NORMAL_FILL         = 139;
const WHITE               = 255;
const GRAY_SPREAD         = 6;
const FILL_RANGE          = { min: 120, max: 225 };
const EDGE_WIDTH          = 2;
const MIN_FILL_CELLS      = 8;
const MAX_HOVER_ALPHA     = 0.6;
const MIN_HOVER_ALPHA     = 0.05;
const EMPTY_TOLERANCE     = 7;
const EMPTY_SHARE         = 0.97;
const BACKGROUND_SPREAD   = 14;
const DIGIT_FIRST_COLUMN  = 5;
const DIGIT_FIRST_ROW     = 9;
const CELL_MARGIN         = 0.25;



export type IconSample =
{
    cells:     number[];
    empty:     boolean;
    hoverBlend: number;
};



export type IconMatch =
{
    itemId:   string | null;
    distance: number | null;
};



export const MATCH_LIMIT  = 24;
export const MATCH_MARGIN = 6;



function boxAverage(image: RawImage, left: number, top: number, right: number, bottom: number): [number, number, number]
{
    const x0 = Math.max(0, Math.min(image.width - 1, Math.round(left)));
    const y0 = Math.max(0, Math.min(image.height - 1, Math.round(top)));
    const x1 = Math.max(x0, Math.min(image.width - 1, Math.round(right) - 1));
    const y1 = Math.max(y0, Math.min(image.height - 1, Math.round(bottom) - 1));

    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;

    for (let y = y0; y <= y1; y += 1)
    {
        for (let x = x0; x <= x1; x += 1)
        {
            const offset = (y * image.width + x) * 4;

            red   += image.data[offset];
            green += image.data[offset + 1];
            blue  += image.data[offset + 2];
            count += 1;
        }
    }

    return [Math.round(red / count), Math.round(green / count), Math.round(blue / count)];
}



function rawCells(image: RawImage, slot: SlotRect): number[]
{
    const size  = slot.size / ICON_CELLS;
    const cells: number[] = [];

    for (let row = 0; row < ICON_CELLS; row += 1)
    {
        for (let column = 0; column < ICON_CELLS; column += 1)
        {
            const color = boxAverage(
                image,
                slot.x + (column + CELL_MARGIN) * size,
                slot.y + (row + CELL_MARGIN) * size,
                slot.x + (column + 1 - CELL_MARGIN) * size,
                slot.y + (row + 1 - CELL_MARGIN) * size
            );

            cells.push(color[0], color[1], color[2]);
        }
    }

    return cells;
}



function estimateFill(cells: number[]): number | null
{
    const histogram = new Map<number, number>();

    for (let cell = 0; cell < ICON_CELLS * ICON_CELLS; cell += 1)
    {
        const row    = Math.floor(cell / ICON_CELLS);
        const column = cell % ICON_CELLS;

        if (row >= EDGE_WIDTH && row < ICON_CELLS - EDGE_WIDTH && column >= EDGE_WIDTH && column < ICON_CELLS - EDGE_WIDTH)
        {
            continue;
        }

        const red   = cells[cell * 3];
        const green = cells[cell * 3 + 1];
        const blue  = cells[cell * 3 + 2];

        const gray = Math.max(red, green, blue) - Math.min(red, green, blue) <= GRAY_SPREAD;

        if (gray && green >= FILL_RANGE.min && green <= FILL_RANGE.max)
        {
            const bin = Math.round(green / 3) * 3;

            histogram.set(bin, (histogram.get(bin) ?? 0) + 1);
        }
    }

    let best: { bin: number; count: number } | null = null;

    for (const [bin, count] of histogram.entries())
    {
        if (best === null || count > best.count)
        {
            best = { bin, count };
        }
    }

    return best !== null && best.count >= MIN_FILL_CELLS ? best.bin : null;
}



function removeHover(cells: number[], alpha: number): number[]
{
    return cells.map((value: number) =>
    {
        return Math.max(0, Math.min(255, Math.round((value - WHITE * alpha) / (1 - alpha))));
    });
}



export function sampleIcon(image: RawImage, slot: SlotRect): IconSample
{
    let cells = rawCells(image, slot);

    const fill  = estimateFill(cells);
    const alpha = fill === null ? 0 : Math.max(0, Math.min(MAX_HOVER_ALPHA, (fill - NORMAL_FILL) / (WHITE - NORMAL_FILL)));

    if (alpha >= MIN_HOVER_ALPHA)
    {
        cells = removeHover(cells, alpha);
    }

    let background = 0;

    for (let cell = 0; cell < ICON_CELLS * ICON_CELLS; cell += 1)
    {
        const close = [0, 1, 2].every((channel: number) => Math.abs(cells[cell * 3 + channel] - NORMAL_FILL) <= EMPTY_TOLERANCE + (alpha >= MIN_HOVER_ALPHA ? 4 : 0));

        if (close)
        {
            background += 1;
        }
    }

    return {
        cells,
        empty:      background >= EMPTY_SHARE * ICON_CELLS * ICON_CELLS,
        hoverBlend: alpha >= MIN_HOVER_ALPHA ? alpha : 0
    };
}



function isBackground(cells: number[], cell: number): boolean
{
    return [0, 1, 2].every((channel: number) => Math.abs(cells[cell * 3 + channel] - NORMAL_FILL) <= BACKGROUND_SPREAD);
}



export function iconDistance(sample: number[], template: number[]): number
{
    let total    = 0;
    let compared = 0;

    for (let row = 0; row < ICON_CELLS; row += 1)
    {
        for (let column = 0; column < ICON_CELLS; column += 1)
        {
            if (column >= DIGIT_FIRST_COLUMN && row >= DIGIT_FIRST_ROW)
            {
                continue;
            }

            const cell = row * ICON_CELLS + column;

            if (isBackground(sample, cell) && isBackground(template, cell))
            {
                continue;
            }

            compared += 1;

            for (let channel = 0; channel < 3; channel += 1)
            {
                total += Math.abs(sample[cell * 3 + channel] - template[cell * 3 + channel]) / 3;
            }
        }
    }

    return compared === 0 ? 0 : total / compared;
}



export function matchIcon(sample: number[], templates: Map<string, number[]>): IconMatch
{
    const scored = [...templates.entries()]
        .map(([itemId, template]) => ({ itemId, distance: iconDistance(sample, template) }))
        .sort((a, b) => a.distance - b.distance);

    if (scored.length === 0)
    {
        return { itemId: null, distance: null };
    }

    const best   = scored[0];
    const second = scored[1];

    const clear = second === undefined || second.distance - best.distance >= MATCH_MARGIN;

    return best.distance <= MATCH_LIMIT && clear
        ? { itemId: best.itemId, distance: best.distance }
        : { itemId: null, distance: best.distance };
}
