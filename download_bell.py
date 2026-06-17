import urllib.request
import ssl

url = "https://www.soundjay.com/phone/sounds/telephone-ring-03a.mp3"
req = urllib.request.Request(
    url, 
    headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
)

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

with urllib.request.urlopen(req, context=ctx) as response, open('public/sounds/incoming_bell.mp3', 'wb') as out_file:
    out_file.write(response.read())

print("Downloaded")
