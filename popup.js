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

  // Combine salt + iv + ciphertext for output
  const combined = new Uint8Array([...salt, ...iv, ...new Uint8Array(ciphertext)]);
  const base64 = btoa(String.fromCharCode(...combined));

  document.getElementById("output").value = base64;
});
