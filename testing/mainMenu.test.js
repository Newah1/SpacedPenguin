import test from 'node:test';
import assert from 'node:assert/strict';
import { MenuSlingshotModel } from '../js/ui/views/mainMenu/menuSlingshotModel.js';

test('menu slingshot clamps pullback and launches opposite the drag', () => {
    const model = new MenuSlingshotModel({ maxTrailLength: 3 });
    assert.equal(model.beginDrag({ ...model.restingPosition }), true);
    model.dragTo({ x: model.anchor.x - 500, y: model.anchor.y + 200 });
    assert.ok(Math.hypot(
        model.position.x - model.anchor.x,
        model.position.y - model.anchor.y
    ) <= 72 + Number.EPSILON);

    const pulledPosition = { ...model.position };
    assert.equal(model.release(pulledPosition), true);
    assert.equal(model.launched, true);
    assert.equal(model.dragging, false);
    assert.equal(Math.sign(model.velocity.x), Math.sign(model.anchor.x - pulledPosition.x));
    assert.equal(model.consumeClickSuppression(), true);
    assert.equal(model.consumeClickSuppression(), false);
});

test('menu slingshot gravity remains presentation-only deterministic state', () => {
    const model = new MenuSlingshotModel({ maxTrailLength: 2 });
    model.position = { x: 500, y: 512 };
    model.velocity = { x: 0, y: 0 };
    model.launched = true;
    model.age = 3;
    model.lastFrameTime = 1;

    model.update(1.05);
    model.update(1.10);
    model.update(1.15);

    assert.ok(model.velocity.x > 0);
    assert.equal(model.launched, true);
    assert.equal(model.trail.length, 2);
});

test('menu slingshot resets after leaving its presentation bounds', () => {
    const model = new MenuSlingshotModel();
    model.position = { x: 901, y: 300 };
    model.velocity = { x: 1, y: 0 };
    model.launched = true;
    model.lastFrameTime = 1;

    model.update(1.01);

    assert.deepEqual(model.position, model.restingPosition);
    assert.equal(model.launched, false);
    assert.deepEqual(model.trail, []);
});
