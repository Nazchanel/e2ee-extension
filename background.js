chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "decrypt-text",
    title: "Decrypt with E2EE",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "decrypt-text") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: decryptSelectedText
    });
  }
});

function decryptSelectedText() {
  async function decrypt(encryptedText, password) {
    try {
      const raw = atob(encryptedText);
      const bytes = new Uint8Array([...raw].map(c => c.charCodeAt(0)));
      const salt = bytes.slice(0, 16);
      const iv = bytes.slice(16, 28);
      const data = bytes.slice(28);
      
      const keyMaterial = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(password),
        { name: "PBKDF2" }, false, ["deriveKey"]
      );
      
      const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
      );
      
      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      alert("Decryption failed. Wrong password or corrupted text.");
      return null;
    }
  }
  
  const password = prompt("Enter decryption password:");
  if (!password) return;
  
  const selection = window.getSelection();
  const text = selection.toString().trim();
  if (!text) return;
  
  decrypt(text, password).then(decryptedText => {
    if (!decryptedText) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    
    const span = document.createElement("span");
    span.textContent = decryptedText;
    
    // Style to ensure visible text regardless of site styles
    span.style.backgroundColor = "#fff8a6";  // soft yellow background
    span.style.color = "#000";                // black text
    span.style.padding = "2px 4px";
    span.style.borderRadius = "3px";
    span.style.whiteSpace = "pre-wrap";      // preserve whitespace
    
    range.insertNode(span);
    
  });
}
