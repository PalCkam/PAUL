import { isRecord } from "../utils";
import type { RawImage, SlotRect } from "./vision-types";



export type DigitTemplates = Record<string, string[]>;



export type CountReading =
{
    count:      number | null;
    unreadable: boolean;
};



type GlyphReading =
    | { kind: "empty" }
    | { kind: "digit"; digit: string }
    | { kind: "unreadable" };



const GLYPH_WIDTH  = 5;
const GLYPH_HEIGHT = 7;
const GLYPH_LEFT   = 11;
const GLYPH_TOP    = 9;
const GLYPH_PITCH  = 6;
const MAX_DIGITS   = 2;

const SEARCH_RADIUS   = 2;
const WHITE_LEVEL     = 248;
const CELL_MARGIN     = 0.25;
const CELL_THRESHOLD  = 0.5;
const MIN_SET_CELLS   = 7;
const MAX_DISTANCE    = 4;



export function parseDigitTemplates(raw: unknown): { value: DigitTemplates | null; errors: string[] }
{
    if (!isRecord(raw))
    {
        return { value: null, errors: ["objet JSON attendu."] };
    }

    const errors: string[] = [];
    const templates: DigitTemplates = {};

    for (const [digit, rows] of Object.entries(raw))
    {
        const valid = /^[0-9]$/.test(digit)
            && Array.isArray(rows)
            && rows.length === GLYPH_HEIGHT
            && rows.every((row: unknown) => typeof row === "string" && row.length === GLYPH_WIDTH && /^[#.]+$/.test(row));

        if (valid)
        {
            templates[digit] = rows as string[];
        }
        else
        {
            errors.push(`chiffre "${digit}" : ${GLYPH_HEIGHT} lignes de ${GLYPH_WIDTH} caractères "#" ou "." attendues.`);
        }
    }

    return errors.length > 0 ? { value: null, errors } : { value: templates, errors: [] };
}



type Limits =
{
    right:  number;
    bottom: number;
};



function whiteFraction(image: RawImage, left: number, top: number, right: number, bottom: number, limits: Limits): number
{
    const x0 = Math.max(0, Math.round(left));
    const y0 = Math.max(0, Math.round(top));
    const x1 = Math.min(image.width - 1, Math.max(x0, Math.round(right) - 1));
    const y1 = Math.min(image.height - 1, Math.max(y0, Math.round(bottom) - 1));

    let white = 0;
    let total = 0;

    for (let y = y0; y <= y1; y += 1)
    {
        for (let x = x0; x <= x1; x += 1)
        {
            const offset = (y * image.width + x) * 4;

            total += 1;

            const insideItem = x < limits.right && y < limits.bottom;

            if (insideItem && image.data[offset] >= WHITE_LEVEL && image.data[offset + 1] >= WHITE_LEVEL && image.data[offset + 2] >= WHITE_LEVEL)
            {
                white += 1;
            }
        }
    }

    return total === 0 ? 0 : white / total;
}



function sampleGlyph(image: RawImage, left: number, top: number, scale: number, limits: Limits): string[]
{
    const rows: string[] = [];

    for (let row = 0; row < GLYPH_HEIGHT; row += 1)
    {
        let line = "";

        for (let column = 0; column < GLYPH_WIDTH; column += 1)
        {
            const fraction = whiteFraction(
                image,
                left + (column + CELL_MARGIN) * scale,
                top + (row + CELL_MARGIN) * scale,
                left + (column + 1 - CELL_MARGIN) * scale,
                top + (row + 1 - CELL_MARGIN) * scale,
                limits
            );

            line += fraction >= CELL_THRESHOLD ? "#" : ".";
        }

        rows.push(line);
    }

    return rows;
}



function distance(a: string[], b: string[]): number
{
    let differences = 0;

    for (let row = 0; row < GLYPH_HEIGHT; row += 1)
    {
        for (let column = 0; column < GLYPH_WIDTH; column += 1)
        {
            if (a[row][column] !== b[row][column])
            {
                differences += 1;
            }
        }
    }

    return differences;
}



function setCells(rows: string[]): number
{
    return rows.join("").split("#").length - 1;
}



function readGlyph(image: RawImage, slot: SlotRect, scale: number, position: number, templates: DigitTemplates): GlyphReading
{
    const left   = slot.x + (GLYPH_LEFT - GLYPH_PITCH * position) * scale;
    const top    = slot.y + GLYPH_TOP * scale;
    const limits = { right: slot.x + slot.size - 0.5, bottom: slot.y + slot.size - 0.5 };

    let anyInk = false;
    let best: { digit: string; distance: number } | null = null;

    for (let dy = -SEARCH_RADIUS; dy <= SEARCH_RADIUS; dy += 1)
    {
        for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx += 1)
        {
            const rows = sampleGlyph(image, left + dx, top + dy, scale, limits);

            if (setCells(rows) < MIN_SET_CELLS)
            {
                continue;
            }

            anyInk = true;

            for (const [digit, template] of Object.entries(templates))
            {
                const gap = distance(rows, template);

                if (best === null || gap < best.distance)
                {
                    best = { digit, distance: gap };
                }
            }
        }
    }

    if (!anyInk)
    {
        return { kind: "empty" };
    }

    return best !== null && best.distance <= MAX_DISTANCE ? { kind: "digit", digit: best.digit } : { kind: "unreadable" };
}



export function readCount(image: RawImage, slot: SlotRect, scale: number, templates: DigitTemplates): CountReading
{
    const glyphs: GlyphReading[] = [];

    for (let position = 0; position < MAX_DIGITS; position += 1)
    {
        glyphs.push(readGlyph(image, slot, scale, position, templates));
    }

    let length = 0;

    while (length < MAX_DIGITS && glyphs[length].kind !== "empty")
    {
        length += 1;
    }

    if (glyphs.slice(length).some((glyph: GlyphReading) => glyph.kind !== "empty"))
    {
        return { count: null, unreadable: true };
    }

    if (length === 0)
    {
        return { count: 1, unreadable: false };
    }

    let text = "";

    for (let position = length - 1; position >= 0; position -= 1)
    {
        const glyph = glyphs[position];

        if (glyph.kind !== "digit")
        {
            return { count: null, unreadable: true };
        }

        text += glyph.digit;
    }

    return { count: parseInt(text, 10), unreadable: false };
}
