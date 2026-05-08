// Atlas — Browser Extension Content Script
// Intercepts Google Drive links inside preview iframes and redirects
// navigation back into the Atlas webapp.

(function () {
  // Only run inside iframes, never on top-level Google Docs pages
  if (window === window.top) return;

  const DRIVE_URL_PATTERNS = [
    /docs\.google\.com\/document\/d\/([^/&?#]+)/,
    /docs\.google\.com\/spreadsheets\/d\/([^/&?#]+)/,
    /docs\.google\.com\/presentation\/d\/([^/&?#]+)/,
    /docs\.google\.com\/forms\/d\/([^/&?#]+)/,
    /docs\.google\.com\/drawings\/d\/([^/&?#]+)/,
    /drive\.google\.com\/file\/d\/([^/&?#]+)/,
    /drive\.google\.com\/open\?.*id=([^&?#]+)/
  ];

  let appOrigin = null;

  /** Try to extract a Google Drive file ID from a URL. Returns null if not a Drive link. */
  function extractFileId(url) {
    for (const pattern of DRIVE_URL_PATTERNS) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /** Intercept clicks on Drive links and route them through the parent app. */
  function onLinkClick(event) {
    let el = event.target;
    while (el && el.tagName !== 'A') {
      el = el.parentElement;
    }
    if (!el || !el.href) return;

    const fileId = extractFileId(el.href);
    if (!fileId) return;

    event.preventDefault();
    event.stopPropagation();

    window.parent.postMessage(
      { type: 'atlas-navigate', fileId },
      appOrigin
    );
  }

  window.addEventListener('message', function onMessage(event) {
    if (event.data && event.data.type === 'atlas-ack') {
      appOrigin = event.origin;
      document.addEventListener('click', onLinkClick, true);
      window.removeEventListener('message', onMessage);
    }
  });

  window.parent.postMessage({ type: 'atlas-check' }, '*');
})();
