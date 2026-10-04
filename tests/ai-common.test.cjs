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
test('study and free-learning lists are scanned, and only free learning is the free section', () => {
    const study = 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/list?site=2003644';
    const free = 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/teacherList?site=2003644';
    assert.equal(ai.lessonListSection(study), 'study');
    assert.equal(ai.lessonListSection(free), 'free');
    assert.equal(ai.lessonListSection('https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/teacherList/?site=2003644'), 'free');
    assert.equal(ai.isLessonListUrl(study), true);
    assert.equal(ai.isLessonListUrl(free), true);
    assert.equal(ai.isFreeLessonListUrl(free), true);
    assert.equal(ai.isFreeLessonListUrl(study), false);
    assert.equal(ai.isLessonListUrl('https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/listExercise/6ab7e04a1d5332cbc90330b7'), false);
    assert.equal(ai.isLessonListUrl('https://hcm.k12online.vn/79000729/'), false);
    assert.equal(ai.isLessonListUrl('https://evil.test/79000729/page/LMS/Lesson/Student/teacherList'), false);
    assert.equal(ai.isLessonListUrl('not a URL'), false);
});
test('an illustrated choice question keeps the image when its id is the question id', () => {
    const id = '6ab7e04a1d5332cbc90330ba';
    const item = { title: 'Toán', questions: [{ id, kind: 'single_choice', prompt: 'Hình bên', choices: [
        { id: '1', text: '1' }, { id: '2', text: '2' }
    ] }], images: [{ id, url: '/upload/2003644/fck/7900991288/image.png' }] };
    const normalized = ai.validateExercise(item);
    assert.equal(normalized.images[0].id, id);
    assert.throws(() => ai.validateExercise({ ...item, images: [{ id: '6ab7e04a1d5332cbc90330bb', url: item.images[0].url }] }), /không gắn/);
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

test('login emails are normalized like the Rust server and rejected before sending', () => {
    assert.equal(ai.normalizeEmail('  Hoc.Sinh@Example.VN '), 'hoc.sinh@example.vn');
    for (const bad of ['', 'no-at', 'a@b', 'a@@b.vn', 'a@.b.vn', 'a@b..vn', 'a b@c.vn', '@c.vn', 'é@c.vn']) {
        assert.throws(() => ai.normalizeEmail(bad), /Email không hợp lệ/, bad);
    }
});

test('auth headers only send a session to the server that issued it', () => {
    const session = { server: 'https://ai.example.app', token: 'k12s_abc', email: 'a@b.vn' };
    assert.deepEqual({ ...ai.authHeaders('https://ai.example.app', session, '') }, { Authorization: 'Bearer k12s_abc' });
    assert.deepEqual({ ...ai.authHeaders('https://other.example.app', session, '') }, {});
    assert.deepEqual({ ...ai.authHeaders('http://127.0.0.1:3210', null, 'admin') }, { 'x-k12-token': 'admin' });
});
