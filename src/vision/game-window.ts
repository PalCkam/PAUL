export type WindowCandidate =
{
    id:   string;
    name: string;
};



export type WindowChoice =
{
    window: WindowCandidate | null;
    notice: string | null;
};



const GAME_TITLE_PATTERNS = [/^minecraft\*?\s+\d/i, /^lunar client/i, /^badlion/i, /^feather client/i];

const OWN_WINDOW_PATTERN = /^paul\b/i;

const MAX_LISTED_NAMES = 8;
const MAX_NAME_LENGTH  = 40;



export function titleKey(name: string): string
{
    return name.split(" - ")[0].trim().toLowerCase();
}



export function listCandidates(sources: { id: string; name: string }[]): WindowCandidate[]
{
    const candidates: WindowCandidate[] = [];

    for (const source of sources)
    {
        const name = source.name.trim();

        if (source.id.startsWith("window:") && name !== "" && !OWN_WINDOW_PATTERN.test(name))
        {
            candidates.push({ id: source.id, name });
        }
    }

    return candidates;
}



function isGameWindow(candidate: WindowCandidate): boolean
{
    return GAME_TITLE_PATTERNS.some((pattern: RegExp) => pattern.test(candidate.name));
}



function shorten(name: string): string
{
    return name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1)}…` : name;
}



export function pickGameWindow(candidates: WindowCandidate[], preferredKey: string | null): WindowChoice
{
    const automatic = candidates.find(isGameWindow) ?? null;

    if (preferredKey)
    {
        const chosen = candidates.find((candidate: WindowCandidate) => titleKey(candidate.name) === preferredKey);

        if (chosen)
        {
            return { window: chosen, notice: null };
        }

        return {
            window: automatic,
            notice: automatic
                ? "La fenêtre choisie n'est plus ouverte : détection automatique utilisée."
                : "La fenêtre choisie n'est plus ouverte. Tout l'écran a été capturé."
        };
    }

    if (automatic)
    {
        return { window: automatic, notice: null };
    }

    if (candidates.length === 0)
    {
        return { window: null, notice: "Aucune fenêtre trouvée : tout l'écran a été capturé." };
    }

    const names = candidates.slice(0, MAX_LISTED_NAMES).map((candidate: WindowCandidate) => shorten(candidate.name));

    return {
        window: null,
        notice: `Fenêtre du jeu non reconnue, tout l'écran a été capturé. Fenêtres ouvertes : ${names.join(" · ")}. Choisis la bonne dans l'onglet Raccourcis.`
    };
}



export function uniqueByKey(candidates: WindowCandidate[]): { key: string; name: string }[]
{
    const seen  = new Set<string>();
    const items: { key: string; name: string }[] = [];

    for (const candidate of candidates)
    {
        const key = titleKey(candidate.name);

        if (!seen.has(key))
        {
            seen.add(key);
            items.push({ key, name: candidate.name });
        }
    }

    return items;
}
