// Load and display saved passwords
function loadSavedPasswords() {
  chrome.storage.local.get('domainPasswords', (data) => {
    const container = document.getElementById('saved-passwords');
    container.innerHTML = '';
    
    if (!data.domainPasswords || Object.keys(data.domainPasswords).length === 0) {
      container.innerHTML = '<p>No saved passwords</p>';
      return;
    }
    
    for (const [domain, password] of Object.entries(data.domainPasswords)) {
      const div = document.createElement('div');
      div.className = 'password-item';
      div.innerHTML = `
        <strong>${domain}</strong>: ${'•'.repeat(password.length)}
        <button class="remove-password" data-domain="${domain}">Remove</button>
      `;
      container.appendChild(div);
    }
    
    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-password').forEach(button => {
      button.addEventListener('click', (e) => {
        const domain = e.target.getAttribute('data-domain');
        chrome.storage.local.get('domainPasswords', (data) => {
          delete data.domainPasswords[domain];
          chrome.storage.local.set({ domainPasswords: data.domainPasswords }, () => {
            loadSavedPasswords();
          });
        });
      });
    });
  });
}

// Load passwords when popup opens
document.addEventListener('DOMContentLoaded', loadSavedPasswords);

// Keep existing encryption code
document.getElementById("encrypt").addEventListener("click", async () => {
  const text = document.getElementById("plaintext").value;
  const password = document.getElementById("password").value;

  if (!text || !password) {
    alert("Please enter both message and password.");
    return;
  }

  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password),
    "PBKDF2", false, ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(text)
  );

  const combined = new Uint8Array([...salt, ...iv, ...new Uint8Array(ciphertext)]);
  const base64 = btoa(String.fromCharCode(...combined));

  document.getElementById("output").value = base64;
});