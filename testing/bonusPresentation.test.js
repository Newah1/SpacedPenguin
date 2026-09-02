import test from 'node:test';
import assert from 'node:assert/strict';

import { RUNTIME_CONSTRUCTOR_CATALOG } from '../js/runtime/runtimeConstructorCatalog.js';

test('collected runtime bonuses keep rendering and animating their hit sprite', () => {
    const normalSprite = { complete: true, name: 'bonus' };
    const hitSprite = { complete: true, name: 'bonus_hit' };
    const assetLoader = {
        getGameSprite(key) {
            return key === 'bonus_hit' ? hitSprite : normalSprite;
        }
    };
    const Bonus = RUNTIME_CONSTRUCTOR_CATALOG.Bonus;
    const bonus = new Bonus(100, 100, 250, assetLoader);

    assert.equal(bonus.collect(), 250);
    assert.equal(bonus.state, 'Hit');
    assert.equal(bonus.collected, true);
    assert.equal(bonus.currentSprite, hitSprite);

    const rotationBeforeUpdate = bonus.rotation;
    bonus.update(1 / 60, { updateOrbit: false });
    assert.ok(bonus.rotation > rotationBeforeUpdate);
    assert.equal(bonus.collected, true);

    const calls = [];
    const context = {
        save: () => calls.push(['save']),
        restore: () => calls.push(['restore']),
        translate: (...args) => calls.push(['translate', ...args]),
        rotate: (...args) => calls.push(['rotate', ...args]),
        drawImage: (...args) => calls.push(['drawImage', ...args]),
        set globalAlpha(value) { calls.push(['globalAlpha', value]); }
    };

    bonus.drawSprite(context);

    const drawCall = calls.find(([method]) => method === 'drawImage');
    assert.ok(drawCall, 'expected collected bonus to remain visible');
    assert.equal(drawCall[1], hitSprite);
    assert.equal(bonus.collected, true);
});
