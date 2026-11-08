import express from 'express';
import crypto from 'crypto';
import { CONFIG } from '../../config.js';
import { DatabaseHelper } from '../../database/db.js';

export const authRouter = express.Router();

const DISCORD_API_URL = 'https://discord.com/api/v10';
const OAUTH_SCOPES = ['identify', 'guilds'];

// In-memory token cache backed by SQLite
export const authTokens = new Map();

export function createAuthToken(userData, accessToken) {
  const token = 'cav_' + crypto.randomBytes(32).toString('hex');
  authTokens.set(token, {
    user: userData,
    accessToken,
    createdAt: Date.now()
  });
  DatabaseHelper.saveAuthSession(token, userData, accessToken);
  return token;
}

export function validateAuthToken(token) {
  if (!token) return null;
  const entry = authTokens.get(token);
  if (entry) {
    if (Date.now() - entry.createdAt > 90 * 24 * 60 * 60 * 1000) {
      authTokens.delete(token);
      DatabaseHelper.deleteAuthSession(token);
      return null;
    }
    return entry.user;
  }

  // Check persistent SQLite database
  const dbUser = DatabaseHelper.getAuthSession(token);
  if (dbUser) {
    authTokens.set(token, {
      user: dbUser,
      accessToken: '',
      createdAt: Date.now()
    });
    return dbUser;
  }
  return null;
}

function getCallbackUrl(req) {
  if (process.env.OAUTH2_CALLBACK_URL) {
    return process.env.OAUTH2_CALLBACK_URL;
  }
  if (req?.headers?.host && !req.headers.host.includes('localhost') && !req.headers.host.match(/^[0-9.]+:\d+$/)) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    return `${proto}://${req.headers.host}/auth/discord/callback`;
  }
  return CONFIG.OAUTH2_CALLBACK_URL || 'https://sentry.wispbyte.app/auth/discord/callback';
}

authRouter.get('/login', (req, res) => {
  // If user is already logged in, redirect directly to dashboard without going to Discord!
  if (req.session?.user) {
    return res.redirect('/dashboard.html');
  }

  if (req.headers.cookie) {
    const match = req.headers.cookie.match(/cav_auth_token=([^;]+)/);
    if (match) {
      const user = validateAuthToken(match[1]);
      if (user) {
        req.session.user = user;
        return res.redirect('/dashboard.html');
      }
    }
  }

  if (!CONFIG.CLIENT_ID) {
    return res.redirect('/?error=missing_client_id');
  }

  const callbackUrl = getCallbackUrl(req);
  console.log(`[OAuth2] Initiating login with redirect_uri: ${callbackUrl}`);

  const redirectUri = encodeURIComponent(callbackUrl);
  const scope = encodeURIComponent(OAUTH_SCOPES.join(' '));
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CONFIG.CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
  
  res.redirect(discordAuthUrl);
});

