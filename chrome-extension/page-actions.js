// Invoke the site's existing exercise control in its MAIN world. No eval or
// javascript: navigation: the only permitted action is opening an attempt.
(() => {
    window.addEventListener('message', event => {
        if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'k12-open-exercise') return;
        const index = event.data.moduleIndex;
        if (!Number.isInteger(index) || index < 0 || index > 10000) return;
        const invocation = `VHV.App.modules[${index}].doExercise()`;
        const control = Array.from(document.querySelectorAll('a[href], [onclick]')).find(element =>
            ((element.getAttribute('href') || '') + (element.getAttribute('onclick') || '')).includes(invocation));
        if (!control || document.querySelector('.doExercise-pdf form, form li[data-element-type="OnlyTrueFalseNew"]')) return;
        const module = window.VHV?.App?.modules?.[index];
        if (typeof module?.doExercise === 'function') module.doExercise();
    });
})();
