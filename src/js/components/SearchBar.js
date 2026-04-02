/**
 * SearchBar — thanh tìm kiếm dùng chung
 *
 * Sử dụng:
 *   new SearchBar({
 *     container: '#search-container',
 *     placeholder: 'Tìm kiếm...',
 *     onSearch: function(keyword) { ... }
 *   });
 */
function SearchBar(opts) {
  opts = opts || {};
  var $container = $(opts.container);
  if (!$container.length) return;

  var placeholder = opts.placeholder || 'Tìm kiếm...';
  var debounceMs = opts.debounce || 300;
  var onSearch = opts.onSearch || function () { };

  $container.html(
    Input.renderSearch({ placeholder: placeholder })
  );

  var timeout;
  $container.find('.search-input').on('input', function () {
    var val = $(this).val();
    clearTimeout(timeout);
    timeout = setTimeout(function () {
      onSearch(val);
    }, debounceMs);
  });
}