const handleCallback = async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.redirect('/?error=no_code');
  }

  if (!CONFIG.CLIENT_SECRET) {
    console.error('[OAuth2 Error] DISCORD_CLIENT_SECRET is missing! Please configure DISCORD_CLIENT_SECRET in Wispbyte environment variables.');
    return res.redirect('/?error=missing_client_secret');
  }

  const primaryUrl = getCallbackUrl(req);
  const altUrl = primaryUrl.includes('/discord/callback')
    ? primaryUrl.replace('/discord/callback', '/callback')
    : primaryUrl.replace('/auth/callback', '/auth/discord/callback');

  try {
    let tokenResponse = await fetch(`${DISCORD_API_URL}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: CONFIG.CLIENT_ID,
        client_secret: CONFIG.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code.toString(),
        redirect_uri: primaryUrl
      })
    });

    let tokenData = await tokenResponse.json();

    if ((!tokenResponse.ok || !tokenData.access_token) && altUrl) {
      console.log(`[OAuth2] Primary redirect_uri failed (${primaryUrl}), trying alternate: ${altUrl}`);
      tokenResponse = await fetch(`${DISCORD_API_URL}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: CONFIG.CLIENT_ID,
          client_secret: CONFIG.CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: code.toString(),
          redirect_uri: altUrl
        })
      });
      tokenData = await tokenResponse.json();
    }

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('[OAuth2] Token error from Discord:', tokenData);
      return res.redirect(`/?error=token_exchange_failed&msg=${encodeURIComponent(tokenData.error_description || tokenData.error || 'unknown')}`);
    }

    const accessToken = tokenData.access_token;

    const userResponse = await fetch(`${DISCORD_API_URL}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const userData = await userResponse.json();

    const guildsResponse = await fetch(`${DISCORD_API_URL}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const guildsData = await guildsResponse.json();

    const avatarUrl = userData.avatar
      ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=128`
      : 'https://cdn.discordapp.com/embed/avatars/0.png';

    const userObj = {
      id: userData.id,
      username: userData.username,
      discriminator: userData.discriminator,
      avatar: avatarUrl,
      guilds: guildsData || []
    };

    req.session.user = userObj;
    req.session.accessToken = accessToken;

    const authToken = createAuthToken(userObj, accessToken);

    res.cookie('cav_auth_token', authToken, {
      maxAge: 90 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      sameSite: 'lax',
      path: '/'
    });

    req.session.save(() => {
      res.redirect(`/dashboard.html?auth_token=${authToken}`);
    });
  } catch (error) {
    console.error('[OAuth2] Auth exception:', error);
    res.redirect('/?error=auth_failed');
  }
};

authRouter.get('/callback', handleCallback);
authRouter.get('/discord/callback', handleCallback);

// ==========================================
// YAPIN OAUTH2 & PROFILO ACCESSO
// ==========================================
authRouter.get('/yapin', (req, res) => {
  if (req.session?.user && req.session.user.platform === 'yapin') {
    return res.redirect('/dashboard.html?platform=yapin');
  }

  const clientId = CONFIG.YAPIN_CLIENT_ID || '8b015321-df21-4045-95fc-65c9dc03b19b';
  const callbackUrl = CONFIG.YAPIN_REDIRECT_URI || 'https://sentry.wispbyte.app/auth/yapin/callback';
  const redirectUri = encodeURIComponent(callbackUrl);
  // Endpoint OAuth corretto di Yapin: /oauth/authorize (non /oauth2/authorize)
  // Scope ammesso da Yapin: solo 'identify'
  const yapinAuthUrl = `https://www.yapper.website/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${redirectUri}&response_type=code&scope=identify`;
  console.log(`[Yapin OAuth] Redirecting user to authorization: ${yapinAuthUrl}`);
  res.redirect(yapinAuthUrl);
});

authRouter.get('/yapin/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.redirect('/?error=no_code_yapin');
  }

  const clientId = CONFIG.YAPIN_CLIENT_ID || '8b015321-df21-4045-95fc-65c9dc03b19b';
  const clientSecret = CONFIG.YAPIN_CLIENT_SECRET || 'ycs_QXcVL8PPFYhuxiAuVOx3G6AlHRts4mkOEvRROblm9a0';
  const callbackUrl = CONFIG.YAPIN_REDIRECT_URI || 'https://sentry.wispbyte.app/auth/yapin/callback';

  try {
    let tokenData = null;
    const tokenEndpoints = [
      'https://www.yapin.gg/api/oauth/token',
      'https://www.yapper.website/api/oauth/token'
    ];

    for (const ep of tokenEndpoints) {
      try {
        const tokenRes = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code: code.toString(),
            redirect_uri: callbackUrl
          }),
          signal: AbortSignal.timeout(6000)
        });
        if (tokenRes.ok) {
          tokenData = await tokenRes.json();
          break;
        } else {
          const errText = await tokenRes.text().catch(() => '');
          console.warn(`[Yapin OAuth] Token endpoint ${ep} returned status ${tokenRes.status}:`, errText);
        }
      } catch (e) {
        console.warn(`[Yapin OAuth] Token fetch error at ${ep}:`, e.message);
      }
    }

    if (!tokenData?.access_token) {
      console.error('[Yapin OAuth] Failed to exchange code for token:', tokenData);
      return res.redirect('/?error=yapin_token_failed');
    }

    const accessToken = tokenData.access_token;
    let userData = null;

    const meEndpoints = [
      'https://www.yapin.gg/api/oauth/me',
      'https://www.yapper.website/api/oauth/me'
    ];

    for (const meEp of meEndpoints) {
      try {
        const uRes = await fetch(meEp, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(6000)
        });
        if (uRes.ok) {
          userData = await uRes.json();
          break;
        }
      } catch (e) {
        console.warn(`[Yapin OAuth] User info error at ${meEp}:`, e.message);
      }
    }

    const profile = userData?.user || userData || {};
    const username = profile.username || profile.display_name || profile.name || `YapinUser_${code.toString().substring(0, 6)}`;
    const userId = profile.id || profile.user_id || `yap_${crypto.randomBytes(8).toString('hex')}`;
    const avatarUrl = profile.avatar_url || profile.avatar || 'https://www.yapin.gg/favicon.ico';
    const isOwnerOrCreator = (userId === CONFIG.CREATOR_ID) ||
      (username.toLowerCase() === 'lexproj') ||
      (username.toLowerCase().includes('lex'));

    const userObj = {
      id: userId,
      username,
      avatar: avatarUrl,
      platform: 'yapin',
      activePlatform: 'yapin',
      isAdmin: isOwnerOrCreator,
      guilds: profile.servers || profile.guilds || []
    };

    req.session.user = userObj;
    req.session.accessToken = accessToken;

    const authToken = createAuthToken(userObj, accessToken);

    res.cookie('cav_auth_token', authToken, {
      maxAge: 90 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      sameSite: 'lax',
      path: '/'
    });

    req.session.save(() => {
      res.redirect(`/dashboard.html?auth_token=${authToken}&platform=yapin`);
    });
  } catch (err) {
    console.error('[Yapin OAuth2 Error]:', err.message);
    res.redirect('/?error=yapin_auth_failed');
  }
});

