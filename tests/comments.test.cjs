const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const origin = 'https://hcm.k12online.vn';
const source = fs.readFileSync('chrome-extension/content.js', 'utf8')
    .replace(/    if \(document\.readyState === 'loading'\) \{[\s\S]*?\n\}\)\(\);\s*$/, '    globalThis.comment = submitAutomaticComment; globalThis.complete = runCompletionWorkflow;\n})();');
function harness(responses = [], rule = { exerciseMode: 'comment', materialComment: false }) {
    const data = { k12AutoCommentEnabled: false, k12AutoCommentProfile: { name: 'Nguyễn A', className: '12A1', studentId: '01' }, k12SubjectRules: { 'Hóa học': rule } };
    const calls = [];
    const scope = { URL, URLSearchParams, document: parseHTML('<body></body>').document,
        location: { origin }, DOMParser: class { parseFromString(html) { return parseHTML(html).document; } },
        chrome: { storage: { local: {
            get: async defaults => typeof defaults === 'string' ? { [defaults]: data[defaults] } : { ...defaults, ...data },
            set: async value => Object.assign(data, value)
        } } },
        fetch: async (url, options) => { calls.push({url,options}); const response = responses.shift(); if (response instanceof Error) throw response; if (!response) throw Error('Unexpected fetch'); return response; }
    };
    vm.createContext(scope);
    vm.runInContext(fs.readFileSync('chrome-extension/ai-common.js', 'utf8'), scope);
    vm.runInContext(source, scope);
    return { scope, calls, data };
}
const context = { objectType: 'Courseware.Exercise', objectId: 'exercise', lessonId: 'lesson', site: '2003644', securityToken: 'fixture-token' };
test('comment-only sends name, class, code and answer summary in order, then deduplicates', async () => {
    const h = harness([{ok:true,text:async()=>JSON.stringify({status:'SUCCESS',id:'comment-1'})}]);
    assert.equal((await h.scope.comment(context, 'Câu 1: A; Câu 2: D', 'Hóa học')).commented, true);
    const body = new URLSearchParams(h.calls[0].options.body);
    assert.equal(body.get('fields[title]'), 'Nguyễn A - 12A1 - 01 - Câu 1: A; Câu 2: D');
    assert.equal(body.get('fields[objectId]'), 'exercise');
    assert.equal((await h.scope.comment(context, 'Câu 1: A; Câu 2: D', 'Hóa học')).duplicateSkipped, true);
    assert.equal(h.calls.length, 1);
});
test('material comments can be disabled independently from exercise comments', async () => {
    const h = harness();
    const result = await h.scope.comment({...context,objectType:'Courseware.PDF'}, '', 'Hóa học');
    assert.equal(result.commented, false);
    assert.equal(h.calls.length, 0);
});
test('ambiguous comment transport failure is not retried automatically', async () => {
    const h = harness([Error('connection closed')]);
    await assert.rejects(h.scope.comment(context, 'Câu 1: A', 'Hóa học'));
    const result = await h.scope.comment(context, 'Câu 1: A', 'Hóa học');
    assert.equal(result.ok, false);
    assert.match(result.message, /chưa xác định/);
    assert.equal(h.calls.length, 1);
});
test('PDF completion requires the refreshed K12 percentage before success', async () => {
    for (const percent of ['0', '100']) {
        const h = harness([{ok:true,text:async()=>JSON.stringify({status:'SUCCESS'})},
            {ok:true,url:origin+'/lesson',text:async()=>`<span class="coursewarePercentpdf">${percent}</span>`}]);
        const result = await h.scope.complete({kind:'courseware',pageUrl:origin+'/lesson',subject:'Hóa học',
            payload:{coursewareId:'pdf','options[coursewareType]':'Courseware.PDF'}, commentContext:context});
        assert.equal(result.completed, percent === '100');
        assert.equal(result.ok, percent === '100');
    }
});
