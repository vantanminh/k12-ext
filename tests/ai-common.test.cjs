const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const scope = { URL };
vm.runInNewContext(readFileSync(join(__dirname, '../chrome-extension/ai-common.js'), 'utf8'), scope);
const ai = scope.K12AI;
const exercise = { title: 'Toán', cookie: 'must not leave browser', questions: [{
    id: 'q1', kind: 'single_choice', prompt: '1 + 1 = ?', securityToken: 'must not leave browser',
    choices: [{ id: 'a', text: '1' }, { id: 'b', text: '2' }]
}] };
const answer = { question_id: 'q1', choice_ids: ['b'], confidence: 0.9, text: '' };

test('exercise payload sent to Rust excludes page credentials', () => {
    const payload = ai.validateExercise(exercise);
    assert.equal(JSON.stringify(payload).includes('must not leave browser'), false);
    assert.equal(payload.questions[0].id, 'q1');
});

test('long Vietnamese titles stay below the Rust UTF-8 byte limit', () => {
    const payload = ai.validateExercise({ ...exercise, title: 'Bài tập Hóa học tiếng Việt 🧪 '.repeat(100) });
    assert.ok(Buffer.byteLength(payload.title, 'utf8') <= 1000);
    assert.equal(payload.questions.length, 1);
});
test('rejects duplicate question IDs and incomplete multiple-choice data', () => {
    assert.throws(() => ai.validateExercise({ ...exercise, questions: [exercise.questions[0], exercise.questions[0]] }));
    assert.throws(() => ai.validateExercise({ ...exercise, questions: [{ ...exercise.questions[0], choices: [] }] }));
});
test('rejects fabricated choice IDs, duplicate choices and unknown questions', () => {
    for (const edit of [{ choice_ids: ['c'] }, { choice_ids: ['b', 'b'] }, { question_id: 'q2' }]) {
        assert.throws(() => ai.validateAnswers(exercise, { answers: [{ ...answer, ...edit }] }));
    }
});
test('valid AI answer does not imply submitted or complete status', () => {
    const result = ai.validateAnswers(exercise, { answers: [answer] });
    assert.equal(result.submitted, undefined);
    assert.equal(result.completed, undefined);
});
test('server target accepts localhost HTTP or HTTPS deployment without URL credentials', () => {
    assert.equal(ai.serverUrl('http://127.0.0.1:3210'), 'http://127.0.0.1:3210');
    assert.equal(ai.serverUrl('https://k12-ai.up.railway.app'), 'https://k12-ai.up.railway.app');
    for (const url of ['http://127.0.0.1.evil.test', 'http://a:b@localhost:3210', 'http://localhost:3210/path', 'https://a:b@example.com', 'https://example.com/path']) {
        assert.throws(() => ai.serverUrl(url));
    }
});
test('only the K12 free-learning home triggers whole-list discovery', () => {
    assert.equal(ai.isFreeLessonListUrl('https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/teacherList?site=2003644'), true);
    assert.equal(ai.isFreeLessonListUrl('https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/teacherList/?site=2003644'), true);
    assert.equal(ai.isFreeLessonListUrl('https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/list?site=2003644'), false);
    assert.equal(ai.isFreeLessonListUrl('https://evil.test/79000729/page/LMS/Lesson/Student/teacherList'), false);
    assert.equal(ai.isFreeLessonListUrl('not a URL'), false);
});
test('image references are restricted to K12 uploads and answer summaries use native labels', () => {
    const id = '6ab7e0713409d4fad702dc8c';
    const item = { title: 'Hóa', questions: [{ id: `${id}:1`, kind: 'single_choice', prompt: 'Ý a', choices: [
        { id: 'true', text: 'Đúng' }, { id: 'false', text: 'Sai' }
    ] }], images: [{ id, url: '/upload/2003644/fck/7900991288/image.png' }] };
    const normalized = ai.validateExercise(item);
    assert.equal(normalized.images[0].url, 'https://static.k12online.vn/upload/2003644/fck/7900991288/image.png');
    assert.equal(ai.formatAnswerSummary(normalized, { answers: [{ question_id: `${id}:1`, choice_ids: ['false'], confidence: .9 }] }), 'Câu 1: a Sai');
    assert.throws(() => ai.validateExercise({ ...item, images: [{ id, url: 'https://evil.test/upload/image.png' }] }));
});
test('capture redaction covers nested credentials and form token keys', () => {
    const result = ai.redact({ request: { 'securityToken': 'secret', 'fields[studentId]': 'student', nested: { authorization: 'secret', questionId: 'q1' } } });
    assert.equal(result.request.securityToken, '[redacted]');
    assert.equal(result.request['fields[studentId]'], '[redacted]');
    assert.equal(result.request.nested.authorization, '[redacted]');
    assert.equal(result.request.nested.questionId, 'q1');
});
