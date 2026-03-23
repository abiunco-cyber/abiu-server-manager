require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const { Connectors, Shoukaku } = require('shoukaku');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const LAVALINK_HOST = process.env.LAVALINK_HOST || '127.0.0.1';
const LAVALINK_PORT = Number(process.env.LAVALINK_PORT || 2333);
const LAVALINK_PASSWORD = process.env.LAVALINK_PASSWORD || 'youshallnotpass';

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Missing TOKEN, CLIENT_ID or GUILD_ID in .env');
  process.exit(1);
}

// ======================================================
// CONFIG
// ======================================================
const CONFIG = {
  guildId: GUILD_ID,

  verify: {
    memberRoleId: '1462534294378512496',
    verifyInfoChannelId: '1462537911013478655',
    rulesChannelId: '1461730433640435838'
  },

  welcome: {
    publicChannelId: '1461830069491208233'
  },

  counting: {
    channelId: '1484932687402897428',
    stateFile: path.join(__dirname, 'counting-state.json'),
    warningWindowMs: 60 * 1000,
    maxBadMessagesInWindow: 5,
    timeoutMinutes: 60
  },

  tickets: {
    panelChannelId: null,
    transcriptChannelId: '1484830464089784401',
    categories: {
      general: {
        label: 'General Questions',
        categoryId: '1483880242207658194',
        staffRoleId: '1483880227905077378',
        emoji: '❓'
      },
      unban: {
        label: 'Unban Request',
        categoryId: '1483880243520475180',
        staffRoleId: '1483880229003858151',
        emoji: '🔓'
      },
      bug: {
        label: 'Bug Support',
        categoryId: '1483880245848441042',
        staffRoleId: '1483880229880463360',
        emoji: '🐞'
      },
      report: {
        label: 'Player Report',
        categoryId: '1483880247169515680',
        staffRoleId: '1483880232053243927',
        emoji: '🚨'
      },
      other: {
        label: 'Other',
        categoryId: '1483879511161307246',
        staffRoleId: '1483880227905077378',
        emoji: '📁'
      }
    }
  },

  reactionRoles: {
    panels: {
      ranks: {
        title: 'Get your ranks',
        color: 0xf08cff,
        items: [
          { roleName: 'Bronze', emojiName: 'bronze' },
          { roleName: 'Silver', emojiName: 'silver' },
          { roleName: 'Gold', emojiName: 'gold' },
          { roleName: 'Platinum', emojiName: 'platinum' },
          { roleName: 'Diamond', emojiName: 'diamond' },
          { roleName: 'Champion', emojiName: 'champion' },
          { roleName: 'Grand Champion', emojiName: 'gc' },
          { roleName: 'SuperSonic Legend', emojiName: 'ssl' }
        ]
      },

      platform: {
        title: 'What device do you play on?',
        color: 0xf08cff,
        items: [
          { roleName: 'phone', emojiName: 'phone' },
          { roleName: 'pc', emojiName: 'pc' },
          { roleName: 'xbox', emojiName: 'xbox' },
          { roleName: 'playstation', emojiName: 'ps' }
        ]
      },

      gender: {
        title: 'What is your gender?',
        color: 0xf08cff,
        items: [
          { roleId: '1462555108020850874', emoji: '👨' },
          { roleId: '1462555140165865538', emoji: '👩' }
        ]
      },

      color: {
        title: 'What is your favorite color?',
        color: 0xf08cff,
        items: [
          { roleName: '💙・Blue', emoji: '💙' },
          { roleName: '💚・Green', emoji: '💚' },
          { roleName: '💛・Yellow', emoji: '💛' },
          { roleName: '🧡・Orange', emoji: '🧡' },
          { roleName: '💜・Purple', emoji: '💜' },
          { roleName: '🩷・Pink', emoji: '🩷' },
          { roleName: '❤️・Red', emoji: '❤️' }
        ]
      },

      games: {
        title: 'What games do you play?',
        color: 0xf08cff,
        items: [
          { roleName: '🚗・Rocket League', emoji: '🚗' },
          { roleName: '🩸・7 days to die', emoji: '🩸' },
          { roleName: '⚽・FC 26', emoji: '⚽' },
          { roleName: '🔪・Dead by Daylight', emoji: '🔪' },
          { roleName: '🔫・Call Of Duty', emoji: '🔫' },
          { roleName: '🧟・Project Zomboid', emoji: '🧟' }
        ]
      }
    }
  }
};

// ======================================================
// STORAGE
// ======================================================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const REACTION_PANELS_FILE = path.join(DATA_DIR, 'reaction-panels.json');

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let ticketStore = readJson(TICKETS_FILE, {});
let reactionPanelStore = readJson(REACTION_PANELS_FILE, {});

// counting state
function loadCountingState() {
  return readJson(CONFIG.counting.stateFile, {
    current: 1,
    lastUserId: null,
    record: 0,
    introSent: false,
    userStrikes: {}
  });
}

