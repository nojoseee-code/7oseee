# Script Store — License Platform

A self-hosted licensing platform for FiveM resources: Discord login, a user
dashboard (view licenses, reset IP lock, rename server, download), an admin
panel ("Anwar Panel") to manage products/licenses, and the core validation
endpoint your Lua resources call at runtime to enforce the license.

**Status: backend + website are built and tested. Discord bot `/license`
command and the Lua obfuscator tool are being added next in this same
project — this README will grow with them.**

## What's working right now

- Discord OAuth2 login ("Login with Discord")
- License model: license key + IP lock + server name label, per product, per Discord user
- `/api/validate` — the endpoint a real FiveM resource calls on start to check its license (this is the actual anti-piracy mechanism, independent of obfuscation)
- One-time, single-use download links (`/dl/:token`)
- User dashboard: list licenses, reset IP (1x/24h), rename server, download
- Admin panel: create/delete products, issue/revoke/delete licenses
- Plain JSON file storage — no database server or native compilation required, just Node.js

## Requirements

- Node.js 18+
- A Discord Application (you said you already have one) with:
  - Client ID + Client Secret (for website login) — Discord Developer Portal → your app → OAuth2
  - A redirect URL registered that matches `DISCORD_REDIRECT_URI` exactly

## Setup

```bash
npm install
cp .env.example .env
# edit .env: fill in DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI,
# ADMIN_DISCORD_IDS (your own Discord user ID), SESSION_SECRET, BOT_API_SECRET
node server/index.js
```

Visit `http://localhost:3000`. Log in with Discord using the account whose
ID you put in `ADMIN_DISCORD_IDS` to unlock `/admin.html`.

## Adding a product

1. Go to `/admin.html` → **Products** → **New product**.
2. Put the actual deliverable file (the obfuscated `.lua`, or a zipped
   resource folder) into the `resources/` directory, and set the product's
   **File name** field to match exactly.
3. Issue a license under **Licenses** → **Issue license**, picking the
   product and the buyer's Discord user ID (right-click their name in
   Discord → Copy User ID; requires Developer Mode on in Discord settings).

## Wiring a real FiveM resource to enforce its license

Inside the resource's server-side Lua, call the validate endpoint on start
and stop the resource if it comes back invalid. A ready-to-use example is
in `example-resource/`.

```lua
local function checkLicense()
    PerformHttpRequest('https://your-domain.example/api/validate', function(statusCode, response)
        local ok = false
        if response then
            local data = json.decode(response)
            ok = data and data.valid
        end
        if not ok then
            print('^1[license] This server is not authorized to run this resource.^0')
            StopResource(GetCurrentResourceName())
        end
    end, 'POST', json.encode({ licenseKey = 'PUT_THE_BUYER_LICENSE_KEY_HERE' }), { ['Content-Type'] = 'application/json' })
end

CreateThread(checkLicense)
```

The first server that sends a given key locks that key to its IP
automatically — nothing to configure server-side beyond the key itself.

## Notes on IP detection behind a proxy

If you put nginx/Caddy/Cloudflare in front of this app, uncomment
`app.set('trust proxy', 1)` in `server/index.js`, otherwise every
validating server will appear to share the proxy's IP.

## Deploying

Any VPS with Node.js works. A minimal production run:

```bash
npm install --omit=dev
pm2 start server/index.js --name license-platform
```

Put the whole thing behind a reverse proxy with HTTPS (Caddy is the least
config for this — one line: `your-domain.example { reverse_proxy localhost:3000 }`).

---
*More sections (Discord bot setup, Lua obfuscator usage) are being added next.*
