// lib/crypto.ts

/**
 * End-to-End Encryption (E2EE) Utility using native Web Crypto API and IndexedDB.
 * We use ECDH (Elliptic Curve Diffie-Hellman) on the P-256 curve to generate a shared secret,
 * and AES-GCM to encrypt/decrypt messages.
 */

const DB_NAME = "chatflow_e2ee";
const STORE_NAME = "keys";
const CURVE = "P-256";

// ==========================================
// IndexedDB Wrapper for Private Key Storage
// ==========================================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function storePrivateKey(userId: string, key: CryptoKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(key, userId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getPrivateKey(userId: string): Promise<CryptoKey | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(userId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

// ==========================================
// Web Crypto API: ECDH Key Generation
// ==========================================

export async function generateKeyPair(): Promise<{ publicKeyStr: string; privateKey: CryptoKey; publicKey: CryptoKey }> {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: CURVE },
    true, // Extractable (so we can export public key)
    ["deriveKey", "deriveBits"]
  );

  // Export public key to JWK (JSON Web Key) format for easy database storage
  const jwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const publicKeyStr = JSON.stringify(jwk);

  return { publicKeyStr, privateKey: keyPair.privateKey, publicKey: keyPair.publicKey };
}

export async function importPublicKey(jwkStr: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkStr);
  return window.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: CURVE },
    true,
    []
  );
}

// ==========================================
// Web Crypto API: Deriving Shared Secret
// ==========================================

export async function deriveSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return window.crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: publicKey,
    },
    privateKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false, // the derived key should not be extractable
    ["encrypt", "decrypt"]
  );
}

// ==========================================
// Web Crypto API: AES-GCM Encrypt/Decrypt
// ==========================================

// Helper: Uint8Array to Base64
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper: Base64 to Uint8Array
function base64ToBuffer(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptMessage(text: string, sharedSecret: CryptoKey, iv: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const encodedText = enc.encode(text);

  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as any,
    },
    sharedSecret,
    encodedText
  );

  return bufferToBase64(ciphertext);
}

export async function decryptMessage(ciphertextBase64: string, sharedSecret: CryptoKey, iv: Uint8Array): Promise<string> {
  const ciphertextBuffer = base64ToBuffer(ciphertextBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv as any,
    },
    sharedSecret,
    ciphertextBuffer
  );

  const dec = new TextDecoder();
  return dec.decode(decryptedBuffer);
}
