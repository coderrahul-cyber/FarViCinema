## Things To Be Noted
Content in this file is for noting down the problems i have faced and the solution for it, so if in future i face the same problem i can refer to this file to solve it quickly without wasting time on debugging again.  

Table of Contents:
- [Things To Be Noted](#things-to-be-noted)
  - [For localy tesing](#for-localy-tesing)
  - [ENV PROBLEM IN TURBOREPO (I don't know what happen after this the code runs fine , if future it crash use the method below to fix it again)](#env-problem-in-turborepo-i-dont-know-what-happen-after-this-the-code-runs-fine--if-future-it-crash-use-the-method-below-to-fix-it-again)
  - [NGINX AND COTURN THINGS](#nginx-and-coturn-things)
    - [1. Nginx config for dev](#1-nginx-config-for-dev)
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






### COMMANDS
```bash
bunx --bun prisma generate --schema=./prisma/schema.prisma
```