function saveCountingState(state) {
  writeJson(CONFIG.counting.stateFile, state);
}

let countingState = loadCountingState();

// ======================================================
// CLIENT
// ======================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

// ======================================================
// LAVALINK
// ======================================================
const nodes = [
  {
    name: 'local',
    url: `${LAVALINK_HOST}:${LAVALINK_PORT}`,
    auth: LAVALINK_PASSWORD
  }
];

const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes, {
  moveOnDisconnect: false,
  resume: false,
  reconnectTries: 5,
  restTimeout: 10000
});

shoukaku.on('ready', (name) => {
  console.log(`✅ Lavalink node ready: ${name}`);
});

shoukaku.on('error', (name, error) => {
  console.error(`❌ Lavalink node error (${name}):`, error);
});

shoukaku.on('close', (name, code, reason) => {
  console.log(`⚠️ Lavalink node closed (${name}): ${code} ${reason}`);
});

// ======================================================
// MUSIC STATE
// ======================================================
const musicStates = new Map();

function getMusicState(guildId) {
  if (!musicStates.has(guildId)) {
    musicStates.set(guildId, {
      player: null,
      current: null,
      queue: [],
      volume: 100,
      paused: false,
      textChannelId: null
    });
  }

  return musicStates.get(guildId);
}

function resetMusicState(state) {
  state.current = null;
  state.queue = [];
  state.paused = false;
  state.textChannelId = null;
}

async function getLavalinkNode() {
  const node = shoukaku.nodes.values().next().value;
  if (!node) throw new Error("Can't find any nodes to connect on.");
  return node;
}

