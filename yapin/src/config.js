import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  BOT_TOKEN: process.env.YAPIN_BOT_TOKEN || '',
  BOT_ID: process.env.YAPIN_BOT_ID || '',
  API_URL: process.env.YAPIN_API_URL || 'https://api.yapin.gg',
  GATEWAY_URL: process.env.YAPIN_GATEWAY_URL || 'wss://gateway.yapin.gg',
  DEFAULT_PREFIX: process.env.DEFAULT_PREFIX || '!',
  PORT: parseInt(process.env.PORT || '3001', 10),
  DEBUG: process.env.DEBUG === 'true'
};

