const https = require('https');
const fs = require('fs');

const url = 'https://www.soundjay.com/phone/sounds/telephone-ring-03a.mp3';
const options = {
  rejectUnauthorized: false,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
};

https.get(url, options, (res) => {
  if (res.statusCode !== 200) {
    console.error(`Failed to get '${url}' (${res.statusCode})`);
    res.resume();
    return;
  }
  const file = fs.createWriteStream('public/sounds/incoming_bell.mp3');
  res.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('Downloaded Bell MP3!');
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