async function resolveLavalinkTrack(query) {
  const node = await getLavalinkNode();

  let search = query;
  if (!/^https?:\/\//i.test(query)) {
    search = `ytsearch:${query}`;
  }

  const result = await node.rest.resolve(search);

  if (!result || !result.data) {
    throw new Error('No results found for that song.');
  }

  if (result.loadType === 'track') {
    return [result.data];
  }

  if (result.loadType === 'search') {
    return result.data;
  }

  if (result.loadType === 'playlist') {
    return result.data.tracks;
  }

  return [];
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return 'Unknown';

  const totalSeconds = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${mins}:${String(secs).padStart(2, '0')}`;
}

async function ensurePlayer(interactionOrMember, state) {
  const guild = interactionOrMember.guild;
  const member = interactionOrMember.member || interactionOrMember;

  const voiceChannel = member.voice?.channel;
  if (!voiceChannel) {
    throw new Error('You need to be in a voice channel first.');
  }

  if (voiceChannel.type !== ChannelType.GuildVoice) {
    throw new Error('Please join a normal voice channel.');
  }

  const me = guild.members.me;
  const perms = voiceChannel.permissionsFor(me);

  if (!perms?.has(PermissionsBitField.Flags.Connect)) {
    throw new Error('I do not have permission to join your voice channel.');
  }

  if (!perms?.has(PermissionsBitField.Flags.Speak)) {
    throw new Error('I do not have permission to speak in your voice channel.');
  }

  if (!state.player) {
    state.player = await shoukaku.joinVoiceChannel({
      guildId: guild.id,
      channelId: voiceChannel.id,
      shardId: 0,
      deaf: true
    });

    state.player.on('end', async () => {
      await playNext(guild.id).catch(console.error);
    });

    state.player.on('closed', (data) => {
      console.log('⚠️ Music player closed:', data);
    });

    state.player.on('exception', (data) => {
      console.error('❌ Music player exception:', data);
    });

    state.player.on('stuck', (data) => {
      console.error('❌ Music player stuck:', data);
    });
} else {
  const currentChannelId = state.player.channelId || state.player.voiceChannelId;

  if (currentChannelId !== voiceChannel.id) {
    await shoukaku.leaveVoiceChannel(guild.id).catch(() => null);

    state.player = await shoukaku.joinVoiceChannel({
      guildId: guild.id,
      channelId: voiceChannel.id,
      shardId: 0,
      deaf: true
    });

    state.player.on('end', async () => {
      await playNext(guild.id).catch(console.error);
    });

    state.player.on('closed', (data) => {
      console.log('⚠️ Music player closed:', data);
    });

    state.player.on('exception', (data) => {
      console.error('❌ Music player exception:', data);
    });

    state.player.on('stuck', (data) => {
      console.error('❌ Music player stuck:', data);
    });
  }
}

  return state.player;
}

async function playTrack(guildId, track) {
  const state = getMusicState(guildId);
  if (!state.player) throw new Error('Music player is not connected.');

  state.current = track;
  state.paused = false;

await state.player.playTrack({
  track: {
    encoded: track.encoded
  }
});
  await state.player.setGlobalVolume(state.volume).catch(() => null);

  if (state.textChannelId) {
    const channel = await client.channels.fetch(state.textChannelId).catch(() => null);
    if (channel && channel.type === ChannelType.GuildText) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('Now Playing')
        .setDescription(`[${track.info.title}](${track.info.uri || track.info.url || 'https://youtube.com'})`)
        .addFields(
          { name: 'Author', value: track.info.author || 'Unknown', inline: true },
          { name: 'Duration', value: formatDuration(track.info.length), inline: true },
          { name: 'Requested By', value: track.requestedByMention || 'Unknown', inline: true }
        );

      if (track.info.artworkUrl) {
        embed.setThumbnail(track.info.artworkUrl);
      }

      await channel.send({ embeds: [embed] }).catch(() => null);
    }
  }
}

async function playNext(guildId) {
  const state = getMusicState(guildId);

  if (!state.queue.length) {
    state.current = null;
    state.paused = false;
    return;
  }

  const next = state.queue.shift();
  await playTrack(guildId, next);
}

async function stopAndDisconnect(guildId) {
  const state = getMusicState(guildId);

  if (state.player) {
    await state.player.stopTrack().catch(() => null);
await shoukaku.leaveVoiceChannel(guildId).catch(() => null);
    state.player = null;
  }

  resetMusicState(state);
}

// ======================================================
// HELPERS
// ======================================================
function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function getTicketByChannelId(channelId) {
  return Object.values(ticketStore).find((t) => t.channelId === channelId) || null;
}

function sanitizeChannelName(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

function getEmojiString(guild, panelItem) {
  if (panelItem.emoji) return panelItem.emoji;

  if (panelItem.emojiName) {
    const found = guild.emojis.cache.find((e) => e.name === panelItem.emojiName);
    if (found) {
      return found.animated
        ? `<a:${found.name}:${found.id}>`
        : `<:${found.name}:${found.id}>`;
    }
  }

  return '•';
}

function getEmojiIdentifier(guild, panelItem) {
  if (panelItem.emoji) return panelItem.emoji;

  if (panelItem.emojiName) {
    const found = guild.emojis.cache.find((e) => e.name === panelItem.emojiName);
    if (found) return `${found.name}:${found.id}`;
  }

  return null;
}

function findRoleByConfig(guild, item) {
  if (item.roleId) return guild.roles.cache.get(item.roleId) || null;

  if (item.roleName) {
    const exact = guild.roles.cache.find((r) => r.name === item.roleName);
    if (exact) return exact;

    const lowered = item.roleName.toLowerCase();
    return guild.roles.cache.find((r) => r.name.toLowerCase() === lowered) || null;
  }

  return null;
}

function makeEphemeral(content) {
  return { content, flags: MessageFlags.Ephemeral };
}

function buildVerifyEmbed() {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('Account Verification - Abiu & Co.')
    .setDescription(
      'To gain access to the server, please verify your account by clicking the button below. This helps us keep the community safe and secure.'
    );
}

function buildVerifyRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_member')
      .setLabel('Verify Account')
      .setStyle(ButtonStyle.Success)
  );
}

function buildTicketPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('Ticket System')
    .setDescription(
      'Do you need help with the server, plugins, or gameplay issues? You can quickly open a support ticket right here! Just click the button below and provide the necessary details.\n\nBe sure to include as much information as possible, such as error messages, screenshots, or steps to reproduce the problem. This helps our staff resolve your ticket faster.\n\nOur team aims to respond as quickly as possible. Tagging staff members won’t make your ticket get faster attention, so please be patient. Once your ticket is submitted, a staff member will review it and get back to you as soon as they can.'
    );
}

function buildTicketPanelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_open_general').setLabel('General Questions').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_open_unban').setLabel('Unban Request').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_open_bug').setLabel('Bug Support').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_open_report').setLabel('Player Report').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_open_other').setLabel('Other').setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildTicketControls(ticket) {
  const claimLabel = ticket.claimedBy ? 'Claimed' : 'Claim Ticket';
  const claimStyle = ticket.claimedBy ? ButtonStyle.Danger : ButtonStyle.Success;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel(claimLabel)
      .setStyle(claimStyle),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
  );
}

async function createTranscript(channel) {
  const messages = [];
  let before;

  while (true) {
    const fetched = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!fetched || fetched.size === 0) break;
    messages.push(...fetched.values());
    before = fetched.last().id;
    if (fetched.size < 100) break;
  }

  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  let text = `Transcript for #${channel.name}\n\n`;
  for (const msg of messages) {
    const timestamp = new Date(msg.createdTimestamp).toISOString();
    text += `[${timestamp}] ${msg.author.tag}: ${msg.content || '[no text]'}\n`;
  }

  const filePath = path.join(DATA_DIR, `transcript-${channel.id}.txt`);
  fs.writeFileSync(filePath, text, 'utf8');
  return filePath;
}

