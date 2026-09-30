// Runs in MAIN and ISOLATED worlds to observe both K12 and extension requests.
// Recording is opt-in and does not submit requests.
(() => {
    if (window.__k12ApiObserverInstalled) return;
    window.__k12ApiObserverInstalled = true;
    let enabled = false;
    let generation = 0;
    window.addEventListener('message', (event) => {
        if (event.source === window && event.origin === location.origin && event.data?.type === 'k12-recorder-control') {
            generation += 1;
            enabled = event.data.enabled === true;
        }
    });
    const allowed = (url) => {
        try { const u = new URL(url, location.href); return u.origin === location.origin && (/^\/api\/LMS\//.test(u.pathname) || /^\/\d+\/$/.test(u.pathname)); }
        catch (_) { return false; }
    };
    const redact = (v, depth = 0) => {
        if (depth > 12) return '[depth limit]';
        if (Array.isArray(v)) return v.slice(0, 200).map(x => redact(x, depth + 1));
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 200).map(([k, x]) => [k,
            /token|password|cookie|authorization|account|username|phone|email|student|session|secret/i.test(k) ? '[redacted]' : redact(x, depth + 1)]));
        return typeof v === 'string' ? v.slice(0, 40000) : v;
    };
    function entriesObject(entries) {
        const values = Object.create(null);
        for (const [key, value] of entries) {
            if (Object.hasOwn(values, key)) {
                values[key] = Array.isArray(values[key]) ? [...values[key], value] : [values[key], value];
            } else { values[key] = value; }
        }
        return values;
    }
    function requestBody(value) {
        if (value == null) return null;
        if (typeof value === 'string') {
            try { return redact(JSON.parse(value)); } catch (_) { return redact(entriesObject(new URLSearchParams(value))); }
        }
        if (value instanceof URLSearchParams) return redact(entriesObject(value));
        if (value instanceof FormData) return redact(entriesObject(Array.from(value, ([k, v]) => [k, typeof v === 'string' ? v : '[file]'])));
        return '[body type not recorded]';
    }
    function emit(url, method, body, status, response, capturedGeneration) {
        if (!enabled || generation !== capturedGeneration || !allowed(url)) return;
        const parsed = new URL(url, location.href);
        // VHV redraws K12 lists and exercise forms with an LMS service POST to
        // the portal root, rather than /api/LMS. Other portal services are omitted.
        if (/^\/\d+\/$/.test(parsed.pathname) && !/^LMS\./.test(String(body?.service || ''))) return;
        let data;
        try { data = redact(JSON.parse(response)); } catch (_) {
            data = { format: 'html', characters: response.length,
                lessonRows: (response.match(/data-type=["']Lesson["']/g) || []).length,
                questionGroups: (response.match(/id=["']question[a-f0-9]{24}["']/gi) || []).length };
        }
        window.postMessage({ type: 'k12-api-record', entry: {
            path: parsed.pathname, query: redact(entriesObject(parsed.searchParams)), method,
            request: body, status, response: data, time: new Date().toISOString()
        } }, location.origin);
    }
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
        const record = enabled && allowed(url);
        const capturedGeneration = generation;
        const method = init?.method || input?.method || 'GET';
        const body = !record ? Promise.resolve(null)
            : init?.body !== undefined ? Promise.resolve(requestBody(init.body))
            : input instanceof Request && !['GET', 'HEAD'].includes(String(method).toUpperCase())
                ? input.clone().text().then(requestBody, () => '[Request body not recorded]')
                : Promise.resolve(null);
        return originalFetch.apply(this, arguments).then(response => {
            if (record) Promise.all([body, response.clone().text()])
                .then(([request, text]) => emit(url, method, request, response.status, text, capturedGeneration)).catch(() => {});
            return response;
        });
    };
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const meta = new WeakMap();
    XMLHttpRequest.prototype.open = function(method, url) {
        meta.set(this, { method, url });
        return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(body) {
        const info = meta.get(this);
        if (enabled && info && allowed(info.url)) {
            const capturedGeneration = generation;
            const request = requestBody(body);
            this.addEventListener('loadend', () => {
                try {
                    const response = this.responseType === 'json' ? JSON.stringify(this.response)
                        : (!this.responseType || this.responseType === 'text') ? this.responseText : '';
                    emit(info.url, info.method, request, this.status, response, capturedGeneration);
                } catch (_) {}
            }, { once: true });
        }
        return originalSend.apply(this, arguments);
    };
})();
