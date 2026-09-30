const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const content = readFileSync(join(__dirname, '../chrome-extension/content.js'), 'utf8')
    .replace(/    if \(document\.readyState === 'loading'\) \{[\s\S]*?\n\}\)\(\);\s*$/, 'globalThis.clickPagination = clickPaginationLinkWithoutJavascriptNavigation;\n})();');

test('pagination clicks do not execute javascript URLs and restore the original href', () => {
    const scope = {};
    vm.runInNewContext(content, scope);

    let href = 'javascript:void(0)';
    let clickHandler;
    let observedHref;
    let defaultPrevented = false;
    const link = {
        getAttribute(name) { return name === 'href' ? href : null; },
        removeAttribute(name) { if (name === 'href') href = null; },
        setAttribute(name, value) { if (name === 'href') href = value; },
        addEventListener(type, handler, capture) {
            assert.equal(type, 'click');
            assert.equal(capture, true);
            clickHandler = handler;
        },
        removeEventListener(type, handler, capture) {
            assert.equal(type, 'click');
            assert.equal(handler, clickHandler);
            assert.equal(capture, true);
            clickHandler = null;
        },
        click() {
            observedHref = href;
            const event = { preventDefault() { defaultPrevented = true; } };
            clickHandler(event);
        }
    };

    scope.clickPagination(link);

    assert.equal(observedHref, null);
    assert.equal(defaultPrevented, true);
    assert.equal(href, 'javascript:void(0)');
    assert.equal(clickHandler, null);
});
