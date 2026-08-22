(function (root) {
  'use strict';

  // SQL/API adapters may serialize BIT as true/false, 1/0, or "1"/"0".
  // Accept only the three explicit granted representations; every unknown value
  // remains denied so permission checks continue to fail closed.
  function isGranted(value) {
    return value === true || value === 1 || value === '1';
  }

  var api = { isGranted: isGranted };
  root.MedstandOrderPermission = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
