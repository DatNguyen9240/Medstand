// Notification bell → navigate to notifications page
$('#btn-notif').on('click', function (e) {
    e.preventDefault();
    navigate('notifications');
});

// AI chatbot → navigate to chatbot page
$('#btn-ai-chat').on('click', function (e) {
    e.preventDefault();
    navigate('chatbot');
});
