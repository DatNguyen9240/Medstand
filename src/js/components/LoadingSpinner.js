/* Loading Spinner — Cash.js version */
var $spinner = $('#global-spinner');
var _spinnerCount = 0;

function showGlobalSpinner() {
  _spinnerCount++;
  $spinner.removeAttr('hidden');
}

function hideGlobalSpinner() {
  _spinnerCount = Math.max(0, _spinnerCount - 1);
  if (_spinnerCount === 0) {
    $spinner.attr('hidden', '');
  }
}
