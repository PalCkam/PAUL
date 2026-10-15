import assert           from "node:assert/strict";
import { describe, it } from "node:test";

import { listCandidates, pickGameWindow, titleKey, uniqueByKey } from "./game-window";



function windows(...names: string[]): { id: string; name: string }[]
{
    return names.map((name, position) => ({ id: `window:${position + 1}:0`, name }));
}



// ---------------------------------------------------------------------------
// Choix de la fenêtre du jeu
// ---------------------------------------------------------------------------

describe("choix de la fenêtre du jeu", () =>
{
    it("ne prend pas une fenêtre de l'Explorateur qui s'appelle « Minecraft »", () =>
    {
        const choice = pickGameWindow(listCandidates(windows("Minecraft", "Mumble", "Minecraft 1.21.4")), null);

        assert.equal(choice.window?.name, "Minecraft 1.21.4");
        assert.equal(choice.notice, null);
    });

    it("reconnaît les titres du jeu : Minecraft avec sa version, Lunar Client, Badlion, Feather", () =>
    {
        for (const title of ["Minecraft 1.21.4", "Minecraft* 1.21.4 - Singleplayer", "Minecraft* 1.20.1", "Lunar Client (1.21.4-abc/master)", "Badlion Client 1.8.9", "Feather Client"])
        {
            assert.equal(pickGameWindow(listCandidates(windows("Bureau", title)), null).window?.name, title, title);
        }
    });

    it("ne prend ni un navigateur ni un dossier qui parlent de Minecraft", () =>
    {
        const names = ["Minecraft", "Minecraft Wiki - Google Chrome", "jeux\\Minecraft", "CurseForge - Minecraft", "Lunar Client - Installer"];
        const choice = pickGameWindow(listCandidates(windows(...names.slice(0, 4))), null);

        assert.equal(choice.window, null);
    });

    it("explique quoi faire et liste les fenêtres ouvertes quand le jeu n'est pas reconnu", () =>
    {
        const choice = pickGameWindow(listCandidates(windows("Minecraft", "Mumble", "Discord")), null);

        assert.equal(choice.window, null);
        assert.match(choice.notice ?? "", /Fenêtres ouvertes : Minecraft · Mumble · Discord/);
        assert.match(choice.notice ?? "", /onglet Raccourcis/);
    });

    it("le dit clairement quand aucune fenêtre n'est trouvée", () =>
    {
        assert.match(pickGameWindow([], null).notice ?? "", /Aucune fenêtre trouvée/);
    });

    it("n'affiche que huit fenêtres au plus, avec des noms raccourcis", () =>
    {
        const names  = Array.from({ length: 12 }, (_, position) => `Fenêtre numéro ${position} ${"x".repeat(60)}`);
        const notice = pickGameWindow(listCandidates(windows(...names)), null).notice ?? "";

        assert.equal(notice.split(" · ").length, 8);
        assert.ok(notice.includes("…"));
    });

    it("la fenêtre choisie par l'utilisateur passe avant la détection automatique", () =>
    {
        const candidates = listCandidates(windows("Minecraft 1.21.4", "Mon autre jeu - Solo"));
        const choice     = pickGameWindow(candidates, titleKey("Mon autre jeu - Multijoueur"));

        assert.equal(choice.window?.name, "Mon autre jeu - Solo");
        assert.equal(choice.notice, null);
    });

    it("le titre qui change après « - » (menu, solo, serveur) reste la même fenêtre", () =>
    {
        assert.equal(titleKey("Minecraft* 1.21.4 - Singleplayer"), titleKey("Minecraft* 1.21.4 - Multiplayer (3rd-party Server)"));
        assert.equal(titleKey("Minecraft* 1.21.4 - Singleplayer"), "minecraft* 1.21.4");
    });

    it("signale que la fenêtre choisie est fermée et se rabat sur la détection automatique", () =>
    {
        const withGame    = pickGameWindow(listCandidates(windows("Minecraft 1.21.4")), "fenêtre fermée");
        const withoutGame = pickGameWindow(listCandidates(windows("Mumble")), "fenêtre fermée");

        assert.equal(withGame.window?.name, "Minecraft 1.21.4");
        assert.match(withGame.notice ?? "", /plus ouverte : détection automatique/);
        assert.equal(withoutGame.window, null);
        assert.match(withoutGame.notice ?? "", /plus ouverte/);
    });
});



// ---------------------------------------------------------------------------
// Liste des fenêtres
// ---------------------------------------------------------------------------

describe("liste des fenêtres", () =>
{
    it("ignore les écrans, les titres vides et les fenêtres de PAUL", () =>
    {
        const sources = [
            { id: "screen:0:0", name: "Écran 1" },
            { id: "window:1:0", name: "   " },
            { id: "window:2:0", name: "PAUL Raccourcis" },
            { id: "window:3:0", name: "PAUL" },
            { id: "window:4:0", name: "Mumble" }
        ];

        assert.deepEqual(listCandidates(sources).map((candidate) => candidate.name), ["Mumble"]);
    });

    it("ne garde qu'une entrée par titre", () =>
    {
        const unique = uniqueByKey(listCandidates(windows("Minecraft", "Minecraft", "Minecraft 1.21.4 - Solo", "Minecraft 1.21.4 - Multi")));

        assert.deepEqual(unique.map((item) => item.key), ["minecraft", "minecraft 1.21.4"]);
    });
});
