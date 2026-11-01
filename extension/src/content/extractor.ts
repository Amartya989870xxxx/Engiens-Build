// Web Content Extractor for Dexor Companion
// Runs on-demand when the user clicks "Capture Page Context"

export interface ExtractedPageResult {
  url: string;
  title: string;
  domain: string;
  selectedText?: string;
  pageContent: string;
  contentLength: number;
  capturedAt: string;
}

export function extractPageContentInPage(): ExtractedPageResult {
  const url = window.location.href;
  const title = document.title || window.location.hostname;
  const domain = window.location.hostname;
  const selectedText = window.getSelection()?.toString().trim() || undefined;

  // Find most relevant content container
  const mainCandidate =
    document.querySelector("main") ||
    document.querySelector("article") ||
    document.querySelector('[role="main"]') ||
    document.querySelector(".markdown-body") ||
    document.querySelector(".documentation") ||
    document.querySelector(".docs-content") ||
    document.querySelector("#content") ||
    document.body;

  if (!mainCandidate) {
    return {
      url,
      title,
      domain,
      selectedText,
      pageContent: "No readable content found on this page.",
      contentLength: 0,
      capturedAt: new Date().toISOString(),
    };
  }

  // Clone to avoid mutating live DOM
  const clone = mainCandidate.cloneNode(true) as HTMLElement;

  // Remove unwanted, noisy or sensitive elements
  const tagsToRemove = [
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "iframe",
    "form",
    "input",
    "textarea",
    "select",
    "button",
    "nav",
    "header",
    "footer",
    "dialog",
  ];

  tagsToRemove.forEach((tag) => {
    const elements = clone.querySelectorAll(tag);
    elements.forEach((el) => el.remove());
  });

  // Remove hidden elements
  const hiddenElements = clone.querySelectorAll('[aria-hidden="true"], [hidden]');
  hiddenElements.forEach((el) => el.remove());

  // Extract clean text
  let rawText = clone.innerText || clone.textContent || "";

  // Normalize whitespace: replace 3+ newlines with 2, replace tabs with spaces
  let cleaned = rawText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Cap at 15,000 characters for optimal reasoning performance and token usage
  if (cleaned.length > 15000) {
    cleaned = cleaned.slice(0, 15000) + "\n\n[...content truncated for brevity...]";
  }

  return {
    url,
    title,
    domain,
    selectedText: selectedText && selectedText.length > 0 ? selectedText.slice(0, 5000) : undefined,
    pageContent: cleaned,
    contentLength: cleaned.length,
    capturedAt: new Date().toISOString(),
  };
}
