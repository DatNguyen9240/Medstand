// Notification bell → navigate to notifications page
$('#btn-notif').on('click', function (e) {
    e.preventDefault();
    navigate('notifications');
});

// Load AI bot button từ chatbot-widget, inject vào placeholder
fetch('chatbot-widget/template/ai-bot-button.html')
    .then(function (res) { return res.text(); })
    .then(function (html) {
        var container = document.getElementById('ai-chat-btn-container');
        if (container) {
            container.innerHTML = html;
            // Gắn click sau khi inject xong
            var btn = document.getElementById('btn-ai-chat');
            if (btn) {
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    navigate('chatbot');
                });
            }
        }
    })
    .catch(function () {
        console.warn('[AI Bot] Không thể load chatbot-widget/template/ai-bot-button.html');
    });

