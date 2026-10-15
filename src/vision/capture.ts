import { app, desktopCapturer, nativeImage, screen } from "electron";
import fs   from "node:fs/promises";
import path from "node:path";

import { listCandidates, pickGameWindow, uniqueByKey } from "./game-window";
import type { RawImage } from "./vision-types";



const KEPT_CAPTURES    = 20;
const SOURCE_ATTEMPTS  = 4;
const RETRY_DELAY_MS   = 250;



export type CapturedFrame =
{
    image:      RawImage;
    sourceName: string;
    sourceKind: "window" | "screen";
    blank:      boolean;
    notice:     string | null;
};



export type CaptureResult =
    | { ok: true;  frame: CapturedFrame }
    | { ok: false; message: string };



export type SavedCapture =
{
    directory:        string;
    fileName:         string;
    analysisFileName: string;
};



export function getCapturesDirectory(): string
{
    return path.join(app.getPath("userData"), "captures");
}



function bgraToRgba(bitmap: Buffer): Uint8Array
{
    const data = new Uint8Array(bitmap.length);

    for (let offset = 0; offset < bitmap.length; offset += 4)
    {
        data[offset]     = bitmap[offset + 2];
        data[offset + 1] = bitmap[offset + 1];
        data[offset + 2] = bitmap[offset];
        data[offset + 3] = 255;
    }

    return data;
}



function rgbaToBgra(image: RawImage): Buffer
{
    const bitmap = Buffer.alloc(image.data.length);

    for (let offset = 0; offset < image.data.length; offset += 4)
    {
        bitmap[offset]     = image.data[offset + 2];
        bitmap[offset + 1] = image.data[offset + 1];
        bitmap[offset + 2] = image.data[offset];
        bitmap[offset + 3] = 255;
    }

    return bitmap;
}



function isBlank(image: RawImage): boolean
{
    const step = Math.max(1, Math.floor(image.data.length / 4 / 5000));

    let total = 0;
    let count = 0;

    for (let pixel = 0; pixel < image.data.length / 4; pixel += step)
    {
        total += image.data[pixel * 4] + image.data[pixel * 4 + 1] + image.data[pixel * 4 + 2];
        count += 3;
    }

    return count === 0 || total / count < 2;
}



async function listSources(thumbnailSize: Electron.Size): Promise<Electron.DesktopCapturerSource[] | null>
{
    for (let attempt = 1; attempt <= SOURCE_ATTEMPTS; attempt += 1)
    {
        try
        {
            const sources = await desktopCapturer.getSources({ types: ["window", "screen"], thumbnailSize });

            if (sources.length > 0)
            {
                return sources;
            }
        }
        catch
        {
            return null;
        }

        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }

    return [];
}



export async function listOpenWindows(): Promise<{ key: string; name: string }[]>
{
    try
    {
        const sources = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 } });

        return uniqueByKey(listCandidates(sources));
    }
    catch
    {
        return [];
    }
}



export async function captureGameFrame(preferredKey: string | null): Promise<CaptureResult>
{
    const display = screen.getPrimaryDisplay();

    const thumbnailSize =
    {
        width:  Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor)
    };

    const sources = await listSources(thumbnailSize);

    if (sources === null)
    {
        return { ok: false, message: "La capture d'écran n'est pas autorisée par le système." };
    }

    const choice     = pickGameWindow(listCandidates(sources), preferredKey);
    const gameWindow = choice.window ? sources.find((candidate) => candidate.id === choice.window?.id) : undefined;

    const source = gameWindow ?? sources.find((candidate) => candidate.id.startsWith("screen:"));

    if (!source)
    {
        return { ok: false, message: "Aucune fenêtre ni aucun écran à capturer." };
    }

    const size = source.thumbnail.getSize();

    if (size.width === 0 || size.height === 0)
    {
        return { ok: false, message: "La capture est vide." };
    }

    const image: RawImage = { width: size.width, height: size.height, data: bgraToRgba(source.thumbnail.toBitmap()) };

    return {
        ok:    true,
        frame:
        {
            image,
            sourceName: source.name,
            sourceKind: gameWindow ? "window" : "screen",
            blank:      isBlank(image),
            notice:     choice.notice
        }
    };
}



function savePng(directory: string, fileName: string, image: RawImage): Promise<void>
{
    const png = nativeImage.createFromBitmap(rgbaToBgra(image), { width: image.width, height: image.height }).toPNG();

    return fs.writeFile(path.join(directory, fileName), png);
}



async function removeOldCaptures(directory: string): Promise<void>
{
    const names = (await fs.readdir(directory)).filter((name: string) => name.startsWith("capture-") && name.endsWith(".png")).sort();
    const stale = names.slice(0, Math.max(0, names.length - KEPT_CAPTURES * 2));

    await Promise.all(stale.map((name: string) => fs.rm(path.join(directory, name), { force: true })));
}



export async function saveCapture(frame: CapturedFrame, annotated: RawImage, date = new Date()): Promise<SavedCapture>
{
    const directory = getCapturesDirectory();
    const pad       = (value: number): string => String(value).padStart(2, "0");

    const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${String(date.getMilliseconds()).padStart(3, "0")}`;

    const fileName         = `capture-${stamp}.png`;
    const analysisFileName = `capture-${stamp}-analyse.png`;

    await fs.mkdir(directory, { recursive: true });

    await savePng(directory, fileName, frame.image);
    await savePng(directory, analysisFileName, annotated);
    await removeOldCaptures(directory);

    return { directory, fileName, analysisFileName };
}
