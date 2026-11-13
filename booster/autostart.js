if (window.top === window) chrome.runtime.sendMessage({ target: "worker", type: "autostart" }).catch(() => {});
