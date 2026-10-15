import type { GuiDetection, RawImage, SlotRect } from "./vision-types";



const OUTLINE_COLOR   = [255, 40, 40];
const FURNACE_COLOR   = [40, 200, 255];



function drawRect(image: RawImage, rect: SlotRect, color: number[], thickness: number): void
{
    for (let y = rect.y; y < rect.y + rect.size; y += 1)
    {
        for (let x = rect.x; x < rect.x + rect.size; x += 1)
        {
            const onBorder = x < rect.x + thickness || x >= rect.x + rect.size - thickness
                || y < rect.y + thickness || y >= rect.y + rect.size - thickness;

            if (!onBorder || x < 0 || y < 0 || x >= image.width || y >= image.height)
            {
                continue;
            }

            const offset = (y * image.width + x) * 4;

            image.data[offset]     = color[0];
            image.data[offset + 1] = color[1];
            image.data[offset + 2] = color[2];
            image.data[offset + 3] = 255;
        }
    }
}



export function annotateDetection(image: RawImage, detection: GuiDetection): RawImage
{
    const copy: RawImage = { width: image.width, height: image.height, data: new Uint8Array(image.data) };

    if (!detection.found)
    {
        return copy;
    }

    const thickness = Math.max(1, Math.round(detection.scale / 2));

    for (const slot of detection.inventory)
    {
        drawRect(copy, slot, OUTLINE_COLOR, thickness);
    }

    if (detection.furnace)
    {
        drawRect(copy, detection.furnace.input,  FURNACE_COLOR, thickness);
        drawRect(copy, detection.furnace.fuel,   FURNACE_COLOR, thickness);
        drawRect(copy, detection.furnace.output, FURNACE_COLOR, thickness);
    }

    return copy;
}
