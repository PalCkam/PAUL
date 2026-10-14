import assert           from "node:assert/strict";
import { describe, it } from "node:test";

import { linkLegacyProfiles } from "./profiles";



const games = [{ id: "minecraft", name: "Minecraft" }];



describe("profils des anciennes versions", () =>
{
    it("rattache un ancien profil au jeu qui porte son nom", () =>
    {
        const result = linkLegacyProfiles([{ name: "minecraft" }, { name: " Minecraft " }], games);

        assert.deepEqual(result.map((profile) => profile.gameId), ["minecraft", "minecraft"]);
    });

    it("laisse un ancien profil sans jeu connu sur « autre jeu »", () =>
    {
        const result = linkLegacyProfiles([{ name: "Elden Ring" }], games);

        assert.deepEqual(result, [{ name: "Elden Ring", gameId: null }]);
    });

    it("ne touche pas un profil dont le jeu est déjà défini", () =>
    {
        const profiles = [
            { name: "Minecraft", gameId: null },
            { name: "Serveur survie", gameId: "minecraft" }
        ];

        assert.deepEqual(linkLegacyProfiles(profiles, games), profiles);
    });
});
