// Atlas — Extension Presence Marker
// Runs at document_start on the app domain so the webapp can detect
// the extension synchronously via a DOM attribute.
(function () {
  document.documentElement.setAttribute('data-atlas-ext', 'true');
})();
