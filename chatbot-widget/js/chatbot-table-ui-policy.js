(function () {
  'use strict';

  var styleId = 'chatbot-table-ui-policy';
  if (document.getElementById(styleId)) return;

  var style = document.createElement('style');
  style.id = styleId;
  style.textContent = '.chat-bubble.ai .ai-table-page-size-label{display:none!important}';
  document.head.appendChild(style);
})();
