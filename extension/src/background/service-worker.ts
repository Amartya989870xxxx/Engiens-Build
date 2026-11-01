// Dexor Companion Background Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  // Configure side panel to open upon extension action click
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => {
      console.error("[Dexor Companion] Error setting side panel behavior:", error);
    });
});

// Listener for action click fallback
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (err) {
      console.error("[Dexor Companion] Could not open side panel:", err);
    }
  }
});
