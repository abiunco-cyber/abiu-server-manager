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

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
  getVoiceConnection,
  generateDependencyReport
} = require('@discordjs/voice');

const play = require('play-dl');

// ==================================================
// CONFIG
// ==================================================
const TOKEN = 'MTQ4NDcxMDE3NzQ4NjkyOTk5MQ.Gab_92.EtkV4fQi54VcA5W1lnw-U4wq8nxNkr_tsnEbmc';
const CLIENT_ID = '1484710177486929991';
const GUILD_ID = '1461027191583146034';
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
    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause
      }
    });

    const state = {
      guildId,
      player,
      connection: null,
      queue: [],
      history: [],
      current: null,
      volume: 0.5,
      paused: false,
      autoplay: false,
      loopMode: 'off', // off | song | queue
      controllerMessageId: null,
      controllerChannelId: MUSIC_CONTROLLER_CHANNEL_ID,
      startedAtMs: null,
      pausedAtMs: null,
      accumulatedPausedMs: 0,
      panelInterval: null,
      currentVoiceChannelId: null
    };

    player.on(AudioPlayerStatus.Playing, async () => {
      if (!state.startedAtMs) {
        state.startedAtMs = Date.now();
        state.accumulatedPausedMs = 0;
        state.pausedAtMs = null;
      }
      state.paused = false;
      await updateMusicPanel(state).catch(() => null);
    });

    player.on(AudioPlayerStatus.Paused, async () => {
      state.paused = true;
      if (!state.pausedAtMs) {
        state.pausedAtMs = Date.now();
      }
      await updateMusicPanel(state).catch(() => null);
    });

    player.on(AudioPlayerStatus.Idle, async () => {
      try {
        await handleTrackEnd(state);
      } catch (error) {
        console.error(`❌ Track end error for guild ${guildId}:`, error);
      }
    });

    player.on('error', async (error) => {
      console.error(`❌ Audio player error for guild ${guildId}:`, error);

      try {
        if (state.queue.length > 0) {
          await playNextTrack(state);
        } else {
          clearPlaybackTimers(state);
          state.current = null;
          state.paused = false;
          await updateMusicPanel(state);
        }
      } catch (secondaryError) {
        console.error(`❌ Failed to recover from audio error in guild ${guildId}:`, secondaryError);
      }
    });

    musicStates.set(guildId, state);
  }

  return musicStates.get(guildId);
}

