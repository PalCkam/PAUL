export type RawImage =
{
    width:  number;
    height: number;
    data:   Uint8Array;
};



export type SlotRect =
{
    x:    number;
    y:    number;
    size: number;
};



export type GuiScreen = "inventory" | "furnace";



export type GuiDetection =
{
    found:     boolean;
    screen:    GuiScreen | null;
    scale:     number;
    inventory: SlotRect[];
    hotbar:    boolean;
    furnace:   { input: SlotRect; fuel: SlotRect; output: SlotRect } | null;
};



export const EMPTY_DETECTION: GuiDetection =
{
    found:     false,
    screen:    null,
    scale:     0,
    inventory: [],
    hotbar:    false,
    furnace:   null
};
