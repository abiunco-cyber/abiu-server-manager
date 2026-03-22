require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  MessageFlags
} = require('discord.js');

const { Connectors, Shoukaku } = require('shoukaku');

// ==================================================
// CONFIG
// ==================================================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const LAVALINK_HOST = process.env.LAVALINK_HOST || '127.0.0.1';
const LAVALINK_PORT = Number(process.env.LAVALINK_PORT || 2333);
const LAVALINK_PASSWORD = process.env.LAVALINK_PASSWORD || 'youshallnotpass';

const MUSIC_CONTROLLER_CHANNEL_ID = '1462549822438641674';

const MUSIC_PANEL_TITLE = 'Music Controller';
const DEFAULT_PANEL_TEXT = 'Waiting for music...\nUse /play to play a song or add it to the queue.';
const PANEL_COLOR = 0x5865F2;
const PANEL_UPDATE_INTERVAL_MS = 5000;

// ==================================================
// BUTTON IDS
// ==================================================
const MUSIC_BUTTONS = {
  CONNECT: 'music_connect',
  PREVIOUS: 'music_previous',
  PAUSE_RESUME: 'music_pause_resume',
  SKIP: 'music_skip',
  VOLUME_DOWN: 'music_volume_down',
  VOLUME_UP: 'music_volume_up',
  SHUFFLE: 'music_shuffle',
  AUTOPLAY: 'music_autoplay',
  LOOP: 'music_loop',
  STOP: 'music_stop'
};

// ==================================================
// CLIENT
// ==================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ==================================================
// LAVALINK
// ==================================================
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
  resumeTimeout: 30,
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

