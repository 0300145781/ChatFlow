const fs = require('fs');
const sharp = require('sharp');

const svg = `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3B82F6" />
      <stop offset="100%" stop-color="#8B5CF6" />
    </linearGradient>
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.15" />
    </filter>
  </defs>
  <path d="M20 50C20 33.4315 33.4315 20 50 20C66.5685 20 80 33.4315 80 50C80 66.5685 66.5685 80 50 80C44.5 80 39.4 78.5 35 76C33.5 75.2 31.8 74.8 30 75L22 77.5C20.2 78 18.5 76.2 19 74.5L21.5 66.5C21.8 64.7 21.3 63 20.5 61.5C18.5 58 17.5 54 17.5 50Z" fill="url(#flowGradient)" filter="url(#softShadow)"/>
  <path d="M32 52C38 52 42 44 50 44C58 44 62 52 68 52" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function main() {
  const buffer = Buffer.from(svg);
  
  await sharp(buffer).resize(192, 192).png().toFile('public/icon-192x192.png');
  await sharp(buffer).resize(512, 512).png().toFile('public/icon-512x512.png');
  await sharp(buffer).resize(180, 180).png().toFile('public/apple-touch-icon.png');
  console.log('Successfully generated icon-192x192.png, icon-512x512.png, and apple-touch-icon.png!');
}

main().catch(console.error);