function buildTranscriptEmbed(ticket, closerId) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Ticket Transcript Saved')
    .addFields(
      { name: 'Ticket Type', value: ticket.typeLabel, inline: true },
      { name: 'Creator', value: `<@${ticket.userId}>`, inline: true },
      { name: 'Closed By', value: `<@${closerId}>`, inline: true }
    )
    .setTimestamp();
}

async function sendCountingIntroIfNeeded() {
  if (countingState.introSent) return;

  const channel = await client.channels.fetch(CONFIG.counting.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const embed = new EmbedBuilder()
    .setColor(0xff4da6)
    .setTitle('Welcome')
    .setDescription(
      'There are four simple rules:\n1) No skipping numbers\n2) No going back in numbers\n3) One person can’t count two or more numbers in a row\n4) No botting or scripting\n\nIf you need help my help command is /help.'
    );

  await channel.send({ embeds: [embed] }).catch(() => null);
  countingState.introSent = true;
  saveCountingState(countingState);
}

function registerBadCounting(userId) {
  if (!countingState.userStrikes[userId]) countingState.userStrikes[userId] = [];

  const now = Date.now();
  countingState.userStrikes[userId].push(now);
  countingState.userStrikes[userId] = countingState.userStrikes[userId].filter(
    (ts) => now - ts <= CONFIG.counting.warningWindowMs
  );

  saveCountingState(countingState);
  return countingState.userStrikes[userId].length;
}

async function timeoutCountingUser(member) {
  const channel = member.guild.channels.cache.get(CONFIG.counting.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  await channel.permissionOverwrites.edit(member.id, {
    ViewChannel: false
  }).catch(() => null);

  setTimeout(async () => {
    await channel.permissionOverwrites.delete(member.id).catch(() => null);
  }, CONFIG.counting.timeoutMinutes * 60 * 1000);
}

function cleanRoleLabel(roleName) {
  return roleName.replace(/^[^\s]+・/, '');
}

function buildReactionPanelDescription(guild, panel) {
  return panel.items
    .map((item) => {
      const emojiText = getEmojiString(guild, item);

      if (item.roleName) {
        return `${cleanRoleLabel(item.roleName)} = ${emojiText}`;
      }

      if (item.roleId) {
        const role = guild.roles.cache.get(item.roleId);
        return `${role ? cleanRoleLabel(role.name) : 'Unknown Role'} = ${emojiText}`;
      }

      return `Unknown = ${emojiText}`;
    })
    .join('\n');
}

// ======================================================
// READY
// ======================================================
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} is online`);

  await sendCountingIntroIfNeeded();

  const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Replies with pong'),

    new SlashCommandBuilder()
      .setName('rmc')
      .setDescription('Remove messages')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addSubcommand((sub) =>
        sub
          .setName('all')
          .setDescription('Delete all messages you can bulk delete in this channel')
      )
      .addSubcommand((sub) =>
        sub
          .setName('amount')
          .setDescription('Delete a specific amount of messages')
          .addIntegerOption((opt) =>
            opt
              .setName('amount')
              .setDescription('How many messages to delete')
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(100)
          )
      ),

    new SlashCommandBuilder()
      .setName('sendverifypanel')
      .setDescription('Send the verify panel')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('sendticketpanel')
      .setDescription('Send the ticket panel')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('sendreactionpanel')
      .setDescription('Send one reaction role panel')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption((opt) =>
        opt
          .setName('panel')
          .setDescription('Panel key')
          .setRequired(true)
          .addChoices(
            { name: 'ranks', value: 'ranks' },
            { name: 'platform', value: 'platform' },
            { name: 'gender', value: 'gender' },
            { name: 'color', value: 'color' },
            { name: 'games', value: 'games' }
          )
      ),

    new SlashCommandBuilder()
      .setName('adduser')
      .setDescription('Add a user to this ticket')
      .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true)),

    new SlashCommandBuilder()
      .setName('removeuser')
      .setDescription('Remove a user from this ticket')
      .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true)),

    new SlashCommandBuilder()
      .setName('renameticket')
      .setDescription('Rename this ticket')
      .addStringOption((opt) =>
        opt.setName('name').setDescription('New ticket name').setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('play')
      .setDescription('Play a song or add it to the queue')
      .addStringOption((opt) =>
        opt.setName('query').setDescription('Song name, YouTube link, or Spotify link').setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('skip')
      .setDescription('Skip the current song'),

    new SlashCommandBuilder()
      .setName('pause')
      .setDescription('Pause the current song'),

    new SlashCommandBuilder()
      .setName('resume')
      .setDescription('Resume the current song'),

    new SlashCommandBuilder()
      .setName('stop')
      .setDescription('Stop music and clear the queue'),

    new SlashCommandBuilder()
      .setName('queue')
      .setDescription('Show the music queue'),

    new SlashCommandBuilder()
      .setName('leave')
      .setDescription('Disconnect the bot from voice')
  ].map((cmd) => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log('✅ Slash commands registered');
});

// ======================================================
// MEMBER JOIN
// ======================================================
client.on('guildMemberAdd', async (member) => {
  try {
    const verifyChannel = `<#${CONFIG.verify.verifyInfoChannelId}>`;
    const rulesChannel = `<#${CONFIG.verify.rulesChannelId}>`;

    const dmEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`Welcome to ${member.guild.name}`)
      .setDescription(
        `Welcome to the Discord server.\n\nPlease head to ${verifyChannel} to verify and check ${rulesChannel} for the rules.`
      );

    await member.send({ embeds: [dmEmbed] }).catch(() => null);

    const publicChannel = await client.channels.fetch(CONFIG.welcome.publicChannelId).catch(() => null);
    if (publicChannel && publicChannel.type === ChannelType.GuildText) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`Welcome to the server ${member.user.username}`)
        .setImage(member.displayAvatarURL({ size: 512 }))
        .setTimestamp();

      await publicChannel.send({ embeds: [embed] }).catch(() => null);
    }
  } catch (err) {
    console.error('guildMemberAdd error:', err);
  }
});

