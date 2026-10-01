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

const content = { coursewareId: 'content', coursewareType: 'Courseware.Content', progress: '0%', title: 'ĐỀ SỐ 1' };
function contentHarness(answerText, read = {}) {
    const h = harness();
    const exercise = scope.K12AI.contentExercise({ title: 'ĐỀ SỐ 1', text: 'Câu 1. Chỉ ra phương thức biểu đạt.' });
    h.api.readContent = async () => { h.calls.push('readContent'); return { ok: true, exercise, ...read }; };
    h.api.solve = async () => { h.calls.push('solve'); return { answers: [{ question_id: 'content', choice_ids: [], text: answerText, explanation: '', confidence: 0.9 }] }; };
    h.api.complete = async (_item, options) => { h.calls.push(options?.skipComment ? 'complete-quiet' : 'complete'); return { ok: true, completed: true }; };
    h.api.commentContent = async () => { h.calls.push('commentContent'); return { ok: true, commented: true }; };
    return h;
}
test('text lesson with questions is solved, marked viewed quietly and answered in a comment', async () => {
    const h = contentHarness('Câu 1: Biểu cảm.');
    const result = await scope.K12Workflow.run([content], scope.K12AI.subjectRule({ exerciseMode: 'comment', view: true }), h.api);
    assert.equal(result.ok, true);
    assert.equal(result.records[0].commented, true);
    assert.deepEqual(h.calls, ['readContent', 'solve', 'complete-quiet', 'commentContent']);
});
test('a text lesson already at 100% is still answered when skipping completed items', async () => {
    const h = contentHarness('Câu 1: Biểu cảm.');
    await scope.K12Workflow.run([{ ...content, progress: '100%' }], { ...scope.K12AI.subjectRule({ exerciseMode: 'both', view: true }), skipCompleted: true }, h.api);
    assert.deepEqual(h.calls, ['readContent', 'solve', 'commentContent']);
});
test('text lesson the AI finds no questions in falls back to the viewed comment', async () => {
    const h = contentHarness('KHÔNG CÓ CÂU HỎI');
    const result = await scope.K12Workflow.run([content], scope.K12AI.subjectRule({ exerciseMode: 'comment', view: true, materialComment: true }), h.api);
    assert.equal(result.ok, true);
    assert.deepEqual(h.calls, ['readContent', 'solve', 'complete']);
});
test('text lesson answered before is not answered again', async () => {
    const h = contentHarness('Câu 1: Biểu cảm.', { answered: true });
    const result = await scope.K12Workflow.run([{ ...content, progress: '100%' }], { ...scope.K12AI.subjectRule({ exerciseMode: 'comment', view: true }), skipCompleted: true }, h.api);
    assert.equal(result.records[0].skipped, true);
    assert.deepEqual(h.calls, ['readContent']);
});
test('text lessons without comments enabled keep the old mark-viewed path', async () => {
    const h = contentHarness('Câu 1: Biểu cảm.');
    await scope.K12Workflow.run([content], scope.K12AI.subjectRule({ exerciseMode: 'submit', view: true, materialComment: false }), h.api);
    assert.deepEqual(h.calls, ['complete']);
});
test('content exercise keeps the lesson text as one short answer question', () => {
    const exercise = scope.K12AI.contentExercise({ title: 'VIẾT ĐOẠN VĂN', text: 'Anh/Chị hãy viết đoạn văn (khoảng 200 chữ).' });
    assert.equal(exercise.questions.length, 1);
    assert.equal(exercise.questions[0].kind, 'short_text');
    assert.match(exercise.questions[0].prompt, /Anh\/Chị hãy viết đoạn văn/);
    assert.equal(scope.K12AI.contentHasQuestions('Câu 1. Điền từ'), true);
    assert.equal(scope.K12AI.contentHasQuestions('Tiểu thuyết là thể loại tự sự cỡ lớn.'), false);
    assert.throws(() => scope.K12AI.contentExercise({ title: 'x', text: 'Câu 1. ' + 'ă'.repeat(12000) }), /quá dài/);
});
