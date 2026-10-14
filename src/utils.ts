export function isRecord(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}



export function createLock(): <T>(task: () => Promise<T>) => Promise<T>
{
    let tail: Promise<unknown> = Promise.resolve();

    return <T>(task: () => Promise<T>): Promise<T> =>
    {
        const run = tail.then(task);

        tail = run.catch(() => undefined);

        return run;
    };
}



export function isNonEmptyString(value: unknown): value is string
{
    return typeof value === "string" && value.trim().length > 0;
}