// ======================================================
// INTERACTIONS
// ======================================================
client.on('interactionCreate', async (interaction) => {
  const disabledMusic = ['play', 'skip', 'stop', 'queue', 'pause', 'resume'];

if (interaction.isChatInputCommand() && disabledMusic.includes(interaction.commandName)) {
  return interaction.reply({
    content: '❌ Music systeem is tijdelijk uitgeschakeld.',
    ephemeral: true
  });
}
  try {
    if (interaction.isChatInputCommand()) {
      if (!interaction.guild || !interaction.member) return;

      if (interaction.commandName === 'ping') {
        await interaction.reply('pong');
        return;
      }

      if (interaction.commandName === 'rmc') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          await interaction.reply(makeEphemeral('❌ You do not have permission to use this command.'));
          return;
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'amount') {
          const amount = interaction.options.getInteger('amount', true);
          const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
          await interaction.reply(
            makeEphemeral(
              deleted ? `✅ Deleted ${deleted.size} messages.` : '❌ Could not delete messages.'
            )
          );
          return;
        }

        if (sub === 'all') {
          let total = 0;

          while (true) {
            const fetched = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
            if (!fetched || fetched.size === 0) break;

            const deletable = fetched.filter(
              (m) => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
            );
            if (deletable.size === 0) break;

            const deleted = await interaction.channel.bulkDelete(deletable, true).catch(() => null);
            if (!deleted) break;
            total += deleted.size;
            if (deleted.size < 2) break;
          }

          await interaction.reply(makeEphemeral(`✅ Deleted ${total} messages.`));
          return;
        }
      }

      if (interaction.commandName === 'sendverifypanel') {
        if (!isAdmin(interaction.member)) {
          await interaction.reply(makeEphemeral('❌ Admin only.'));
          return;
        }

        await interaction.channel.send({
          embeds: [buildVerifyEmbed()],
          components: [buildVerifyRow()]
        });

        await interaction.reply(makeEphemeral('✅ Verify panel sent.'));
        return;
      }

      if (interaction.commandName === 'sendticketpanel') {
        if (!isAdmin(interaction.member)) {
          await interaction.reply(makeEphemeral('❌ Admin only.'));
          return;
        }

        await interaction.channel.send({
          embeds: [buildTicketPanelEmbed()],
          components: buildTicketPanelRows()
        });

        await interaction.reply(makeEphemeral('✅ Ticket panel sent.'));
        return;
      }

      if (interaction.commandName === 'sendreactionpanel') {
        if (!isAdmin(interaction.member)) {
          await interaction.reply(makeEphemeral('❌ Admin only.'));
          return;
        }

        const panelKey = interaction.options.getString('panel', true);
        const panel = CONFIG.reactionRoles.panels[panelKey];

        if (!panel) {
          await interaction.reply(makeEphemeral('❌ Panel not found.'));
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(panel.color)
          .setTitle(panel.title)
          .setDescription(buildReactionPanelDescription(interaction.guild, panel));

        const sent = await interaction.channel.send({ embeds: [embed] });

        reactionPanelStore[sent.id] = {
          panelKey,
          channelId: interaction.channel.id,
          guildId: interaction.guild.id
        };
        writeJson(REACTION_PANELS_FILE, reactionPanelStore);

        for (const item of panel.items) {
          const emojiIdentifier = getEmojiIdentifier(interaction.guild, item);
          if (!emojiIdentifier) {
            console.log(`❌ Emoji not found for reaction panel: ${item.emojiName || item.emoji}`);
            continue;
          }

          const role = findRoleByConfig(interaction.guild, item);
          if (!role) {
            console.log(`❌ Role not found for reaction panel: ${item.roleName || item.roleId}`);
            continue;
          }

          await sent.react(emojiIdentifier).catch(() => null);
        }

        await interaction.reply(makeEphemeral(`✅ Reaction panel "${panelKey}" sent.`));
        return;
      }

      if (interaction.commandName === 'adduser') {
        const ticket = getTicketByChannelId(interaction.channel.id);
        if (!ticket) {
          await interaction.reply(makeEphemeral('❌ This is not a ticket channel.'));
          return;
        }

        if (!interaction.member.roles.cache.has(ticket.staffRoleId)) {
          await interaction.reply(makeEphemeral('❌ Staff only.'));
          return;
        }

        const user = interaction.options.getUser('user', true);
        await interaction.channel.permissionOverwrites.edit(user.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        });

        await interaction.reply(`✅ Added ${user} to this ticket.`);
        return;
      }

      if (interaction.commandName === 'removeuser') {
        const ticket = getTicketByChannelId(interaction.channel.id);
        if (!ticket) {
          await interaction.reply(makeEphemeral('❌ This is not a ticket channel.'));
          return;
        }

        if (!interaction.member.roles.cache.has(ticket.staffRoleId)) {
          await interaction.reply(makeEphemeral('❌ Staff only.'));
          return;
        }

        const user = interaction.options.getUser('user', true);
        await interaction.channel.permissionOverwrites.delete(user.id).catch(() => null);
        await interaction.reply(`✅ Removed ${user} from this ticket.`);
        return;
      }

      if (interaction.commandName === 'renameticket') {
        const ticket = getTicketByChannelId(interaction.channel.id);
        if (!ticket) {
          await interaction.reply(makeEphemeral('❌ This is not a ticket channel.'));
          return;
        }

        if (!interaction.member.roles.cache.has(ticket.staffRoleId)) {
          await interaction.reply(makeEphemeral('❌ Staff only.'));
          return;
        }

        const newName = sanitizeChannelName(interaction.options.getString('name', true));
        await interaction.channel.setName(newName).catch(() => null);
        await interaction.reply(`✅ Ticket renamed to \`${newName}\`.`);
        return;
      }

      // ==========================
      // MUSIC COMMANDS
      // ==========================
      if (interaction.commandName === 'play') {
        const query = interaction.options.getString('query', true);
        const state = getMusicState(interaction.guild.id);

        await interaction.deferReply();

        try {
          await ensurePlayer(interaction, state);
          state.textChannelId = interaction.channel.id;

          const tracks = await resolveLavalinkTrack(query);
          if (!tracks.length) {
            await interaction.editReply('❌ No playable result was found.');
            return;
          }

          if (/spotify\.com\/playlist/i.test(query) || /spotify\.com\/album/i.test(query)) {
            for (const track of tracks) {
              track.requestedByMention = `<@${interaction.user.id}>`;
              state.queue.push(track);
            }

            if (!state.current) {
              await playNext(interaction.guild.id);
              await interaction.editReply(`✅ Added ${tracks.length} tracks and started playback.`);
            } else {
              await interaction.editReply(`✅ Added ${tracks.length} tracks to the queue.`);
            }
            return;
          }

          const track = tracks[0];
          track.requestedByMention = `<@${interaction.user.id}>`;

          if (!state.current) {
            await playTrack(interaction.guild.id, track);
            await interaction.editReply(`✅ Now playing: **${track.info.title}**`);
          } else {
            state.queue.push(track);
            await interaction.editReply(`✅ Added to queue: **${track.info.title}**`);
          }

          return;
        } catch (error) {
          console.error('Play command error:', error);
          await interaction.editReply(`❌ ${error.message || 'Failed to play that track.'}`);
          return;
        }
      }

      if (interaction.commandName === 'skip') {
        const state = getMusicState(interaction.guild.id);

        if (!state.player || !state.current) {
          await interaction.reply(makeEphemeral('❌ Nothing is currently playing.'));
          return;
        }

        await state.player.stopTrack().catch(() => null);
        await interaction.reply(makeEphemeral('✅ Skipped the current song.'));
        return;
      }

      if (interaction.commandName === 'pause') {
        const state = getMusicState(interaction.guild.id);

        if (!state.player || !state.current) {
          await interaction.reply(makeEphemeral('❌ Nothing is currently playing.'));
          return;
        }

        await state.player.setPaused(true).catch(() => null);
        state.paused = true;
        await interaction.reply(makeEphemeral('⏸️ Music paused.'));
        return;
      }

      if (interaction.commandName === 'resume') {
        const state = getMusicState(interaction.guild.id);

        if (!state.player || !state.current) {
          await interaction.reply(makeEphemeral('❌ Nothing is currently playing.'));
          return;
        }

        await state.player.setPaused(false).catch(() => null);
        state.paused = false;
        await interaction.reply(makeEphemeral('▶️ Music resumed.'));
        return;
      }

      if (interaction.commandName === 'stop') {
        await stopAndDisconnect(interaction.guild.id);
        await interaction.reply(makeEphemeral('⏹️ Stopped music, cleared queue, and disconnected.'));
        return;
      }

      if (interaction.commandName === 'queue') {
        const state = getMusicState(interaction.guild.id);

        if (!state.current && state.queue.length === 0) {
          await interaction.reply(makeEphemeral('❌ The music queue is empty.'));
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('Music Queue');

        if (state.current) {
          embed.addFields({
            name: 'Now Playing',
            value: `**${state.current.info.title}**\n${formatDuration(state.current.info.length)}`,
            inline: false
          });
        }

        if (state.queue.length) {
          embed.addFields({
            name: 'Up Next',
            value: state.queue
              .slice(0, 10)
              .map((track, index) => `${index + 1}. ${track.info.title}`)
              .join('\n'),
            inline: false
          });
        }

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.commandName === 'leave') {
        await stopAndDisconnect(interaction.guild.id);
        await interaction.reply(makeEphemeral('👋 Disconnected from the voice channel.'));
        return;
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'verify_member') {
        const role = interaction.guild.roles.cache.get(CONFIG.verify.memberRoleId);

        if (!role) {
          await interaction.reply(makeEphemeral('❌ Verify role not found. Check memberRoleId in index.js.'));
          return;
        }

        const me = interaction.guild.members.me;
        if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
          await interaction.reply(makeEphemeral('❌ Bot is missing Manage Roles permission.'));
          return;
        }

        if (me.roles.highest.position <= role.position) {
          await interaction.reply(makeEphemeral('❌ Bot role must be above the verify role in the role list.'));
          return;
        }

        if (interaction.member.roles.cache.has(role.id)) {
          await interaction.reply(makeEphemeral('✅ You are already verified.'));
          return;
        }

        try {
          await interaction.member.roles.add(role);
          await interaction.reply(makeEphemeral('✅ You have been verified and received the member role.'));
        } catch (error) {
          console.error('Verify error:', error);
          await interaction.reply(makeEphemeral('❌ Failed to give verify role. Check role hierarchy and permissions.'));
        }

        return;
      }

      if (interaction.customId.startsWith('ticket_open_')) {
        const key = interaction.customId.replace('ticket_open_', '');
        const info = CONFIG.tickets.categories[key];

        if (!info) {
          await interaction.reply(makeEphemeral('❌ Invalid ticket type.'));
          return;
        }

        const existing = Object.values(ticketStore).find(
          (t) => t.userId === interaction.user.id && t.type === key && t.open
        );

        if (existing) {
          await interaction.reply(
            makeEphemeral(`❌ You already have an open ${info.label} ticket: <#${existing.channelId}>`)
          );
          return;
        }

        const channelName = sanitizeChannelName(`${key}-${interaction.user.username}`);
        const channel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: info.categoryId,
          permissionOverwrites: [
            {
              id: interaction.guild.roles.everyone.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks
              ]
            },
            {
              id: info.staffRoleId,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageMessages,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks
              ]
            }
          ]
        });

        const ticketId = channel.id;
        ticketStore[ticketId] = {
          id: ticketId,
          channelId: channel.id,
          userId: interaction.user.id,
          staffRoleId: info.staffRoleId,
          type: key,
          typeLabel: info.label,
          open: true,
          claimedBy: null,
          createdAt: Date.now()
        };
        writeJson(TICKETS_FILE, ticketStore);

        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle(`${info.emoji} ${info.label}`)
          .setDescription(
            `Hello <@${interaction.user.id}>, please explain your issue as clearly as possible.\n\nA staff member will help you soon.`
          )
          .addFields(
            { name: 'Ticket Creator', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Staff Role', value: `<@&${info.staffRoleId}>`, inline: true }
          )
          .setTimestamp();

        await channel.send({
          content: `<@&${info.staffRoleId}> <@${interaction.user.id}>`,
          embeds: [embed],
          components: [buildTicketControls(ticketStore[ticketId])]
        });

        await interaction.reply(makeEphemeral(`✅ Your ticket has been created: ${channel}`));
        return;
      }

      if (interaction.customId === 'ticket_claim' || interaction.customId === 'ticket_close') {
        const ticket = getTicketByChannelId(interaction.channel.id);

        if (!ticket) {
          await interaction.reply(makeEphemeral('❌ This is not a ticket channel.'));
          return;
        }

        if (!interaction.member.roles.cache.has(ticket.staffRoleId)) {
          await interaction.reply(makeEphemeral('❌ Only the correct staff role can use this button.'));
          return;
        }

        if (interaction.customId === 'ticket_claim') {
          ticket.claimedBy = interaction.user.id;
          writeJson(TICKETS_FILE, ticketStore);

          const rows = [buildTicketControls(ticket)];
          await interaction.message.edit({ components: rows }).catch(() => null);
          await interaction.reply(makeEphemeral(`✅ Ticket claimed by <@${interaction.user.id}>.`));
          return;
        }

        if (interaction.customId === 'ticket_close') {
          ticket.open = false;
          writeJson(TICKETS_FILE, ticketStore);

          const transcriptPath = await createTranscript(interaction.channel);
          const transcriptEmbed = buildTranscriptEmbed(ticket, interaction.user.id);

          const transcriptChannel = await client.channels.fetch(CONFIG.tickets.transcriptChannelId).catch(() => null);
          if (transcriptChannel && transcriptChannel.type === ChannelType.GuildText) {
            await transcriptChannel.send({
              embeds: [transcriptEmbed],
              files: [transcriptPath]
            }).catch(() => null);
          }

          const user = await client.users.fetch(ticket.userId).catch(() => null);
          if (user) {
            await user.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x5865f2)
                  .setTitle('Your ticket was closed')
                  .setDescription(`Your **${ticket.typeLabel}** ticket has been closed.`)
                  .setTimestamp()
              ],
              files: [transcriptPath]
            }).catch(() => null);
          }

          await interaction.reply('✅ Closing ticket in 3 seconds...');
          setTimeout(async () => {
            await interaction.channel.delete().catch(() => null);
          }, 3000);

          return;
        }
      }
    }
  } catch (err) {
    console.error('interactionCreate error:', err);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(makeEphemeral('❌ Something went wrong.')).catch(() => null);
      } else {
        await interaction.reply(makeEphemeral('❌ Something went wrong.')).catch(() => null);
      }
    } catch {}
  }
});

