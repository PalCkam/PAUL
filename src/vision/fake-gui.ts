import type { RawImage } from "./vision-types";



export type FakeGuiOptions =
{
    width:    number;
    height:   number;
    scale:    number;
    originX:  number;
    originY:  number;
    furnace:  boolean;
    hotbar?:  boolean;
    items?:   boolean;
    decoys?:  boolean;
    seed?:    number;
};



type Color = [number, number, number];

const PANEL: Color = [198, 198, 198];
const FILL:  Color = [139, 139, 139];
const DARK:  Color = [55, 55, 55];
const LIGHT: Color = [255, 255, 255];



function createRandom(seed: number): () => number
{
    let state = seed;

    return () =>
    {
        state = (state * 1664525 + 1013904223) % 4294967296;

        return state / 4294967296;
    };
}



function fillRect(image: RawImage, x: number, y: number, width: number, height: number, color: Color): void
{
    for (let row = Math.max(0, y); row < Math.min(image.height, y + height); row += 1)
    {
        for (let column = Math.max(0, x); column < Math.min(image.width, x + width); column += 1)
        {
            const offset = (row * image.width + column) * 4;

            image.data[offset]     = color[0];
            image.data[offset + 1] = color[1];
            image.data[offset + 2] = color[2];
            image.data[offset + 3] = 255;
        }
    }
}



export function resampleNearest(image: RawImage, width: number, height: number): RawImage
{
    const result: RawImage = { width, height, data: new Uint8Array(width * height * 4) };

    for (let y = 0; y < height; y += 1)
    {
        const sourceY = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / height));

        for (let x = 0; x < width; x += 1)
        {
            const sourceX = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / width));
            const from    = (sourceY * image.width + sourceX) * 4;
            const to      = (y * width + x) * 4;

            result.data[to]     = image.data[from];
            result.data[to + 1] = image.data[from + 1];
            result.data[to + 2] = image.data[from + 2];
            result.data[to + 3] = 255;
        }
    }

    return result;
}



export function addColorNoise(image: RawImage, amplitude: number, seed = 7): RawImage
{
    const random = createRandom(seed);
    const result: RawImage = { width: image.width, height: image.height, data: new Uint8Array(image.data) };

    for (let offset = 0; offset < result.data.length; offset += 4)
    {
        for (let channel = 0; channel < 3; channel += 1)
        {
            const value = result.data[offset + channel] + Math.round((random() * 2 - 1) * amplitude);

            result.data[offset + channel] = Math.max(0, Math.min(255, value));
        }
    }

    return result;
}



export function breakSlotBorder(image: RawImage, options: FakeGuiOptions, row: number, column: number): void
{
    const x = options.originX + (7 + column * 18) * options.scale;
    const y = options.originY + (83 + row * 18) * options.scale;

    fillRect(image, x, y, 18 * options.scale, options.scale, FILL);
}



export function renderFakeGui(options: FakeGuiOptions): RawImage
{
    const { width, height, scale, originX, originY } = options;
    const random = createRandom(options.seed ?? 1);
    const image: RawImage = { width, height, data: new Uint8Array(width * height * 4) };

    for (let y = 0; y < height; y += 1)
    {
        for (let x = 0; x < width; x += 1)
        {
            const shade  = 40 + Math.floor(60 * (y / height)) + Math.floor(random() * 25);
            const offset = (y * width + x) * 4;

            image.data[offset]     = shade;
            image.data[offset + 1] = shade + 30;
            image.data[offset + 2] = shade + 10;
            image.data[offset + 3] = 255;
        }
    }

    if (options.decoys)
    {
        fillRect(image, 10, 10, 220, 3, DARK);
        fillRect(image, 10, 40, 150, 2, DARK);
        fillRect(image, width - 400, height - 60, 360, 4, DARK);
    }

    fillRect(image, originX, originY, 176 * scale, 166 * scale, PANEL);

    const drawSlot = (guiX: number, guiY: number, withItem: boolean): void =>
    {
        const x = originX + guiX * scale;
        const y = originY + guiY * scale;

        fillRect(image, x, y, 18 * scale, 18 * scale, PANEL);
        fillRect(image, x + scale, y + scale, 16 * scale, 16 * scale, FILL);
        fillRect(image, x, y, 17 * scale, scale, DARK);
        fillRect(image, x, y, scale, 17 * scale, DARK);
        fillRect(image, x + scale, y + 17 * scale, 17 * scale, scale, LIGHT);
        fillRect(image, x + 17 * scale, y + scale, scale, 17 * scale, LIGHT);

        if (withItem)
        {
            const color: Color = [Math.floor(random() * 200), Math.floor(random() * 200) + 30, Math.floor(random() * 255)];

            fillRect(image, x + 2 * scale, y + 2 * scale, 14 * scale, 14 * scale, color);
        }
    };

    for (let row = 0; row < 3; row += 1)
    {
        for (let column = 0; column < 9; column += 1)
        {
            drawSlot(7 + column * 18, 83 + row * 18, !!options.items && random() > 0.4);
        }
    }

    if (options.hotbar !== false)
    {
        for (let column = 0; column < 9; column += 1)
        {
            drawSlot(7 + column * 18, 141, !!options.items && random() > 0.3);
        }
    }

    if (options.furnace)
    {
        drawSlot(55, 16, !!options.items);
        drawSlot(55, 52, !!options.items);

        const x = originX + 111 * scale;
        const y = originY + 30 * scale;

        fillRect(image, x, y, 26 * scale, 26 * scale, FILL);
        fillRect(image, x, y, 25 * scale, scale, DARK);
        fillRect(image, x, y, scale, 25 * scale, DARK);
        fillRect(image, x + scale, y + 25 * scale, 25 * scale, scale, LIGHT);
        fillRect(image, x + 25 * scale, y + scale, scale, 25 * scale, LIGHT);
    }

    return image;
}
