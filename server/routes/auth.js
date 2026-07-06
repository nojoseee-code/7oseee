const express = require('express');
const { config } = require('../config');
const db = require('../db');

const router = express.Router();

// Step 1: send the browser to Discord's consent screen.
router.get('/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: 'code',
    scope: 'identify',
    prompt: 'none',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

// Step 2: Discord redirects back here with a one-time ?code=
router.get('/discord/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect('/?login_error=' + encodeURIComponent(error));
  if (!code) return res.redirect('/?login_error=missing_code');

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.discord.redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('[auth] token exchange failed:', tokenRes.status, text);
      return res.redirect('/?login_error=token_exchange_failed');
    }

    const tokenData = await tokenRes.json();

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) return res.redirect('/?login_error=profile_fetch_failed');
    const profile = await userRes.json();

    const user = db.upsertUser({
      discordId: profile.id,
      username: `${profile.username}${profile.discriminator && profile.discriminator !== '0' ? '#' + profile.discriminator : ''}`,
      avatar: profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(profile.id) % 5n)}.png`,
    });

    req.session.user = {
      id: user.id,
      discordId: user.discordId,
      username: user.username,
      avatar: user.avatar,
      isAdmin: config.adminDiscordIds.includes(user.discordId),
    };

    res.redirect('/dashboard.html');
  } catch (err) {
    console.error('[auth] callback error:', err);
    res.redirect('/?login_error=server_error');
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'not_logged_in' });
  res.json({ user: req.session.user });
});

module.exports = router;
