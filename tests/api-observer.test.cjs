const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const source = readFileSync(join(__dirname, '../chrome-extension/api-observer.js'), 'utf8');

function harness() {
    let control;
    const records = [];
    const response = { status: 200, clone: () => ({ text: async () => JSON.stringify({ status: 'SUCCESS', securityToken: 'secret', questionId: 'q1' }) }) };
    const window = {
        addEventListener: (_, callback) => { control = callback; },
        postMessage: entry => records.push(entry),
        fetch: async () => response
    };
    function XHR() {}
    XHR.prototype.open = () => {};
    XHR.prototype.send = () => {};
    vm.runInNewContext(source, { window, XMLHttpRequest: XHR, URL, URLSearchParams, Request, FormData, location: { href: 'https://hcm.k12online.vn/', origin: 'https://hcm.k12online.vn' } });
    return { window, records, response, enable: value => control({ source: window, origin: 'https://hcm.k12online.vn', data: { type: 'k12-recorder-control', enabled: value } }) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('does not record until enabled; original fetch response is unchanged', async () => {
    const h = harness();
    assert.equal(await h.window.fetch('/api/LMS/test'), h.response);
    await flush();
    assert.equal(h.records.length, 0);
});
test('records only LMS calls and redacts request and response credentials', async () => {
    const h = harness(); h.enable(true);
    await h.window.fetch('/api/LMS/test?securityToken=secret', { method: 'POST', body: 'securityToken=secret&questionId=q1' });
    await h.window.fetch('https://example.com/api/LMS/test');
    await h.window.fetch('/api/CMS/test');
    await flush();
    assert.equal(h.records.length, 1);
    assert.equal(h.records[0].entry.path, '/api/LMS/test');
    assert.equal(h.records[0].entry.query.securityToken, '[redacted]');
    assert.equal(h.records[0].entry.request.securityToken, '[redacted]');
    assert.equal(h.records[0].entry.response.securityToken, '[redacted]');
    assert.equal(h.records[0].entry.request.questionId, 'q1');
});
test('disabling recording prevents pending response from being stored', async () => {
    const h = harness(); h.enable(true);
    let finish;
    h.response.clone = () => ({ text: () => new Promise(resolve => { finish = resolve; }) });
    await h.window.fetch('/api/LMS/test');
    h.enable(false);
    finish('{"status":"SUCCESS"}');
    await flush();
    assert.equal(h.records.length, 0);
});

test('records POST payload supplied through a Request object', async () => {
    const h = harness(); h.enable(true);
    await h.window.fetch(new Request('https://hcm.k12online.vn/api/LMS/test', {
        method: 'POST', body: 'securityToken=secret&questionId=q1'
    }));
    await flush();
    await flush();
    assert.equal(h.records[0].entry.request.questionId, 'q1');
    assert.equal(h.records[0].entry.request.securityToken, '[redacted]');
});

test('does not lose repeated form fields used for multiple answers', async () => {
    const h = harness(); h.enable(true);
    await h.window.fetch('/api/LMS/test', { method: 'POST', body: 'answers%5B%5D=a&answers%5B%5D=b' });
    await flush();
    assert.deepEqual(Array.from(h.records[0].entry.request['answers[]']), ['a', 'b']);
});
test('records LMS portal redraws as metadata without storing raw HTML or unrelated services', async () => {
    const h = harness(); h.enable(true);
    h.response.clone = () => ({ text: async () => '<tr data-type="Lesson"><span>Name and private token</span></tr><li id="question6ab7e0713409d4fad702dc8c"></li>' });
    await h.window.fetch('/79000729/?module=Content.List', { method: 'POST', body: 'service=LMS.Lesson.Student.select&securityToken=secret' });
    await h.window.fetch('/79000729/', { method: 'POST', body: 'service=CMS.Account.select&username=private' });
    await flush();
    assert.equal(h.records.length, 1);
    const entry = h.records[0].entry;
    assert.equal(entry.response.lessonRows, 1);
    assert.equal(entry.response.questionGroups, 1);
    assert.equal(entry.request.securityToken, '[redacted]');
    assert.doesNotMatch(JSON.stringify(entry), /Name and private token|CMS.Account/);
});
