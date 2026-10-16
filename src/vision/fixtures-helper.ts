import fs   from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import type { RawImage, SlotRect } from "./vision-types";



export type SlotFixture =
{
    name:   string;
    index:  number;
    kind:   "item" | "empty";
    count:  number | null;
    scale:  number;
    rect:   SlotRect;
    width:  number;
    height: number;
    rgb:    string;
};



export function loadSlotFixtures(): SlotFixture[]
{
    const file = path.join(__dirname, "..", "..", "src", "vision", "fixtures", "real-slots.json");

    return JSON.parse(fs.readFileSync(file, "utf-8"));
}



export function fixtureImage(fixture: SlotFixture): RawImage
{
    const rgb  = zlib.inflateSync(Buffer.from(fixture.rgb, "base64"));
    const data = new Uint8Array(fixture.width * fixture.height * 4);

    for (let pixel = 0; pixel < fixture.width * fixture.height; pixel += 1)
    {
        data[pixel * 4]     = rgb[pixel * 3];
        data[pixel * 4 + 1] = rgb[pixel * 3 + 1];
        data[pixel * 4 + 2] = rgb[pixel * 3 + 2];
        data[pixel * 4 + 3] = 255;
    }

    return { width: fixture.width, height: fixture.height, data };
}