// ======================================================
// COUNTING
// ======================================================
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    if (message.channel.id === CONFIG.counting.channelId) {
      const content = message.content.trim();

      if (!/^\d+$/.test(content)) {
        await message.delete().catch(() => null);
        const badCount = registerBadCounting(message.author.id);

        if (badCount >= CONFIG.counting.maxBadMessagesInWindow) {
          const member = await message.guild.members.fetch(message.author.id).catch(() => null);
          if (member) {
            await timeoutCountingUser(member);
            await message.channel.send(
              `🚫 ${message.author} lost access to the counting channel for ${CONFIG.counting.timeoutMinutes} minutes for repeatedly messing up the count.`
            ).catch(() => null);
          }
        }
        return;
      }

      const number = Number(content);

      if (message.author.id === countingState.lastUserId || number !== countingState.current) {
        await message.react('❌').catch(() => null);

        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Counting Failed')
          .setDescription('The counting was broken. Start again from **1**.\n\nRemember:\n- no skipping numbers\n- no going back\n- one person may not count twice in a row')
          .setTimestamp();

        await message.channel.send({ embeds: [embed] }).catch(() => null);

        countingState.current = 1;
        countingState.lastUserId = null;
        saveCountingState(countingState);
        return;
      }

      if (number > countingState.record) {
        countingState.record = number;
        await message.react('🏆').catch(() => null);
      } else {
        await message.react('✅').catch(() => null);
      }

      if (number % 100 === 0) {
        await message.react('💯').catch(() => null);
      }

      countingState.current += 1;
      countingState.lastUserId = message.author.id;
      saveCountingState(countingState);
      return;
    }
  } catch (err) {
    console.error('messageCreate error:', err);
  }
});

