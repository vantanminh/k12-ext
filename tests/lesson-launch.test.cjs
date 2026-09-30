const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const origin = 'https://hcm.k12online.vn';
const entry = `${origin}/79000729/page/LMS/Lesson/learn/lesson-1?site=2003644`;
const courseware = `${origin}/79000729/page/LMS/Lesson/Courseware/learn/lesson-1?coursewareId=pdf-1&courseSiteId=2003644&site=2003644`;
const script = readFileSync(join(__dirname, '../chrome-extension/content.js'), 'utf8')
    .replace(/    if \(document\.readyState === 'loading'\) \{[\s\S]*?\n\}\)\(\);\s*$/, '    globalThis.prepare = getCandidatePayload;\n})();');

function harness(link, finalUrl = courseware) {
    const calls = [];
    const context = {
        URL, URLSearchParams,
        location: { href: `${origin}/79000729/page/LMS/Lesson/Student/teacherList?site=2003644`, origin },
        document: { scripts: [{ textContent: "securityToken: 'test-token', site: '2003644'" }] },
        DOMParser: class {
            parseFromString() {
                return {
                    scripts: [{ textContent: "'LMS.Learning.Lesson.Courseware.PDF', { securityToken: 'test-token', coursewareId: 'pdf-1', lessonId: 'lesson-1', courseSiteId: 2003644 }" }],
                    querySelector: () => null
                };
            }
        },
        fetch: async (url, options) => {
            calls.push({ url, options });
            return calls.length === 1
                ? { ok: true, text: async () => JSON.stringify({ status: 'SUCCESS', link }) }
                : { ok: true, url: finalUrl, text: async () => '<html>lesson</html>' };
        }
    };
    vm.runInNewContext(script, context);
    return { calls, prepare: () => context.prepare({ lessonId: 'lesson-1', site: '2003644', href: courseware, requiresLessonLink: true }) };
}

test('K12 Lesson/learn entry follows redirect and prepares PDF completion', async () => {
    const h = harness(entry);
    const result = await h.prepare();
    assert.equal(result.ok, true);
    assert.equal(h.calls[1].url, entry);
    assert.equal(h.calls[1].options.credentials, 'include');
    assert.equal(result.request.payload.coursewareId, 'pdf-1');
    assert.equal(result.request.payload['options[coursewareType]'], 'Courseware.PDF');
    assert.equal(result.request.missingFields.length, 0);
});

test('direct Courseware/learn links still work', async () => {
    assert.equal((await harness(courseware).prepare()).ok, true);
});

test('external launch links are rejected before page fetch', async () => {
    const h = harness(entry.replace(origin, 'https://example.com'));
    assert.equal((await h.prepare()).ok, false);
    assert.equal(h.calls.length, 1);
});

test('unrelated same-origin routes are rejected', async () => {
    const h = harness(`${origin}/79000729/page/Admin/overview`);
    assert.equal((await h.prepare()).ok, false);
    assert.equal(h.calls.length, 1);
});

test('login or external redirect is rejected before parsing completion data', async () => {
    for (const url of [`${origin}/login`, 'https://example.com/login', entry]) {
        const result = await harness(entry, url).prepare();
        assert.equal(result.ok, false);
        assert.match(result.message, /chuyển hướng|hết hạn/);
    }
});