// ==================================================
// CRASH PROTECTION
// ==================================================
client.on('error', (error) => {
  console.error('❌ Client error:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});

// ==================================================
// MUSIC STATE
// ==================================================
const musicStates = new Map();

function getGuildMusicState(guildId) {
  if (!musicStates.has(guildId)) {
    musicStates.set(guildId, {
      guildId,
      player: null,
      queue: [],
      history: [],
      current: null,
      volume: 50,
      paused: false,
      autoplay: false,
      loopMode: 'off',
      controllerMessageId: null,
      controllerChannelId: MUSIC_CONTROLLER_CHANNEL_ID,
      startedAtMs: null,
      pausedAtMs: null,
      accumulatedPausedMs: 0,
      panelInterval: null,
      currentVoiceChannelId: null
    });
  }

  return musicStates.get(guildId);
}

// ==================================================
// HELPERS
// ==================================================
function formatDuration(ms) {
  if (!ms || Number.isNaN(ms)) return 'Unknown';

  const totalSeconds = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function shuffleArray(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function createProgressBar(currentMs, totalMs, size = 14) {
  if (!totalMs || totalMs <= 0) return '▬'.repeat(size);

  const ratio = Math.max(0, Math.min(1, currentMs / totalMs));
  const position = Math.min(size - 1, Math.floor(ratio * size));

  let bar = '';
  for (let i = 0; i < size; i += 1) {
    bar += i === position ? '🔘' : '▬';
  }

  return bar;
}

function getElapsedMs(state) {
  if (!state.current || !state.startedAtMs) return 0;

  const now = Date.now();
  const pausedExtra = state.pausedAtMs ? now - state.pausedAtMs : 0;
  const elapsedMs = now - state.startedAtMs - state.accumulatedPausedMs - pausedExtra;

  return Math.max(0, elapsedMs);
}

function clearPlaybackTimers(state) {
  state.startedAtMs = null;
  state.pausedAtMs = null;
  state.accumulatedPausedMs = 0;
}

function startPanelInterval(state) {
  stopPanelInterval(state);

  state.panelInterval = setInterval(() => {
    updateMusicPanel(state).catch(() => null);
  }, PANEL_UPDATE_INTERVAL_MS);
}

function stopPanelInterval(state) {
  if (state.panelInterval) {
    clearInterval(state.panelInterval);
    state.panelInterval = null;
  }
}

function getLoopLabel(loopMode) {
  if (loopMode === 'song') return 'Loop Song';
  if (loopMode === 'queue') return 'Loop Queue';
  return 'Loop Off';
}

function cycleLoopMode(loopMode) {
  if (loopMode === 'off') return 'song';
  if (loopMode === 'song') return 'queue';
  return 'off';
}

function createMusicButtons(state) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(MUSIC_BUTTONS.CONNECT)
        .setLabel('Connect Bot')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(MUSIC_BUTTONS.PREVIOUS)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(MUSIC_BUTTONS.PAUSE_RESUME)
        .setLabel(state.paused ? 'Resume' : 'Pause')
        .setStyle(state.paused ? ButtonStyle.Success : ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(MUSIC_BUTTONS.SKIP)
        .setLabel('Skip')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(MUSIC_BUTTONS.VOLUME_DOWN)
        .setLabel('Vol -')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(MUSIC_BUTTONS.VOLUME_UP)
        .setLabel('Vol +')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(MUSIC_BUTTONS.SHUFFLE)
        .setLabel('Shuffle')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(MUSIC_BUTTONS.AUTOPLAY)
        .setLabel(`Autoplay ${state.autoplay ? 'On' : 'Off'}`)
        .setStyle(state.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(MUSIC_BUTTONS.LOOP)
        .setLabel(getLoopLabel(state.loopMode))
        .setStyle(state.loopMode === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(MUSIC_BUTTONS.STOP)
        .setLabel('Stop')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function buildQueuePreview(state) {
  if (state.queue.length === 0) return 'Empty';

  return state.queue
    .slice(0, 5)
    .map((track, index) => `${index + 1}. ${track.info.title}`)
    .join('\n');
}

function buildMusicPanelEmbed(state) {
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(MUSIC_PANEL_TITLE);

  if (!state.current) {
    embed.setDescription(DEFAULT_PANEL_TEXT);
    embed.addFields(
      { name: 'Queue', value: `${state.queue.length} song(s)`, inline: true },
      { name: 'Volume', value: `${state.volume}%`, inline: true },
      { name: 'Autoplay', value: state.autoplay ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Loop', value: getLoopLabel(state.loopMode), inline: true }
    );
    return embed;
  }

  const elapsedMs = getElapsedMs(state);
  const totalMs = state.current.info.length || 0;
  const progressBar = createProgressBar(elapsedMs, totalMs);

  embed
    .setDescription(`Now playing:\n[${state.current.info.title}](${state.current.info.uri || state.current.info.url || 'https://youtube.com'})`)
    .addFields(
      {
        name: 'Progress',
        value: `${progressBar}\n${formatDuration(elapsedMs)} / ${formatDuration(totalMs)}`,
        inline: false
      },
      { name: 'Requested By', value: state.current.requestedByMention || 'Unknown', inline: true },
      { name: 'Volume', value: `${state.volume}%`, inline: true },
      { name: 'State', value: state.paused ? 'Paused' : 'Playing', inline: true },
      { name: 'Queue', value: `${state.queue.length} song(s)`, inline: true },
      { name: 'Loop', value: getLoopLabel(state.loopMode), inline: true },
      { name: 'Autoplay', value: state.autoplay ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Up Next', value: buildQueuePreview(state), inline: false }
    );

  if (state.current.info.artworkUrl) {
    embed.setImage(state.current.info.artworkUrl);
  }

  return embed;
}

async function ensureMusicControllerMessage(guild) {
  const state = getGuildMusicState(guild.id);

  const channel = await client.channels.fetch(MUSIC_CONTROLLER_CHANNEL_ID).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    console.error(`❌ Music controller channel not found: ${MUSIC_CONTROLLER_CHANNEL_ID}`);
    return;
  }

  const recentMessages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  const existingMessage = recentMessages?.find(
    (message) =>
      message.author.id === client.user.id &&
      message.embeds?.[0]?.title === MUSIC_PANEL_TITLE
  ) || null;

  if (existingMessage) {
    state.controllerMessageId = existingMessage.id;
    state.controllerChannelId = channel.id;

    await existingMessage.edit({
      embeds: [buildMusicPanelEmbed(state)],
      components: createMusicButtons(state)
    }).catch(() => null);

    return;
  }

  const sent = await channel.send({
    embeds: [buildMusicPanelEmbed(state)],
    components: createMusicButtons(state)
  });

  state.controllerMessageId = sent.id;
  state.controllerChannelId = channel.id;
}

async function updateMusicPanel(state) {
  if (!state.controllerMessageId || !state.controllerChannelId) return;

  const channel = await client.channels.fetch(state.controllerChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const message = await channel.messages.fetch(state.controllerMessageId).catch(() => null);
  if (!message) return;

  await message.edit({
    embeds: [buildMusicPanelEmbed(state)],
    components: createMusicButtons(state)
  }).catch(() => null);
}

async function connectToMemberVoice(member, state) {
  const voiceChannel = member.voice?.channel;

  if (!voiceChannel) {
    throw new Error('You need to be in a voice channel first.');
  }

  if (voiceChannel.type !== ChannelType.GuildVoice) {
    throw new Error('Please use a normal voice channel.');
  }

  const me = member.guild.members.me;
  const botPermissions = voiceChannel.permissionsFor(me);

  if (!botPermissions?.has(PermissionsBitField.Flags.ViewChannel)) {
    throw new Error('I cannot view your voice channel.');
  }

  if (!botPermissions?.has(PermissionsBitField.Flags.Connect)) {
    throw new Error('I do not have permission to connect to your voice channel.');
  }

  if (!botPermissions?.has(PermissionsBitField.Flags.Speak)) {
    throw new Error('I do not have permission to speak in your voice channel.');
  }

  if (
    voiceChannel.userLimit > 0 &&
    voiceChannel.members.size >= voiceChannel.userLimit &&
    !voiceChannel.members.has(me.id)
  ) {
    throw new Error('That voice channel is full.');
  }

  let player = state.player;

  if (!player) {
    player = await shoukaku.joinVoiceChannel({
      guildId: member.guild.id,
      channelId: voiceChannel.id,
      shardId: 0,
      deaf: true
    });

    state.player = player;
    state.currentVoiceChannelId = voiceChannel.id;

    player.on('end', async () => {
      await handleTrackEnd(state).catch(console.error);
    });

    player.on('closed', (data) => {
      console.log('⚠️ Player closed:', data);
    });

    player.on('exception', (data) => {
      console.error('❌ Lavalink exception:', data);
    });

    player.on('stuck', (data) => {
      console.error('❌ Lavalink stuck:', data);
    });
  } else if (state.currentVoiceChannelId !== voiceChannel.id) {
    await player.moveChannel(voiceChannel.id);
    state.currentVoiceChannelId = voiceChannel.id;
  }

  return player;
}

async function searchTrack(query) {
  const node = shoukaku.nodes.values().next().value;

  if (!node) {
    throw new Error("Can't find any nodes to connect on.");
  }

  const result = await node.rest.resolve(query);
  return result;
}

async function resolveTrack(query, requestedByUser) {
  let searchQuery = query;

  if (
    !query.startsWith('http://') &&
    !query.startsWith('https://') &&
    !query.startsWith('ytsearch:') &&
    !query.startsWith('spsearch:')
  ) {
    searchQuery = `ytsearch:${query}`;
  }

  const result = await searchTrack(searchQuery);

  if (!result || !result.data) {
    throw new Error('No results found for that song.');
  }

  let selectedTrack = null;

  if (result.loadType === 'track') {
    selectedTrack = result.data;
  } else if (result.loadType === 'search' && result.data.length > 0) {
    selectedTrack = result.data[0];
  } else if (result.loadType === 'playlist' && result.data.tracks.length > 0) {
    selectedTrack = result.data.tracks[0];
  }

  if (!selectedTrack) {
    throw new Error('No playable result was found.');
  }

  selectedTrack.requestedById = requestedByUser.id;
  selectedTrack.requestedByMention = `<@${requestedByUser.id}>`;

  return selectedTrack;
}

async function resolveAutoplayTrack(currentTrack) {
  const result = await searchTrack(`ytsearch:${currentTrack.info.author || ''} ${currentTrack.info.title}`);

  if (!result || result.loadType !== 'search' || !result.data.length) {
    return null;
  }

  const next = result.data.find(track => track.info.identifier !== currentTrack.info.identifier) || null;

  if (!next) return null;

  next.requestedById = 'autoplay';
  next.requestedByMention = 'Autoplay';
  return next;
}

async function playTrack(state, track) {
  if (!state.player) {
    throw new Error('Player is not connected.');
  }

  state.current = track;
  state.paused = false;
  clearPlaybackTimers(state);
  state.startedAtMs = Date.now();
  startPanelInterval(state);

  await state.player.playTrack({
    track: track.encoded
  });

  if (state.volume !== 100) {
    await state.player.setGlobalVolume(state.volume);
  }

  await updateMusicPanel(state);
}

async function playNextTrack(state, options = {}) {
  const { skipped = false } = options;

  if (state.current && state.loopMode === 'song' && !skipped) {
    await playTrack(state, state.current);
    return;
  }

  if (state.current && state.loopMode === 'queue') {
    state.queue.push(state.current);
  } else if (state.current && skipped) {
    state.history.push(state.current);
  } else if (state.current && state.loopMode === 'off') {
    state.history.push(state.current);
  }

  if (state.queue.length === 0) {
    if (state.autoplay && state.current) {
      const related = await resolveAutoplayTrack(state.current).catch(() => null);

      if (related) {
        await playTrack(state, related);
        return;
      }
    }

    stopPanelInterval(state);
    clearPlaybackTimers(state);
    state.current = null;
    state.paused = false;
    await updateMusicPanel(state);
    return;
  }

  const next = state.queue.shift();
  await playTrack(state, next);
}

async function handleTrackEnd(state) {
  await playNextTrack(state, { skipped: false });
}

async function stopMusic(state) {
  state.queue = [];
  state.history = [];
  state.current = null;
  state.paused = false;
  state.autoplay = false;
  state.loopMode = 'off';

  stopPanelInterval(state);
  clearPlaybackTimers(state);

  if (state.player) {
    try {
      await state.player.stopTrack();
    } catch {}

    try {
      await state.player.connection.disconnect();
    } catch {}

    state.player = null;
    state.currentVoiceChannelId = null;
  }

  await updateMusicPanel(state);
}

function resetBrokenState(state) {
  state.queue = [];
  state.history = [];
  state.current = null;
  state.paused = false;
  clearPlaybackTimers(state);
  stopPanelInterval(state);
}

async function safeInteractionError(interaction, message) {
  try {
    if (!interaction.isRepliable()) return;

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: message,
        flags: MessageFlags.Ephemeral
      }).catch(() => null);
      return;
    }

    await interaction.reply({
      content: message,
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
  } catch {}
}

// ==================================================
// READY
// ==================================================
client.once(Events.ClientReady, async () => {
  console.log(`✅ ${client.user.tag} is now online!`);

  const commands = [
    new SlashCommandBuilder()
      .setName('play')
      .setDescription('Play a song or add it to the queue')
      .addStringOption(option =>
        option
          .setName('query')
          .setDescription('Song name, YouTube link, or Spotify track link')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('leave')
      .setDescription('Disconnect the bot and clear the queue'),

    new SlashCommandBuilder()
      .setName('queue')
      .setDescription('Show the current music queue')
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log('🔄 Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered successfully!');
  } catch (error) {
    console.error('❌ Failed to register slash commands:', error);
  }

  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (guild) {
    await ensureMusicControllerMessage(guild);
  }
});

// ==================================================
// INTERACTIONS
// ==================================================
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!interaction.guild || !interaction.member) {
        await safeInteractionError(interaction, '❌ This command can only be used in a server.');
        return;
      }

      const state = getGuildMusicState(interaction.guild.id);

      if (interaction.commandName === 'play') {
        const query = interaction.options.getString('query', true);

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          await connectToMemberVoice(interaction.member, state);

          const track = await resolveTrack(query, interaction.user);

          const playerLooksUsable =
            state.player &&
            state.current &&
            state.currentVoiceChannelId &&
            !state.paused;

          if (!playerLooksUsable) {
            resetBrokenState(state);
            await playTrack(state, track);

            await interaction.editReply({
              content: `✅ Now playing: **${track.info.title}**`
            }).catch(() => null);
            return;
          }

          state.queue.push(track);
          await updateMusicPanel(state);

          await interaction.editReply({
            content: `✅ Added to queue: **${track.info.title}**`
          }).catch(() => null);
          return;
        } catch (error) {
          await interaction.editReply({
            content: `❌ ${error.message || 'Failed to play that track.'}`
          }).catch(() => null);
          return;
        }
      }

      if (interaction.commandName === 'leave') {
        await stopMusic(state);

        await interaction.reply({
          content: '✅ Disconnected and cleared the queue.',
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
        return;
      }

      if (interaction.commandName === 'queue') {
        const lines = [];

        if (state.current) {
          lines.push(`**Now Playing:** ${state.current.info.title}`);
        } else {
          lines.push('**Now Playing:** Nothing');
        }

        if (state.queue.length > 0) {
          const queueLines = state.queue
            .slice(0, 10)
            .map((track, index) => `${index + 1}. ${track.info.title}`);
          lines.push('', '**Queue:**', ...queueLines);
        } else {
          lines.push('', '**Queue:** Empty');
        }

        await interaction.reply({
          content: lines.join('\n'),
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
        return;
      }
    }

    if (interaction.isButton()) {
      if (!interaction.guild || !interaction.member) {
        await safeInteractionError(interaction, '❌ This button only works in a server.');
        return;
      }

      const state = getGuildMusicState(interaction.guild.id);

      await interaction.deferUpdate().catch(() => null);

      if (interaction.customId === MUSIC_BUTTONS.CONNECT) {
        try {
          await connectToMemberVoice(interaction.member, state);
          await updateMusicPanel(state);

          await interaction.followUp({
            content: '✅ Connected to your voice channel.',
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
        } catch (error) {
          await interaction.followUp({
            content: `❌ ${error.message || 'Could not join your voice channel.'}`,
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
        }
        return;
      }

      if (!state.player) {
        await interaction.followUp({
          content: '❌ I am not connected to a voice channel yet.',
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
        return;
      }

      if (interaction.customId === MUSIC_BUTTONS.PAUSE_RESUME) {
        if (!state.current) {
          await interaction.followUp({
            content: '❌ Nothing is currently playing.',
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
          return;
        }

        if (state.paused) {
          if (state.pausedAtMs) {
            state.accumulatedPausedMs += Date.now() - state.pausedAtMs;
            state.pausedAtMs = null;
          }

          await state.player.setPaused(false);
          state.paused = false;
        } else {
          await state.player.setPaused(true);
          state.paused = true;
          state.pausedAtMs = Date.now();
        }

        await updateMusicPanel(state);
        return;
      }

      if (interaction.customId === MUSIC_BUTTONS.SKIP) {
        if (!state.current && state.queue.length === 0) {
          await interaction.followUp({
            content: '❌ Nothing to skip.',
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
          return;
        }

        await state.player.stopTrack();
        return;
      }

      if (interaction.customId === MUSIC_BUTTONS.PREVIOUS) {
        if (state.history.length === 0) {
          await interaction.followUp({
            content: '❌ No previous song available.',
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
          return;
        }

        if (state.current) {
          state.queue.unshift(state.current);
        }

        const previous = state.history.pop();
        await playTrack(state, previous);
        return;
      }

      if (interaction.customId === MUSIC_BUTTONS.VOLUME_DOWN) {
        state.volume = Math.max(10, state.volume - 10);
        await state.player.setGlobalVolume(state.volume);
        await updateMusicPanel(state);
        return;
      }

      if (interaction.customId === MUSIC_BUTTONS.VOLUME_UP) {
        state.volume = Math.min(200, state.volume + 10);
        await state.player.setGlobalVolume(state.volume);
        await updateMusicPanel(state);
        return;
      }

      if (interaction.customId === MUSIC_BUTTONS.SHUFFLE) {
        if (state.queue.length < 2) {
          await interaction.followUp({
            content: '❌ Not enough songs in queue to shuffle.',
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
          return;
        }

        state.queue = shuffleArray(state.queue);
        await updateMusicPanel(state);
        return;
      }

      if (interaction.customId === MUSIC_BUTTONS.AUTOPLAY) {
        state.autoplay = !state.autoplay;
        await updateMusicPanel(state);
        return;
      }

      if (interaction.customId === MUSIC_BUTTONS.LOOP) {
        state.loopMode = cycleLoopMode(state.loopMode);
        await updateMusicPanel(state);
        return;
      }

      if (interaction.customId === MUSIC_BUTTONS.STOP) {
        await stopMusic(state);
        return;
      }
    }
  } catch (error) {
    console.error('❌ Interaction error:', error);
    await safeInteractionError(interaction, '❌ Something went wrong.');
  }
});

client.login(TOKEN);
