const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

test('opens only the observed native exercise control, without executing URL text', () => {
    const { document } = parseHTML('<a href="javascript:VHV.App.modules[2].doExercise()">Làm bài</a>');
    let handler;
    let calls = 0;
    const window = { addEventListener: (_, fn) => { handler = fn; }, VHV: { App: { modules: { 2: { doExercise() { calls++; } } } } } };
    const origin = 'https://hcm.k12online.vn';
    vm.runInNewContext(fs.readFileSync('chrome-extension/page-actions.js', 'utf8'), { window, document, location: { origin } });
    const data = { type: 'k12-open-exercise', moduleIndex: 2 };
    handler({ source: {}, origin, data });
    handler({ source: window, origin: 'https://example.com', data });
    handler({ source: window, origin, data: { ...data, moduleIndex: '2' } });
    handler({ source: window, origin, data: { ...data, moduleIndex: 3 } });
    assert.equal(calls, 0);
    handler({ source: window, origin, data });
    assert.equal(calls, 1);
    document.body.insertAdjacentHTML('beforeend', '<div class="doExercise-pdf"><form></form></div>');
    handler({ source: window, origin, data });
    assert.equal(calls, 1);
});