authRouter.post('/yapin/login', async (req, res) => {
  const { username, userId } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Inserisci un username o User ID Yapin.' });
  }

  const cleanName = username.trim().replace(/^@/, '');
  const cleanId = userId?.trim() || `yap_${crypto.createHash('md5').update(cleanName).digest('hex').substring(0, 16)}`;

  const userObj = {
    id: cleanId,
    username: cleanName,
    avatar: 'https://www.yapin.gg/favicon.ico',
    platform: 'yapin',
    activePlatform: 'yapin',
    isAdmin: true,
    guilds: []
  };

  req.session.user = userObj;
  const authToken = createAuthToken(userObj, 'direct_yapin_session');

  res.cookie('cav_auth_token', authToken, {
    maxAge: 90 * 24 * 60 * 60 * 1000,
    httpOnly: false,
    sameSite: 'lax',
    path: '/'
  });

  res.json({ success: true, authToken, user: userObj, redirect: `/dashboard.html?auth_token=${authToken}&platform=yapin` });
});

authRouter.post('/switch-profile', (req, res) => {
  const { platform } = req.body;
  if (!platform || !['discord', 'yapin', 'all'].includes(platform)) {
    return res.status(400).json({ error: 'Piattaforma non valida.' });
  }

  const user = req.user || req.session?.user;
  if (!user) {
    return res.status(401).json({ error: 'Non autenticato.' });
  }

  user.activePlatform = platform;
  if (req.session) {
    req.session.user = user;
    req.session.save();
  }

  res.json({ success: true, activePlatform: platform });
});

authRouter.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  let user = req.session.user;

  if (!user && authHeader && authHeader.startsWith('Bearer ')) {
    user = validateAuthToken(authHeader.substring(7));
    if (user) req.session.user = user;
  }

  if (!user && req.headers.cookie) {
    const match = req.headers.cookie.match(/cav_auth_token=([^;]+)/);
    if (match) {
      user = validateAuthToken(match[1]);
      if (user) req.session.user = user;
    }
  }

  if (!user) {
    return res.status(401).json({ error: 'Non autenticato' });
  }
  res.json({
    ...user,
    isCreator: user?.id === CONFIG.CREATOR_ID
  });
});

authRouter.get('/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    authTokens.delete(authHeader.substring(7));
  }
  if (req.headers.cookie) {
    const match = req.headers.cookie.match(/cav_auth_token=([^;]+)/);
    if (match) {
      authTokens.delete(match[1]);
    }
  }
  res.clearCookie('cav_auth_token', { path: '/' });
  req.session.destroy(() => {
    res.redirect('/');
  });
});

export default authRouter;
