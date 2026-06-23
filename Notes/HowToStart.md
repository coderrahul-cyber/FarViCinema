## Things To Be Noted
Content in this file is for noting down the problems i have faced and the solution for it, so if in future i face the same problem i can refer to this file to solve it quickly without wasting time on debugging again.  

Table of Contents:
- [Things To Be Noted](#things-to-be-noted)
  - [For localy tesing](#for-localy-tesing)
  - [What changed from same-machine to LAN:](#what-changed-from-same-machine-to-lan)
  - [ENV PROBLEM IN TURBOREPO (I don't know what happen after this the code runs fine , if future it crash use the method below to fix it again)](#env-problem-in-turborepo-i-dont-know-what-happen-after-this-the-code-runs-fine--if-future-it-crash-use-the-method-below-to-fix-it-again)
  - [NGINX AND COTURN THINGS](#nginx-and-coturn-things)
    - [1. Nginx config for dev](#1-nginx-config-for-dev)
    - [2. regenerate SSL cert to cover your LAN IP](#2-regenerate-ssl-cert-to-cover-your-lan-ip)
      - [Change 2 — frontend/.env.local](#change-2--frontendenvlocal)
      - [Change 3 — install mkcert's root CA on your Android phone (one time)](#change-3--install-mkcerts-root-ca-on-your-android-phone-one-time)
      - [Change 4 — restart NGINX with the new cert](#change-4--restart-nginx-with-the-new-cert)
      - [Change 5 — restart Next.js](#change-5--restart-nextjs)
  - [COMMANDS](#commands)

### For localy tesing
- When locally testing on the same the device you can use the AnnouedIp as the 127.xx.xx.x , but for  Testing out in the Lan you should use the Local ip(Lan ip) of the device, and for testing in production you should use the public ip or domain name of the server.
- For local development, you can use the ws:// protocol for WebSocket connections since you're not using TLS. However, for production and multiple device testing , you should switch to wss:// and https to ensure secure communication over TLS. Make sure to update your Nginx configuration and environment variables accordingly when moving from development to production.
- For tesing to multiple device locally on same wifi you should allow the inbound traffic on the port range 2000-2200 in your firewall settings, and also make sure to use the local IP address of the device running the server in your WebSocket URL .
- Commands for powershell to allow inbound traffic on port range 2000-2200:
```powershell
New-NetFirewallRule -DisplayName "Allow UDP 2000-2100" `
  -Direction Inbound `
  -Protocol UDP `
  -LocalPort 2000-2100 `
  -Action Allow
```
```powershell
New-NetFirewallRule -DisplayName "Allow TCP 8080" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 8080 `
  -Action Allow
```
And Also Cross origin fix for next js 
```ts
const nextConfig = {
  output: 'standalone',
  allowedDevOrigins: [
    '<IP>', // Replace with your LAN IP address
    'localhost',
  ],
}
```

### What changed from same-machine to LAN:

* ANNOUNCED_IP → your LAN IP (so WebRTC ICE candidates point to the right place)
* NEXT_PUBLIC_WS_URL → wss://<IP>/ws (phone can't resolve localhost)
* Regenerated mkcert cert to cover the LAN IP (so HTTPS works on the phone)
* Installed mkcert root CA on Android (so Chrome trusts the cert and allows mediaDevices)
* Firewall* ports 2000-2200/UDP open on Windows
* Next.js started with -H 0.0.0.0

__When switching back to same-machine testing, just flip these two back:__  
* ANNOUNCED_IP=127.0.0.1
* NEXT_PUBLIC_WS_URL=ws://localhost:8080
* And restart mediasoup and Next.js. Everything else stays the same.

### ENV PROBLEM IN TURBOREPO (I don't know what happen after this the code runs fine , if future it crash use the method below to fix it again)
There is an issue with environment variables not being picked up correctly in a Turborepo monorepo setup, particularly when using Bun as the runtime. The problem seems to stem from how environment variables are loaded and accessed across different packages in the monorepo.   

* __Environment variables are read from the process environment (process.env) at runtime. .env files are not automatically read by Node/Bun — a loader (e.g. dotenv)__ 
* __When you import code from packages/tokenconfig, that code runs in the backend process. If tokenconfig expects process.env.MY_SECRET but nobody called dotenv.config() before reading it, process.env.MY_SECRET will be undefined.__
* __Also: path resolution — relative .env path depends on the current working directory or where dotenv.config({ path }) points. Running backend from repo root vs from apps/backend changes relative paths.__   
__SOLUTION:__  
what i have i done exporting the ENV VARIABLE from the folder in packages and import it in the apps where its needed.  



### NGINX AND COTURN THINGS

#### 1. Nginx config for dev
The nginx.dev.conf file is set up to proxy WebSocket requests to the Bun WS server and regular HTTP requests to the Next.js frontend. Make sure to adjust the proxy_pass URLs if your services are running on different ports.
But for local developement use the ws not wss because we are not using TLS in dev, and for production use wss because we will have TLS certs.


#### 2. regenerate SSL cert to cover your LAN IP
The current mkcert cert is only valid for localhost. Your phone connects to 192.168.x.x so it gets an SSL mismatch error. Regenerate it 

__Replace 192.168.1.37 with your actual LAN IP__
```bash
mkcert -cert-file nginx/ssl/cert.pem -key-file nginx/ssl/key.pem localhost 127.0.0.1 192.168.1.37
```
* Then copy the same cert to coturn and mediasoup ssl folders if they exist:
```bash
cp nginx/ssl/cert.pem coturn/ssl/cert.pem
cp nginx/ssl/key.pem  coturn/ssl/key.pem
```
##### Change 2 — frontend/.env.local
Switch both URLs to go through NGINX over HTTPS/WSS:
```bash
NEXT_PUBLIC_WS_URL=wss://192.168.1.37/ws
```
The frontend URL on the phone becomes https://192.168.1.37 — NGINX proxies everything.
##### Change 3 — install mkcert's root CA on your Android phone (one time)
This is what makes Chrome on Android trust your self-signed cert. Without this you get a security error and mediaDevices is still blocked.
```bash
#Find where mkcert stores its root CA
mkcert -CAROOT
# Prints something like: C:\Users\YourName\AppData\Local\mkcert
```
Go to that folder, find rootCA.pem. Send it to your phone — email it to yourself, upload to Google Drive, or copy via USB.  
 Then on Android:
```bash
Settings → Security → Encryption & credentials → Install a certificate → CA certificate → Install anyway → pick rootCA.pem
Exact path varies slightly by Android version — search "install CA certificate" in Settings if you can't find it.
```
##### Change 4 — restart NGINX with the new cert

##### Change 5 — restart Next.js


After all this, on the phone open:  
__https://192.168.1.37/room/test-room?token=eyJ...__  
No port number — NGINX handles 443. Chrome will trust the cert (because you installed the CA), mediaDevices becomes available, camera permission prompt appears, done.  
On the laptop you can keep using http://localhost:3001 directly or https://localhost through NGINX — both work. But update .env.local to wss://192.168.1.37/ws on the laptop too, since that's the WS URL baked into the Next.js build now.




### COMMANDS
```bash
bunx --bun prisma generate --schema=./prisma/schema.prisma
```
