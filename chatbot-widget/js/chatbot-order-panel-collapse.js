(function () {
    'use strict';

    function minimize(panel) {
        panel.classList.remove('active');
        document.body.classList.remove('ae-panel-open');
        setTimeout(function () {
            if (!panel.classList.contains('active')) panel.style.display = 'none';
        }, 200);

        var triggerBtn = document.getElementById('ae-panel-trigger');
        if (triggerBtn) triggerBtn.style.display = 'flex';
    }

    function ensureMinimizeButton(panel) {
        if (!panel || !panel.classList.contains('ae-order-create-panel')) return;
        if (panel.querySelector('#ae-panel-min')) return;

        var actions = panel.querySelector('.ae-panel-actions');
        var closeBtn = panel.querySelector('#ae-panel-close');
        if (!actions || !closeBtn) return;

        var minBtn = document.createElement('button');
        minBtn.type = 'button';
        minBtn.className = 'ae-panel-btn';
        minBtn.id = 'ae-panel-min';
        minBtn.title = 'Thu gọn';
        minBtn.setAttribute('aria-label', 'Thu gọn');
        minBtn.textContent = '−';
        minBtn.addEventListener('click', function () { minimize(panel); });
        actions.insertBefore(minBtn, closeBtn);
    }

    var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            mutation.addedNodes.forEach(function (node) {
                if (node.nodeType !== 1) return;
                if (node.matches && node.matches('.ae-order-create-panel')) ensureMinimizeButton(node);
                if (node.querySelectorAll) {
                    node.querySelectorAll('.ae-order-create-panel').forEach(ensureMinimizeButton);
                }
            });
        });
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.querySelectorAll('.ae-order-create-panel').forEach(ensureMinimizeButton);
})();
