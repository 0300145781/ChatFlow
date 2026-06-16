const fs = require('fs');
const path = require('path');

function createWav(frequency, patternDurationMs, activeDurationMs) {
  const sampleRate = 44100;
  const numChannels = 1;
  const bitsPerSample = 16;
  const durationSeconds = 3; // 3 seconds loop
  const numSamples = sampleRate * durationSeconds;
  
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const subChunk2Size = numSamples * numChannels * (bitsPerSample / 8);
  const chunkSize = 36 + subChunk2Size;

  const buffer = Buffer.alloc(44 + subChunk2Size);

  // RIFF chunk descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(chunkSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(subChunk2Size, 40);

  // Write audio data
  for (let i = 0; i < numSamples; i++) {
    const timeMs = (i / sampleRate) * 1000;
    const isPlaying = (timeMs % patternDurationMs) < activeDurationMs;
    
    // Convert to 16-bit PCM (-32768 to 32767)
    let val = 0;
    if (isPlaying) {
      // US standard ringing: 440 Hz + 480 Hz
      const f1 = Math.sin(2 * Math.PI * 440 * (i / sampleRate));
      const f2 = Math.sin(2 * Math.PI * 480 * (i / sampleRate));
      
      // Modulate at 20 Hz (the physical clapper hitting the bell)
      const modulator = Math.sin(2 * Math.PI * 20 * (i / sampleRate));
      
      // Mix and modulate
      const sample = (f1 + f2) * 0.5 * (0.5 + 0.5 * modulator);
      val = Math.floor(sample * 16000); // 16000 amplitude
    }
    
    if (val > 32767) val = 32767;
    if (val < -32768) val = -32768;
    
    buffer.writeInt16LE(val, 44 + i * 2);
  }

  return buffer;
}

const soundsDir = path.join(__dirname, 'public', 'sounds');
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

// Incoming ring (UK style double ring)
const incomingBuffer = createWav(400, 3000, 1000);
fs.writeFileSync(path.join(soundsDir, 'incoming.wav'), incomingBuffer);

// Outgoing ring (US style ringback)
const outgoingBuffer = createWav(440, 6000, 2000);
fs.writeFileSync(path.join(soundsDir, 'outgoing.wav'), outgoingBuffer);

console.log("Wav files generated successfully!");
