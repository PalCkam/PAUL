import assert           from "node:assert/strict";
import { describe, it } from "node:test";

import { addColorNoise }                                    from "./fake-gui";
import { fixtureImage, loadSlotFixtures }                   from "./fixtures-helper";
import type { SlotFixture }                                 from "./fixtures-helper";
import { iconDistance, matchIcon, sampleIcon }              from "./icons";
import type { RawImage }                                    from "./vision-types";



const FIXTURES = loadSlotFixtures();

const IRON_SLOTS = [0, 1, 2, 3, 4, 5, 6, 11, 12, 14, 21, 22, 23];
const EMPTY      = [7, 8, 25, 28];



function fixture(index: number): SlotFixture
{
    const found = FIXTURES.find((candidate) => candidate.index === index);

    assert.ok(found, `extrait ${index}`);

    return found;
}



function sampleOf(index: number): ReturnType<typeof sampleIcon>
{
    const item = fixture(index);

    return sampleIcon(fixtureImage(item), item.rect);
}



function templates(): Map<string, number[]>
{
    return new Map([["raw_iron", sampleOf(0).cells], ["coal", sampleOf(32).cells]]);
}



function lighten(image: RawImage, alpha: number): RawImage
{
    const copy: RawImage = { width: image.width, height: image.height, data: new Uint8Array(image.data) };

    for (let offset = 0; offset < copy.data.length; offset += 4)
    {
        for (let channel = 0; channel < 3; channel += 1)
        {
            copy.data[offset + channel] = Math.round(copy.data[offset + channel] * (1 - alpha) + 255 * alpha);
        }
    }

    return copy;
}



// ---------------------------------------------------------------------------
// Emplacements vides ou occupés (images réelles)
// ---------------------------------------------------------------------------

describe("emplacements vides ou occupés", () =>
{
    it("reconnaît les emplacements vides, y compris celui que la souris survole", () =>
    {
        for (const index of EMPTY)
        {
            assert.equal(sampleOf(index).empty, true, `emplacement ${index}`);
        }

        assert.ok(sampleOf(25).hoverBlend > 0.3, "le survol est repéré");
        assert.equal(sampleOf(7).hoverBlend, 0);
    });

    it("reconnaît les emplacements qui contiennent un item", () =>
    {
        for (const index of [...IRON_SLOTS, 27, 32])
        {
            assert.equal(sampleOf(index).empty, false, `emplacement ${index}`);
        }
    });
});



// ---------------------------------------------------------------------------
// Reconnaissance des items (images réelles)
// ---------------------------------------------------------------------------

describe("reconnaissance des items", () =>
{
    it("le même item, vu dans treize emplacements, a toujours presque la même apparence", () =>
    {
        const reference = sampleOf(0).cells;

        for (const index of IRON_SLOTS)
        {
            assert.ok(iconDistance(sampleOf(index).cells, reference) < 3, `emplacement ${index}`);
        }
    });

    it("des items différents ont des apparences très différentes", () =>
    {
        assert.ok(iconDistance(sampleOf(32).cells, sampleOf(0).cells) > 60);
        assert.ok(iconDistance(sampleOf(27).cells, sampleOf(0).cells) > 40);
        assert.ok(iconDistance(sampleOf(27).cells, sampleOf(32).cells) > 40);
    });

    it("retrouve le Raw Iron et le Coal appris, quel que soit l'emplacement ou la quantité", () =>
    {
        const known = templates();

        for (const index of IRON_SLOTS)
        {
            assert.equal(matchIcon(sampleOf(index).cells, known).itemId, "raw_iron", `emplacement ${index}`);
        }

        assert.equal(matchIcon(sampleOf(32).cells, known).itemId, "coal");
    });

    it("ne devine pas un item qu'il n'a jamais appris (le four, ici)", () =>
    {
        const result = matchIcon(sampleOf(27).cells, templates());

        assert.equal(result.itemId, null);
        assert.ok((result.distance ?? 0) > 40);
    });

    it("sans aucun item appris, tout est inconnu", () =>
    {
        assert.deepEqual(matchIcon(sampleOf(0).cells, new Map()), { itemId: null, distance: null });
    });

    it("reconnaît un item dont l'emplacement est survolé par la souris (éclairci)", () =>
    {
        const item = fixture(1);

        for (const alpha of [0.35, 0.43, 0.5])
        {
            const sample = sampleIcon(lighten(fixtureImage(item), alpha), item.rect);

            assert.equal(sample.empty, false);
            assert.ok(sample.hoverBlend > 0.2, `survol détecté à ${alpha}`);
            assert.equal(matchIcon(sample.cells, templates()).itemId, "raw_iron", `éclairci à ${alpha}`);
        }
    });

    it("supporte un léger bruit de couleur et un décalage d'un pixel", () =>
    {
        const item  = fixture(2);
        const noisy = addColorNoise(fixtureImage(item), 6);

        assert.equal(matchIcon(sampleIcon(noisy, item.rect).cells, templates()).itemId, "raw_iron");

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        {
            const shifted = { ...item.rect, x: item.rect.x + dx, y: item.rect.y + dy };

            assert.equal(matchIcon(sampleIcon(fixtureImage(item), shifted).cells, templates()).itemId, "raw_iron", `décalage ${dx},${dy}`);
        }
    });

    it("ne tranche pas entre deux apparences presque identiques", () =>
    {
        const base  = sampleOf(0).cells;
        const close = base.map((value, position) => (position % 97 === 0 ? Math.min(255, value + 3) : value));
        const known = new Map([["a", base], ["b", close]]);

        assert.equal(matchIcon(sampleOf(0).cells, known).itemId, null);
    });

    it("le nombre affiché sur le stack ne change pas l'apparence de l'item", () =>
    {
        const withCount    = sampleOf(0).cells;
        const withoutCount = sampleOf(14).cells;

        assert.ok(iconDistance(withCount, withoutCount) < 3);
    });
});
