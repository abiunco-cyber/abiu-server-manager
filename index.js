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

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

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
        description:
          'React to this message to assign yourself roles\n\n:bronze: = @Bronze\n:silver: = @Silver\n:gold: = @Gold\n:platinum: = @Platinum\n:diamond: = @Diamond\n:champion: = @Champion\n:gc: = @Grand Champion\n:ssl: = @SuperSonic Legend',
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
        description:
          'phone = :phone:\npc = :pc:\nxbox = :xbox:\nplaystation = :ps:',
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
        description:
          '👨 = Male\n👩 = Female',
        color: 0xf08cff,
        items: [
          { roleId: '1462555108020850874', emoji: '👨' },
          { roleId: '1462555140165865538', emoji: '👩' }
        ]
      },

      color: {
        title: 'What is your favorite color?',
        description:
          '❤️ = Red\n🧡 = Orange\n💛 = Yellow\n💚 = Green\n💙 = Blue\n💜 = Purple\n🩷 = Pink',
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
        description:
          '🚗 = Rocket League\n🩸 = 7 Days To Die\n⚽ = FC 26\n🔪 = Dead by Daylight\n🔫 = Call Of Duty\n🧟 = Project Zomboid',
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
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

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
    if (found) return `<:${found.name}:${found.id}>`;
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
      )
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
  try {
    if (interaction.isChatInputCommand()) {
      if (!interaction.guild || !interaction.member) return;

      // ping
      if (interaction.commandName === 'ping') {
        await interaction.reply('pong');
        return;
      }

      // rmc
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

      // send verify panel
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

      // send ticket panel
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

      // send reaction panel
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
          .setDescription(panel.description);

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

      // adduser
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

      // removeuser
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

      // rename ticket
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
    }

    if (interaction.isButton()) {
      // verify
      if (interaction.customId === 'verify_member') {
        const role = interaction.guild.roles.cache.get(CONFIG.verify.memberRoleId);
        if (!role) {
          await interaction.reply(makeEphemeral('❌ Member role not found.'));
          return;
        }

        if (interaction.member.roles.cache.has(role.id)) {
          await interaction.reply(makeEphemeral('✅ You are already verified.'));
          return;
        }

        await interaction.member.roles.add(role).catch(() => null);
        await interaction.reply(makeEphemeral('✅ You have been verified and received the member role.'));
        return;
      }

      // open tickets
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
          await interaction.reply(makeEphemeral(`❌ You already have an open ${info.label} ticket: <#${existing.channelId}>`));
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

      // claim / close
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

    // counting only
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
