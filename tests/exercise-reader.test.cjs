const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const fixture = fs.readFileSync(`${__dirname}/fixtures/k12-pdf-form.html`, 'utf8');
function harness(html = fixture, responses = []) {
    const { window, document } = parseHTML(html);
    window.postMessage = () => {};
    const requests = [];
    let handler;
    const scope = { window, document, URL, URLSearchParams, setTimeout,
        location: { origin: 'https://hcm.k12online.vn', href: 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Courseware/learn/6ab7e04a1d5332cbc90330b7?coursewareId=6ab7e04a1d5332cbc90330ba&site=2003644' },
        DOMParser: class { parseFromString(text) { return parseHTML(text).document; } },
        chrome: { runtime: { onMessage: { addListener(fn) { handler = fn; } }, sendMessage: async () => {} },
            storage: { local: { get: async () => ({ k12ApiRecording: false }) }, onChanged: { addListener() {} } } },
        fetch: async (url, options) => { requests.push({ url, options }); const next = responses.shift(); if (!next) throw new Error('Unexpected fetch'); return next; }
    };
    vm.createContext(scope);
    for (const name of ['ai-common', 'exercise-reader']) vm.runInContext(fs.readFileSync(`${__dirname}/../chrome-extension/${name}.js`, 'utf8'), scope);
    const message = data => new Promise(resolve => handler(data, {}, resolve));
    return { message, requests, document };
}
function answers(exercise, confidence = 0.95) {
    return { answers: exercise.questions.map(q => ({ question_id: q.id, choice_ids: [q.choices[0].id], text: '', explanation: 'Fixture only', confidence })) };
}
function trueFalseFixture() {
    const rows = Array.from({ length: 10 }, (_, q) => {
        const id = `6ab7e0713409d4fad702dc${(0x8c + q).toString(16)}`;
        const statements = Array.from({ length: 4 }, (_, s) => `<tr class="choice-tr"><th class="control"><label><input type="radio" name="fields[question${id}][${s + 1}]" value="true"><span>T</span></label><label><input type="radio" name="fields[question${id}][${s + 1}]" value="false"><span>F</span></label></th><td class="text">Phát biểu ${s + 1} về glucose.</td></tr>`).join('');
        return `<li id="question${id}" data-element-type="OnlyTrueFalseNew"><div class="question-purify-item" data-type="OnlyTrueFalseNew"><div class="onlyTrueFalse-top">Câu hỏi về glucose ${q + 1}. ${q === 0 ? '<img src="/upload/2003644/fck/7900991288/image.png">' : ''}</div><div class="onlyTrueFalse-info"><table class="onlyTrueFalse-content">${statements}</table></div></div></li>`;
    }).join('');
    return `<div id="module2"><div class="panel-heading"><div class="panel-title">CARBOHYDRATE</div><a>Thảo luận</a><style>.style-must-not-be-the-title { color: red; }</style></div></div><form id="form2"><input type="hidden" name="options[coursewareType]" value="Courseware.Exercise"><input type="hidden" name="options[coursewareId]" value="6ab7e0713409d4fad702dc8b"><input type="hidden" name="id" value="6abbeb627686e80b58f6cae2"><input type="hidden" name="securityToken" value="fixture-token"><input type="hidden" name="submitFormId" value="2"><ul>${rows}</ul></form>`;
}

test('reads a choice exercise whose answers sit inside the label and keeps its image', async () => {
    const id = '6ab7e04a1d5332cbc90330ba';
    const html = `<div id="module2"><div class="panel-heading"><div class="panel-title">Câu trắc nghiệm</div></div>
        <form><input type="hidden" name="options[coursewareType]" value="Courseware.Exercise"><input type="hidden" name="options[coursewareId]" value="${id}"><input type="hidden" name="id" value="6abbeb627686e80b58f6cae2"><input type="hidden" name="securityToken" value="fixture-token">
        <ul><li id="question${id}" data-element-type="Choice"><div class="question-purify-item" data-type="Choice">
            <div class="choice-top" id="title${id}">1 + 1 bằng mấy? <img src="/upload/2003644/fck/7900991288/image.png"></div>
            <label><input type="radio" name="fields[question${id}]" value="1"><span class="choices-text">1</span></label>
            <label><input type="radio" name="fields[question${id}]" value="2"><span class="choices-text">2</span></label>
        </div></li></ul></form></div>`;
    const h = harness(html);
    const read = await h.message({ action: 'readExercise' });
    assert.equal(read.ok, true, read.message);
    assert.equal(read.exercise.questions.length, 1);
    assert.equal(read.exercise.questions[0].id, id);
    assert.equal(read.exercise.questions[0].kind, 'single_choice');
    assert.equal(read.exercise.questions[0].choices.length, 2);
    assert.equal(read.exercise.questions[0].choices[0].id, '1');
    assert.equal(read.exercise.questions[0].choices[0].text, '1');
    assert.equal(read.exercise.questions[0].choices[1].id, '2');
    assert.equal(read.exercise.questions[0].choices[1].text, '2');
    assert.equal(read.exercise.images[0].id, id);
    assert.equal(read.exercise.images[0].url, 'https://static.k12online.vn/upload/2003644/fck/7900991288/image.png');
    assert.match(read.exercise.questions[0].prompt, /1 \+ 1 bằng mấy/);
});

test('reads native 10 x 4 true/false statements and K12 image without session fields', async () => {
    const h = harness(trueFalseFixture());
    const read = await h.message({ action: 'readExercise' });
    assert.equal(read.ok, true, read.message);
    assert.equal(read.exercise.questions.length, 40);
    assert.equal(read.exercise.title, 'CARBOHYDRATE');
    assert.equal(read.exercise.questions[0].id, '6ab7e0713409d4fad702dc8c:1');
    assert.deepEqual(Array.from(read.exercise.questions[0].choices, c => c.id), ['true', 'false']);
    assert.equal(read.exercise.images[0].url, 'https://static.k12online.vn/upload/2003644/fck/7900991288/image.png');
    assert.doesNotMatch(JSON.stringify(read.exercise), /fixture-token|submitFormId/);
});
test('preparation waits for lazy true/false content and preserves table columns', async () => {
    const full = trueFalseFixture().replace('Câu hỏi về glucose 1.', '<table><tr><td>Mẫu 1</td><td>Mẫu 2</td></tr><tr><td>5,6</td><td>8,2</td></tr></table>');
    const h = harness(full);
    const content = h.document.querySelector('.question-purify-item');
    const saved = content.innerHTML;
    content.innerHTML = '';
    setTimeout(() => { content.innerHTML = saved; }, 25);
    const read = await h.message({ action: 'prepareExercise' });
    assert.equal(read.ok, true, read.message);
    assert.match(read.exercise.questions[0].prompt, /Mẫu 1 \| Mẫu 2; 5,6 \| 8,2/);
    assert.equal(read.exercise.questions.length, 40);
});

test('opens a javascript-link exercise through the bounded page action bridge', async () => {
    const h = harness('<a href="javascript:VHV.App.modules[2].doExercise()">Làm bài</a>');
    const requests = [];
    h.document.defaultView.postMessage = (data, origin) => {
        requests.push({ data, origin });
        if (data.type === 'k12-open-exercise') h.document.body.insertAdjacentHTML('beforeend', fixture);
    };
    const result = await h.message({ action: 'prepareExercise' });
    assert.equal(result.ok, true, result.message);
    assert.equal(result.exercise.questions.length, 20);
    const open = requests.filter(r => r.data.type === 'k12-open-exercise');
    assert.equal(open.length, 1);
    assert.equal(open[0].data.moduleIndex, 2);
    assert.equal(open[0].origin, 'https://hcm.k12online.vn');
    assert.equal(h.requests.length, 0);
});

test('a submitted result page does not create another attempt just to read questions', async () => {
    const h = harness('<p>Điểm 10/10</p><a href="javascript:VHV.App.modules[2].doExercise()">Làm lại</a>');
    let opened = false;
    h.document.defaultView.postMessage = data => { if (data.type === 'k12-open-exercise') opened = true; };
    const result = await h.message({ action: 'prepareExercise' });
    assert.equal(result.ok, false);
    assert.equal(result.alreadyCompleted, true);
    assert.equal(opened, false);
    assert.equal(h.requests.length, 0);
});

test('a sequential K12 prerequisite is reported before attempting to open or solve', async () => {
    const h = harness('<div id="module2"><div class="panel-body">Bạn cần hoàn thành các nội dung theo thứ tự</div><a href="javascript:VHV.App.modules[2].doExercise()">Làm bài</a></div>');
    let opened = false;
    h.document.defaultView.postMessage = data => { if (data.type === 'k12-open-exercise') opened = true; };
    const result = await h.message({ action: 'prepareExercise' });
    assert.equal(result.prerequisiteRequired, true);
    assert.equal(opened, false);
    assert.match(result.message, /quy trình theo môn/);
});

test('preparation waits for PDF answer choices instead of exporting a partial form', async () => {
    const h = harness();
    const group = h.document.querySelector('.doExercise-pdf form li[id^="question"]');
    const saved = group.innerHTML;
    group.innerHTML = '';
    setTimeout(() => { group.innerHTML = saved; }, 25);
    const read = await h.message({ action: 'prepareExercise' });
    assert.equal(read.ok, true, read.message);
    assert.equal(read.exercise.questions.length, 20);
});

test('submits all 40 native true/false fields through Exercise/edit and verifies progress', async () => {
    const h = harness(trueFalseFixture(), [
        { ok: true, status: 200, json: async () => ({ status: 'SUCCESS' }) },
        { ok: true, url: 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Courseware/learn/6ab7e0713409d4fad702dc89', text: async () => '<span class="coursewarePercent6ab7e0713409d4fad702dc8b">100</span>' }
    ]);
    const read = await h.message({ action: 'prepareExercise' });
    assert.equal(read.ok, true, read.message);
    const result = await h.message({ action: 'submitExercise', exercise: read.exercise, result: answers(read.exercise) });
    assert.equal(result.completed, true, result.message);
    const data = new URLSearchParams(h.requests[0].options.body);
    assert.equal(data.get('fields[question6ab7e0713409d4fad702dc8c][1]'), 'true');
    assert.equal([...data.keys()].filter(k => /^fields\[question[a-f0-9]{24}\]\[[1-4]\]$/.test(k)).length, 40);
    assert.equal(h.requests[0].url, '/api/LMS/Learning/CourseResult/Exercise/edit');
});
test('reads all 20 native PDF question IDs and numeric answer codes without leaking session fields', async () => {
    const h = harness();
    const read = await h.message({ action: 'readExercise' });
    assert.equal(read.ok, true);
    assert.equal(read.exercise.questions.length, 20);
    assert.match(read.exercise.pdf_url, /^https:\/\/static.k12online.vn\/upload\//);
    assert.deepEqual(Array.from(read.exercise.questions[0].choices, c => [c.id, c.text]), [['1','A'],['2','B'],['3','C'],['4','D']]);
    assert.equal(read.exercise.questions[0].id, '6ab7e04a1d5332cbc90330bb');
    assert.doesNotMatch(JSON.stringify(read.exercise), /fixture-token|submitFormId|1790697603/);
});

test('an existing exercise form is not skipped because an unrelated discussion link has another type', async () => {
    const h = harness('<a href="/discussion?objectType=Courseware.PDF">Discussion</a>' + fixture);
    const result = await h.message({ action: 'prepareExercise' });
    assert.equal(result.ok, true);
    assert.equal(result.exercise.questions.length, 20);
    assert.equal(h.requests.length, 0);
});
test('POSTs native form fields to Exercise/edit then verifies the updated K12 percentage', async () => {
    const h = harness(fixture, [
        { ok: true, status: 200, json: async () => ({ status: 'SUCCESS', allowUpdate: 1 }) },
        { ok: true, url: 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Courseware/learn/6ab7e04a1d5332cbc90330b7', text: async () => '<span class="coursewarePercent6ab7e04a1d5332cbc90330ba">100</span>' }
    ]);
    const read = await h.message({ action: 'readExercise' });
    const result = await h.message({ action: 'submitExercise', exercise: read.exercise, result: answers(read.exercise) });
    assert.equal(result.submitted, true);
    assert.equal(result.completed, true);
    assert.equal(h.requests[0].url, '/api/LMS/Learning/CourseResult/Exercise/edit');
    const data = new URLSearchParams(h.requests[0].options.body);
    assert.equal(data.get('id'), '6abbe0837686e80b58f323ec');
    assert.equal(data.get('securityToken'), 'fixture-token');
    assert.equal([...data.keys()].filter(k => k.startsWith('fields[question')).length, 20);
    assert.equal(h.requests[0].options.credentials, 'include');
    assert.equal(h.requests.length, 2);
});
test('does not claim completion from SUCCESS alone or repeat a rejected write', async () => {
    const h = harness(fixture, [{ ok: true, status: 200, json: async () => ({ status: 'FAIL', message: 'Không tìm thấy thông tin bài làm' }) }]);
    const read = await h.message({ action: 'readExercise' });
    const result = await h.message({ action: 'submitExercise', exercise: read.exercise, result: answers(read.exercise) });
    assert.equal(result.ok, false);
    assert.equal(h.requests.length, 1);
    assert.match(result.message, /Không tìm thấy/);
});
test('blocks changed questions and invalid choices before any POST', async () => {
    const h = harness();
    const read = await h.message({ action: 'readExercise' });
    let result;
    const invalid = answers(read.exercise); invalid.answers[0].choice_ids = ['999'];
    result = await h.message({ action: 'submitExercise', exercise: read.exercise, result: invalid });
    assert.equal(result.ok, false);
    const changed = JSON.parse(JSON.stringify(read.exercise)); changed.questions.pop();
    result = await h.message({ action: 'submitExercise', exercise: changed, result: answers(changed) });
    assert.equal(result.ok, false);
    assert.equal(h.requests.length, 0);
});
test('uncertain answers are still submitted and named in the result', async () => {
    const page = '<html><body><span class="coursewarePercent6ab7e04a1d5332cbc90330ba">100</span></body></html>';
    const h = harness(fixture, [{ ok: true, json: async () => ({ status: 'SUCCESS' }) }, { ok: true, url: 'https://hcm.k12online.vn/', text: async () => page }]);
    const read = await h.message({ action: 'readExercise' });
    const result = await h.message({ action: 'submitExercise', exercise: read.exercise, result: answers(read.exercise, 0.2) });
    assert.equal(result.ok, true, result.message);
    assert.equal(h.requests.length, 2);
    assert.match(result.message, /chưa chắc chắn: Câu 1/);
});
test('missing progress verification remains submitted but incomplete', async () => {
    const h = harness(fixture, [
        { ok: true, json: async () => ({ status: 'SUCCESS' }) },
        { ok: true, url: 'https://hcm.k12online.vn/', text: async () => '<html></html>' }
    ]);
    const read = await h.message({ action: 'readExercise' });
    const result = await h.message({ action: 'submitExercise', exercise: read.exercise, result: answers(read.exercise) });
    assert.equal(result.submitted, true);
    assert.equal(result.completed, false);
});

test('a failed progress read preserves accepted submission without retrying the POST', async () => {
    const h = harness(fixture, [
        { ok: true, json: async () => ({ status: 'SUCCESS' }) },
        { ok: true, url: 'https://hcm.k12online.vn/', text: async () => { throw new Error('connection lost'); } }
    ]);
    const read = await h.message({ action: 'readExercise' });
    const result = await h.message({ action: 'submitExercise', exercise: read.exercise, result: answers(read.exercise) });
    assert.equal(result.ok, true);
    assert.equal(result.submitted, true);
    assert.equal(result.completed, false);
    assert.equal(h.requests.length, 2);
    assert.match(result.message, /Không tự động nộp lại/);
});
