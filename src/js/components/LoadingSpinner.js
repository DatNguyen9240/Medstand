/* Loading Spinner — Cash.js version */
var $spinner = $('#global-spinner');

function showGlobalSpinner() {
  $spinner.removeAttr('hidden');
}

function hideGlobalSpinner() {
  $spinner.attr('hidden', '');
}
