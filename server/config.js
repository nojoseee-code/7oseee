require('dotenv').config();

function list(envVar) {
  return (process.env[envVar] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const config = {
  siteName: process.env.SITE_NAME || 'Script Store',
  port: parseInt(process.env.PORT || '3000', 10),
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),

  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',

  discord: {
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    redirectUri: process.env.DISCORD_REDIRECT_URI || '',
  },

  adminDiscordIds: list('ADMIN_DISCORD_IDS'),

  botApiSecret: process.env.BOT_API_SECRET || '',
};

// Fail loudly at boot (not silently at request time) if critical secrets are missing.
function assertConfigured() {
  const missing = [];
  if (!config.discord.clientId) missing.push('DISCORD_CLIENT_ID');
  if (!config.discord.clientSecret) missing.push('DISCORD_CLIENT_SECRET');
  if (!config.discord.redirectUri) missing.push('DISCORD_REDIRECT_URI');
  if (!config.botApiSecret || config.botApiSecret === 'change-this-to-a-long-random-string') {
    missing.push('BOT_API_SECRET (still has the placeholder value)');
  }
  if (missing.length) {
    console.warn(
      '[config] Missing/placeholder values for: ' +
        missing.join(', ') +
        '\n[config] Discord login and the bot API will not work correctly until .env is filled in.'
    );
  }
}

module.exports = { config, assertConfigured };
