import type { GameProfile } from "./types";



export type GameSummary =
{
    id:   string;
    name: string;
};



export function linkLegacyProfiles(profiles: GameProfile[], games: GameSummary[]): GameProfile[]
{
    return profiles.map((profile: GameProfile) =>
    {
        if (profile.gameId !== undefined)
        {
            return profile;
        }

        const key   = profile.name.trim().toLowerCase();
        const match = games.find((game: GameSummary) => game.id === key || game.name.toLowerCase() === key);

        return { name: profile.name, gameId: match ? match.id : null };
    });
}
