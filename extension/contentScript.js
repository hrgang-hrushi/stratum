// Injects a floating toggle button and a right-side iframe that loads the extension's bundled UI
(function() {
  if (window.__STRATUM_EXTENSION_INJECTED) return;
  window.__STRATUM_EXTENSION_INJECTED = true;

  const style = document.createElement('style');
  style.textContent = `
    #stratum-toggle-btn { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; }
    #stratum-toggle-btn button { background: #111; color: #fff; border-radius: 999px; padding: 10px 14px; border: none; box-shadow: 0 6px 20px rgba(0,0,0,0.25); cursor: pointer; }
    #stratum-iframe { position: fixed; right: 18px; top: 72px; bottom: 18px; width: 420px; max-width: 92vw; border-radius: 12px; box-shadow: 0 24px 60px rgba(0,0,0,0.35); border: 1px solid rgba(0,0,0,0.06); z-index: 2147483646; overflow: hidden; }
    @media (max-width: 700px) { #stratum-iframe { width: 92vw; right: 4vw; } }
  `;
  document.head.appendChild(style);

  // Toggle wrapper
  const wrapper = document.createElement('div');
  wrapper.id = 'stratum-toggle-btn';
  wrapper.innerHTML = `<button id="stratum-open-btn">Stratum</button>`;
  document.body.appendChild(wrapper);

  let iframe = null;

  const openPanel = () => {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.id = 'stratum-iframe';
    // load the extension's index.html (must be packaged into the extension)
    iframe.src = chrome.runtime.getURL('index.html');
    iframe.setAttribute('frameborder', '0');
    document.body.appendChild(iframe);
  };

  const closePanel = () => {
    if (!iframe) return;
    iframe.remove();
    iframe = null;
  };

  wrapper.addEventListener('click', (e) => {
    if (iframe) closePanel(); else openPanel();
  });

  // expose simple API for debugging
  window.stratumExtension = { open: openPanel, close: closePanel };
})();
