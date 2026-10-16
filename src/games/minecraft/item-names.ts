import type { ItemDefinition } from "../../tasks/task-types";



export function humanizeItemId(itemId: string): string
{
    return itemId
        .split("_")
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}



export function createItemNamer(items: ItemDefinition[]): (itemId: string) => string
{
    const names = new Map(items.map((item: ItemDefinition) => [item.id, item.name]));

    return (itemId: string) => names.get(itemId) ?? humanizeItemId(itemId);
}