// ==================================================
// HELPERS
// ==================================================
function formatDuration(seconds) {
  if (!seconds || Number.isNaN(seconds)) return 'Unknown';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

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

function createProgressBar(currentSeconds, totalSeconds, size = 14) {
  if (!totalSeconds || totalSeconds <= 0) {
    return '▬'.repeat(size);
  }

  const ratio = Math.max(0, Math.min(1, currentSeconds / totalSeconds));
  const position = Math.min(size - 1, Math.floor(ratio * size));

  let bar = '';
  for (let i = 0; i < size; i += 1) {
    bar += i === position ? '🔘' : '▬';
  }

  return bar;
}

function getElapsedSeconds(state) {
  if (!state.current || !state.startedAtMs) return 0;

  const now = Date.now();
  const pausedExtra = state.pausedAtMs ? now - state.pausedAtMs : 0;
  const elapsedMs = now - state.startedAtMs - state.accumulatedPausedMs - pausedExtra;

  return Math.max(0, Math.floor(elapsedMs / 1000));
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
    .map((track, index) => `${index + 1}. ${track.title}`)
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
      { name: 'Volume', value: `${Math.round(state.volume * 100)}%`, inline: true },
      { name: 'Autoplay', value: state.autoplay ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Loop', value: getLoopLabel(state.loopMode), inline: true }
    );
    return embed;
  }

  const elapsedSeconds = getElapsedSeconds(state);
  const totalSeconds = state.current.durationInSec || 0;
  const progressBar = createProgressBar(elapsedSeconds, totalSeconds);

  embed
    .setDescription(`Now playing:\n[${state.current.title}](${state.current.url})`)
    .addFields(
      {
        name: 'Progress',
        value: `${progressBar}\n${formatDuration(elapsedSeconds)} / ${formatDuration(totalSeconds)}`,
        inline: false
      },
      { name: 'Requested By', value: state.current.requestedByMention || 'Unknown', inline: true },
      { name: 'Volume', value: `${Math.round(state.volume * 100)}%`, inline: true },
      { name: 'State', value: state.paused ? 'Paused' : 'Playing', inline: true },
      { name: 'Queue', value: `${state.queue.length} song(s)`, inline: true },
      { name: 'Loop', value: getLoopLabel(state.loopMode), inline: true },
      { name: 'Autoplay', value: state.autoplay ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Up Next', value: buildQueuePreview(state), inline: false }
    );

  if (state.current.thumbnail) {
    embed.setImage(state.current.thumbnail);
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

  console.log('Joining VC:', {
    guild: member.guild.id,
    channel: voiceChannel.id,
    channelName: voiceChannel.name,
    type: voiceChannel.type,
    userLimit: voiceChannel.userLimit,
    memberCount: voiceChannel.members.size
  });

  const existing = getVoiceConnection(member.guild.id);
  if (existing) {
    try {
      existing.destroy();
    } catch {}
    state.connection = null;
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: member.guild.id,
    adapterCreator: member.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false
  });

  state.connection = connection;
  state.currentVoiceChannelId = voiceChannel.id;

  connection.on('stateChange', (oldState, newState) => {
    console.log(`🔊 Voice state changed: ${oldState.status} -> ${newState.status}`);
  });

  connection.on('error', (error) => {
    console.error(`❌ Voice connection error in guild ${member.guild.id}:`, error);
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30000);
  } catch (error) {
    console.error('❌ Voice connection did not become ready:', error);

    try {
      connection.destroy();
    } catch {}

    state.connection = null;
    state.currentVoiceChannelId = null;

    throw new Error('I could not fully connect to the voice channel. Check channel permissions, user limit, and hosting/network support.');
  }

  connection.subscribe(state.player);
  return connection;
}

async function resolveTrack(query, requestedByUser) {
  const requestedByMention = `<@${requestedByUser.id}>`;

  if (play.sp_validate(query) === 'track') {
    const spotifyTrack = await play.spotify(query);
    const artist = spotifyTrack.artists?.[0]?.name || '';
    const searchTerm = `${artist} - ${spotifyTrack.name}`.trim();

    const youtubeResults = await play.search(searchTerm, {
      limit: 1,
      source: { youtube: 'video' }
    });

    const yt = youtubeResults[0];
    if (!yt) {
      throw new Error('Could not find a playable match for that Spotify track.');
    }

    return {
      title: yt.title || spotifyTrack.name,
      url: yt.url,
      durationInSec: yt.durationInSec || spotifyTrack.durationInSec || 0,
      thumbnail: yt.thumbnails?.[0]?.url || spotifyTrack.thumbnail?.url || null,
      requestedById: requestedByUser.id,
      requestedByMention,
      source: 'youtube'
    };
  }

  if (play.yt_validate(query) === 'video') {
    const info = await play.video_basic_info(query);
    const details = info.video_details;

    return {
      title: details.title,
      url: details.url,
      durationInSec: Number(details.durationInSec || 0),
      thumbnail: details.thumbnails?.[0]?.url || null,
      requestedById: requestedByUser.id,
      requestedByMention,
      source: 'youtube'
    };
  }

  const results = await play.search(query, {
    limit: 1,
    source: { youtube: 'video' }
  });

  const first = results[0];
  if (!first) {
    throw new Error('No results found for that song.');
  }

  return {
    title: first.title,
    url: first.url,
    durationInSec: first.durationInSec || 0,
    thumbnail: first.thumbnails?.[0]?.url || null,
    requestedById: requestedByUser.id,
    requestedByMention,
    source: 'youtube'
  };
}

async function createResourceForTrack(track, volume) {
  const stream = await play.stream(track.url, {
    discordPlayerCompatibility: true
  });

  const resource = createAudioResource(stream.stream, {
    inputType: stream.type,
    inlineVolume: true
  });

  resource.volume.setVolume(volume);
  return resource;
}

async function playTrack(state, track) {
  const resource = await createResourceForTrack(track, state.volume);

  state.current = track;
  state.paused = false;
  clearPlaybackTimers(state);
  state.startedAtMs = Date.now();
  startPanelInterval(state);

  state.player.play(resource);
  await updateMusicPanel(state);
}

async function getAutoplayTrack(currentTrack) {
  try {
    const info = await play.video_basic_info(currentTrack.url);
    const related = info.related_videos?.find(
      (video) => video.url && video.url !== currentTrack.url && !video.live
    );

    if (!related) return null;

    return {
      title: related.title,
      url: related.url,
      durationInSec: related.durationInSec || 0,
      thumbnail: related.thumbnails?.[0]?.url || null,
      requestedById: 'autoplay',
      requestedByMention: 'Autoplay',
      source: 'youtube'
    };
  } catch {
    return null;
  }
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
    if (state.autoplay && state.current?.url) {
      const related = await getAutoplayTrack(state.current);
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

  try {
    state.player.stop(true);
  } catch {}

  if (state.connection) {
    try {
      state.connection.destroy();
    } catch {}
    state.connection = null;
    state.currentVoiceChannelId = null;
  }

  await updateMusicPanel(state);
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
  console.log('✅ Voice system loaded');
  console.log(generateDependencyReport());

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

          const isPlayingSomething =
            state.current ||
            state.player.state.status === AudioPlayerStatus.Playing ||
            state.player.state.status === AudioPlayerStatus.Buffering ||
            state.paused;

          if (!isPlayingSomething) {
            await playTrack(state, track);
            await interaction.editReply({
              content: `✅ Now playing: **${track.title}**`
            }).catch(() => null);
            return;
          }

          state.queue.push(track);
          await updateMusicPanel(state);

          await interaction.editReply({
            content: `✅ Added to queue: **${track.title}**`
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
          lines.push(`**Now Playing:** ${state.current.title}`);
        } else {
          lines.push('**Now Playing:** Nothing');
        }

        if (state.queue.length > 0) {
          const queueLines = state.queue
            .slice(0, 10)
            .map((track, index) => `${index + 1}. ${track.title}`);
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

      if (!state.connection) {
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
          state.player.unpause();
          state.paused = false;
        } else {
          state.player.pause();
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

        await playNextTrack(state, { skipped: true });
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
        state.volume = Math.max(0.1, Number((state.volume - 0.1).toFixed(2)));

        const resource = state.player.state.resource;
        if (resource?.volume) {
          resource.volume.setVolume(state.volume);
        }

        await updateMusicPanel(state);
        return;
      }

      if (interaction.customId === MUSIC_BUTTONS.VOLUME_UP) {
        state.volume = Math.min(2, Number((state.volume + 0.1).toFixed(2)));

        const resource = state.player.state.resource;
        if (resource?.volume) {
          resource.volume.setVolume(state.volume);
        }

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