// ======================================================
// REACTION ROLES
// ======================================================
async function handleReactionRole(reaction, user, add) {
  if (user.bot) return;

  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (!reaction.message.guild) return;

  const stored = reactionPanelStore[reaction.message.id];
  if (!stored) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const panel = CONFIG.reactionRoles.panels[stored.panelKey];
  if (!panel) return;

  const reactionKey = reaction.emoji.id
    ? `${reaction.emoji.name}:${reaction.emoji.id}`
    : reaction.emoji.name;

  for (const item of panel.items) {
    const expected = getEmojiIdentifier(guild, item);
    if (!expected) continue;
    if (expected !== reactionKey) continue;

    const role = findRoleByConfig(guild, item);
    if (!role) {
      console.log(`❌ Role not found for reaction role: ${item.roleName || item.roleId}`);
      return;
    }

    if (add) {
      await member.roles.add(role).catch(() => null);
    } else {
      await member.roles.remove(role).catch(() => null);
    }

    return;
  }
}

client.on('messageReactionAdd', async (reaction, user) => {
  await handleReactionRole(reaction, user, true);
});

client.on('messageReactionRemove', async (reaction, user) => {
  await handleReactionRole(reaction, user, false);
});

// ======================================================
// LOGIN
// ======================================================
client.login(TOKEN);
