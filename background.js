  // Store domain passwords in memory for quick access
  const domainPasswords = {};
  
  // Load saved passwords from storage when extension starts
  chrome.storage.local.get('domainPasswords', (data) => {
    if (data.domainPasswords) {
      Object.assign(domainPasswords, data.domainPasswords);
    }
  });
  
  // Set up context menu items when extension is installed
  chrome.runtime.onInstalled.addListener(() => {
    // Decrypt context menu
    chrome.contextMenus.create({
      id: "decrypt-text",
      title: "Decrypt with E2EE",
      contexts: ["selection"]
    });
    
    // Set domain password context menu
    chrome.contextMenus.create({
      id: "set-domain-password",
      title: "Set password for this domain",
      contexts: ["all"]
    });
    
    // Clear domain password context menu
    chrome.contextMenus.create({
      id: "clear-domain-password",
      title: "Clear password for this domain",
      contexts: ["all"]
    });
  });
  
  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const url = new URL(tab.url);
    const domain = url.hostname;
    
    if (info.menuItemId === "decrypt-text") {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: decryptSelectedText
      });
    } 
    else if (info.menuItemId === "set-domain-password") {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: promptForPassword,
        args: [`Set password for ${domain}`]
      });
      
      if (result[0].result) {
        domainPasswords[domain] = result[0].result;
        await chrome.storage.local.set({ domainPasswords });
        showSuccessNotification(tab.id, `Password saved for ${domain}`);
      }
    }
    else if (info.menuItemId === "clear-domain-password") {
      if (domainPasswords[domain]) {
        delete domainPasswords[domain];
        await chrome.storage.local.set({ domainPasswords });
        showSuccessNotification(tab.id, `Password cleared for ${domain}`);
      } else {
        showErrorNotification(tab.id, `No password found for ${domain}`);
      }
    }
  });
  
  // Handle keyboard shortcut (Ctrl+Shift+E)
  chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command === "encrypt-selection") {
      const url = new URL(tab.url);
      const domain = url.hostname;
      
      if (domainPasswords[domain]) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: encryptAndReplaceSelectedText,
          args: [domainPasswords[domain]]
        });
      } else {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: promptForPassword,
          args: [`Set password for ${domain}`]
        });
        
        if (result[0].result) {
          domainPasswords[domain] = result[0].result;
          await chrome.storage.local.set({ domainPasswords });
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: encryptAndReplaceSelectedText,
            args: [result[0].result]
          });
        }
      }
    }
  });
  
  // Show success notification in the current tab
  function showSuccessNotification(tabId, message) {
    chrome.scripting.executeScript({
      target: { tabId },
      function: (msg) => {
        const div = document.createElement('div');
        div.style.position = 'fixed';
        div.style.top = '20px';
        div.style.right = '20px';
        div.style.backgroundColor = '#4CAF50';
        div.style.color = 'white';
        div.style.padding = '10px 20px';
        div.style.borderRadius = '5px';
        div.style.zIndex = '9999';
        div.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        div.textContent = msg;
        document.body.appendChild(div);
        
        setTimeout(() => {
          div.style.transition = 'opacity 0.5s';
          div.style.opacity = '0';
          setTimeout(() => div.remove(), 500);
        }, 2000);
      },
      args: [message]
    });
  }
  
  // Show error notification in the current tab
  function showErrorNotification(tabId, message) {
    chrome.scripting.executeScript({
      target: { tabId },
      function: (msg) => {
        const div = document.createElement('div');
        div.style.position = 'fixed';
        div.style.top = '20px';
        div.style.right = '20px';
        div.style.backgroundColor = '#f44336';
        div.style.color = 'white';
        div.style.padding = '10px 20px';
        div.style.borderRadius = '5px';
        div.style.zIndex = '9999';
        div.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        div.textContent = msg;
        document.body.appendChild(div);
        
        setTimeout(() => {
          div.style.transition = 'opacity 0.5s';
          div.style.opacity = '0';
          setTimeout(() => div.remove(), 500);
        }, 2000);
      },
      args: [message]
    });
  }
  
  // Helper function to prompt for password (used in content scripts)
  function promptForPassword(message) {
    return prompt(`${message} (will be saved for this domain):`, "");
  }
  
  // Content script function to encrypt and REPLACE selected text
  function encryptAndReplaceSelectedText(password) {
    async function encrypt(plaintext, password) {
      const enc = new TextEncoder();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const keyMaterial = await crypto.subtle.importKey(
        "raw", enc.encode(password),
        "PBKDF2", false, ["deriveKey"]
      );
      
      const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
      );
      
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        enc.encode(plaintext)
      );
      
      const combined = new Uint8Array([...salt, ...iv, ...new Uint8Array(ciphertext)]);
      return btoa(String.fromCharCode(...combined));
    }
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text) return;
    
    // Store the original range boundaries
    const originalStartContainer = range.startContainer;
    const originalStartOffset = range.startOffset;
    const originalEndContainer = range.endContainer;
    const originalEndOffset = range.endOffset;
    
    encrypt(text, password).then(encryptedText => {
      // Create a new range that covers the original selection
      const newRange = document.createRange();
      newRange.setStart(originalStartContainer, originalStartOffset);
      newRange.setEnd(originalEndContainer, originalEndOffset);
      
      // Completely remove the original content
      newRange.deleteContents();
      
      // Insert the encrypted text
      const encryptedNode = document.createTextNode(encryptedText);
      newRange.insertNode(encryptedNode);
      
      // For rich text editors, trigger input events to ensure changes stick
      const container = newRange.commonAncestorContainer;
      if (container.isContentEditable || (container.nodeType === Node.ELEMENT_NODE && container.closest('[contenteditable]'))) {
        const event = new Event('input', { bubbles: true });
        container.dispatchEvent(event);
      }
    }).catch(err => {
      console.error('Encryption failed:', err);
      alert('Encryption failed. Please try again.');
    });
  }
  
  // Content script function to decrypt selected text
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
      span.style.backgroundColor = "#fff8a6";
      span.style.color = "#000";
      span.style.padding = "2px 4px";
      span.style.borderRadius = "3px";
      span.style.whiteSpace = "pre-wrap";
      
      range.insertNode(span);
    });
  }
