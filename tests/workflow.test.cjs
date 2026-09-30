const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const scope = {};
vm.createContext(scope);
for (const file of ['ai-common', 'lesson-workflow']) vm.runInContext(fs.readFileSync(`chrome-extension/${file}.js`, 'utf8'), scope);
const exercise = { coursewareId: 'exercise', coursewareType: 'Courseware.Exercise', progress: '0%', title: 'Bài tập' };
function harness() {
    const calls = [];
    const api = Object.fromEntries(['prepare', 'solve', 'submit', 'comment', 'complete', 'release'].map(name => [name, async () => {
        calls.push(name);
        if (name === 'prepare') return { ok: true, tabId: 7, exercise: { questions: [] } };
        if (name === 'submit') return { ok: true, submitted: true, completed: true };
        if (name === 'comment') return { ok: true, commented: true };
        if (name === 'complete') return { ok: true, completed: true, message: '100%' };
        return {};
    }]));
    return { api, calls };
}
test('comment-only subject solves and comments without submitting answers', async () => {
    const h = harness();
    const result = await scope.K12Workflow.run([exercise], scope.K12AI.subjectRule({ exerciseMode: 'comment' }), h.api);
    assert.equal(result.ok, true);
    assert.equal(result.completed, false);
    assert.deepEqual(h.calls, ['prepare', 'solve', 'comment', 'release']);
});
test('both mode submits and verifies before commenting', async () => {
    const h = harness();
    const result = await scope.K12Workflow.run([exercise], scope.K12AI.subjectRule({ exerciseMode: 'both' }), h.api);
    assert.equal(result.completed, true);
    assert.deepEqual(h.calls, ['prepare', 'solve', 'submit', 'comment', 'release']);
});
test('completed submission and disabled material actions are skipped', async () => {
    const h = harness();
    await scope.K12Workflow.run([{ ...exercise, progress: '100%' }, { coursewareType: 'Courseware.PDF' }], scope.K12AI.subjectRule({ exerciseMode: 'submit', view: false }), h.api);
    assert.deepEqual(h.calls, []);
});
test('accepted submission without progress proof stops before commenting and closes its tab', async () => {
    const h = harness();
    h.api.submit = async () => { h.calls.push('submit'); return { ok: true, submitted: true, completed: false, message: 'Chưa xác minh 100%' }; };
    const result = await scope.K12Workflow.run([exercise], scope.K12AI.subjectRule({ exerciseMode: 'both' }), h.api);
    assert.equal(result.ok, false);
    assert.equal(result.records[0].submitted, true);
    assert.deepEqual(h.calls, ['prepare', 'solve', 'submit', 'release']);
});
test('unknown courseware and exams never fall through to markComplete', async () => {
    const h = harness();
    const result = await scope.K12Workflow.run([{ coursewareType: 'Courseware.Exam' }], scope.K12AI.subjectRule(), h.api);
    assert.equal(result.ok, false);
    assert.deepEqual(h.calls, []);
});
test('legacy subject options migrate to each exercise mode and keep material comments separate', () => {
    assert.equal(scope.K12AI.subjectRule({ exercise: false, comment: true }).exerciseMode, 'comment');
    assert.equal(scope.K12AI.subjectRule({ exercise: true, comment: true }).exerciseMode, 'both');
    assert.equal(scope.K12AI.subjectRule({ exercise: false, comment: false }).exerciseMode, 'skip');
    assert.equal(scope.K12AI.subjectRule({ exerciseMode: 'comment', materialComment: false }).materialComment, false);
});
