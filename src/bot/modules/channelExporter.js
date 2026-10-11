import { ChannelType } from 'discord.js';

export function getChannelTypeName(type) {
  switch (type) {
    case ChannelType.GuildText: return 'Testuale';
    case ChannelType.GuildVoice: return 'Vocale';
    case ChannelType.GuildCategory: return 'Categoria';
    case ChannelType.GuildAnnouncement: return 'Annunci';
    case ChannelType.GuildStageVoice: return 'Stage Vocale';
    case ChannelType.GuildForum: return 'Forum';
    case ChannelType.GuildMedia: return 'Media';
    case ChannelType.PublicThread: return 'Thread Pubblico';
    case ChannelType.PrivateThread: return 'Thread Privato';
    case ChannelType.AnnouncementThread: return 'Thread Annunci';
    default: return 'Altro';
  }
}

/**
 * Generates a clean CSV containing all channels and categories of a guild.
 * @param {import('discord.js').Guild} guild
 * @returns {string} CSV content with UTF-8 BOM
 */
export function exportChannelsToCSV(guild) {
  if (!guild || !guild.channels) return '';

  const channels = Array.from(guild.channels.cache.values());

  // Build category name lookup
  const categoryMap = new Map();
  channels.forEach(ch => {
    if (ch.type === ChannelType.GuildCategory) {
      categoryMap.set(ch.id, ch.name);
    }
  });

  // Sort channels logically by category position then channel position
  channels.sort((a, b) => {
    const isCatA = a.type === ChannelType.GuildCategory;
    const isCatB = b.type === ChannelType.GuildCategory;

    const parentA = a.parentId ? guild.channels.cache.get(a.parentId) : null;
    const parentB = b.parentId ? guild.channels.cache.get(b.parentId) : null;

    const parentPosA = isCatA ? a.rawPosition : (parentA ? parentA.rawPosition : -1);
    const parentPosB = isCatB ? b.rawPosition : (parentB ? parentB.rawPosition : -1);

    if (parentPosA !== parentPosB) return parentPosA - parentPosB;
    if (isCatA && !isCatB) return -1;
    if (!isCatA && isCatB) return 1;
    return a.rawPosition - b.rawPosition;
  });

  const headers = [
    '"ID Canale"',
    '"Nome Canale"',
    '"Tipo"',
    '"Nome Categoria"',
    '"ID Categoria"',
    '"Posizione"',
    '"Descrizione / Topic"'
  ];

  // Semicolon separator is the standard European/Italian Excel CSV format
  const rows = [headers.join(';')];

  for (const ch of channels) {
    const typeName = getChannelTypeName(ch.type);
    const parentName = ch.parentId
      ? (categoryMap.get(ch.parentId) || '')
      : (ch.type === ChannelType.GuildCategory ? '[È Categoria]' : '[Nessuna Categoria]');
    const name = (ch.name || '').replace(/"/g, '""');
    const catName = parentName.replace(/"/g, '""');
    const topic = (ch.topic || '').replace(/"/g, '""').replace(/\r?\n/g, ' ');

    rows.push([
      `"${ch.id}"`,
      `"${name}"`,
      `"${typeName}"`,
      `"${catName}"`,
      `"${ch.parentId || ''}"`,
      `"${ch.rawPosition}"`,
      `"${topic}"`
    ].join(';'));
  }

  // Prepend UTF-8 BOM so Excel opens with perfect emoji & accented characters
  return '\uFEFF' + rows.join('\r\n');
}

export default exportChannelsToCSV;
