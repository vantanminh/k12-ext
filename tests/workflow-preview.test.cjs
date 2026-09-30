const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function preview(items, rule, hasCommentProfile = true) {
    const scope = {};
    vm.runInNewContext(readFileSync(join(__dirname, '../chrome-extension/ai-common.js'), 'utf8'), scope);
    return scope.K12AI.workflowPreview(items, rule, hasCommentProfile);
}

test('workflow preview describes the K12 writes without making them', () => {
    const result = preview([
        { coursewareType: 'Courseware.PDF', progress: '0%', title: 'Tài liệu' },
        { coursewareType: 'Courseware.Video', progress: '100%', title: 'Video' },
        { coursewareType: 'Courseware.Exercise', progress: '0%', title: 'Bài tập' }
    ], { exerciseMode: 'both', view: true, materialComment: true });

    assert.equal(result.length, 3);
    assert.match(result[0].action, /Đánh dấu tài liệu/);
    assert.equal(result[0].writesToK12, true);
    assert.equal(result[1].completed, true);
    assert.match(result[2].action, /nộp đáp án và gửi bình luận/);
    assert.equal(result[2].writesToK12, true);
});

test('workflow preview exposes an incomplete comment profile and unknown courseware', () => {
    const result = preview([
        { coursewareType: 'Courseware.Exercise' },
        { coursewareType: '' }
    ], { exerciseMode: 'comment', view: false }, false);

    assert.equal(result[0].requiresCommentProfile, true);
    assert.equal(result[0].writesToK12, true);
    assert.equal(result[1].unsupported, true);
    assert.equal(result[1].writesToK12, false);
});

test('workflow preview skips work K12 already recorded when the workflow does too', () => {
    const result = preview([
        { coursewareType: 'Courseware.PDF', progress: '100%' },
        { coursewareType: 'Courseware.Exercise', progress: '100%' }
    ], { exerciseMode: 'submit', view: true, materialComment: false });

    assert.match(result[0].action, /K12 đã ghi nhận 100%/);
    assert.equal(result[0].writesToK12, false);
    assert.match(result[1].action, /K12 đã ghi nhận 100%/);
    assert.equal(result[1].writesToK12, false);
});
