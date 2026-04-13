const {
    Client,
    GatewayIntentBits,
    Partials,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    EmbedBuilder
} = require('discord.js');

const fs = require('fs');

// JSON file for permanent invite storage
const INVITE_FILE = './invites.json';

// Load or create invite storage
let inviteData = {};
if (fs.existsSync(INVITE_FILE)) {
    inviteData = JSON.parse(fs.readFileSync(INVITE_FILE, 'utf8'));
} else {
    fs.writeFileSync(INVITE_FILE, JSON.stringify({}, null, 4));
}

// Save function
function saveInvites() {
    fs.writeFileSync(INVITE_FILE, JSON.stringify(inviteData, null, 4));
}

const ticketLogChannelId = "1488962491818967301";
const chatlogChannelId = "1488962511150649364";
const welcomeChannelId = "1488858798356693165";
const invitesChannelId = "1488858798356693167";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites
    ],
    partials: [Partials.Channel]
});

// Cache for active invites
let activeInvites = new Map();

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const guild = client.guilds.cache.first();
    if (!guild) return;

    const invites = await guild.invites.fetch();
    invites.forEach(inv => {
        activeInvites.set(inv.code, inv.uses);
        if (!inviteData[inv.code]) {
            inviteData[inv.code] = {
                inviter: inv.inviter?.id || null,
                uses: inv.uses
            };
        }
    });

    saveInvites();
    console.log("Invite tracking initialized.");
});

// Track new invites
client.on('inviteCreate', invite => {
    activeInvites.set(invite.code, invite.uses);

    inviteData[invite.code] = {
        inviter: invite.inviter?.id || null,
        uses: invite.uses
    };

    saveInvites();
});

// Keep expired/deleted invites in JSON
client.on('inviteDelete', invite => {
    activeInvites.delete(invite.code);
    saveInvites();
});

// Member joins
client.on('guildMemberAdd', async (member) => {
    try {
        // Assign Community role
        const communityRole = member.guild.roles.cache.find(r => r.name === 'Community');
        if (communityRole) await member.roles.add(communityRole);

        // Welcome message
        const welcomeChannel = await client.channels.fetch(welcomeChannelId);
        if (welcomeChannel) {
            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`Welcome to the server, ${member.user.username}!`)
                .setDescription(`We're glad to have you here! 🎉`)
                .setColor(0xFF9527)
                .setThumbnail(member.user.displayAvatarURL())
                .setFooter({ text: `Member #${member.guild.memberCount}` });

            welcomeChannel.send({ content: `<@${member.id}>`, embeds: [welcomeEmbed] });
        }

        // Fetch new invites
        const newInvites = await member.guild.invites.fetch();
        let usedInvite = null;

        newInvites.forEach(inv => {
            const oldUses = activeInvites.get(inv.code) || 0;
            if (inv.uses > oldUses) usedInvite = inv;
        });

        // Update active cache
        newInvites.forEach(inv => activeInvites.set(inv.code, inv.uses));

        let inviter = null;
        let inviteCode = null;

        if (usedInvite) {
            inviter = usedInvite.inviter;
            inviteCode = usedInvite.code;

            // Update JSON
            inviteData[inviteCode].uses = usedInvite.uses;
            saveInvites();
        } else {
            // Joined using EXPIRED or DELETED invite
            inviter = null;
            inviteCode = "Expired/Deleted";
        }

        // Log invite
        const invitesChannel = await client.channels.fetch(invitesChannelId);
        if (invitesChannel) {
            const embed = new EmbedBuilder()
                .setTitle("📊 Member Invited")
                .setDescription(
                    inviter
                        ? `<@${inviter.id}> invited <@${member.id}>`
                        : `<@${member.id}> joined using an expired or deleted invite`
                )
                .addFields(
                    { name: "Inviter", value: inviter ? inviter.tag : "Unknown", inline: true },
                    { name: "New Member", value: member.user.tag, inline: true },
                    { name: "Invite Code", value: inviteCode, inline: true },
                    { name: "Joined At", value: `<t:${Math.floor(Date.now() / 1000)}:f>` }
                )
                .setColor(0x0099ff)
                .setThumbnail(member.user.displayAvatarURL());

            invitesChannel.send({ embeds: [embed] });
        }

    } catch (err) {
        console.error("Error in guildMemberAdd:", err);
    }
});

// !invites command
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!invites')) {
        const user = message.mentions.users.first() || message.author;

        let total = 0;
        for (const code in inviteData) {
            if (inviteData[code].inviter === user.id) {
                total += inviteData[code].uses;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle("📨 Invite Count")
            .setDescription(`<@${user.id}> has **${total}** invites.`)
            .setColor(0xFF9527)
            .setThumbnail(user.displayAvatarURL());

        message.channel.send({ embeds: [embed] });
    }

    // Leaderboard
    if (message.content === '!leaderboard') {
        const totals = {};

        for (const code in inviteData) {
            const inviter = inviteData[code].inviter;
            if (!inviter) continue;

            totals[inviter] = (totals[inviter] || 0) + inviteData[code].uses;
        }

        const sorted = Object.entries(totals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        let desc = sorted.map(([id, count], i) => {
            const user = message.guild.members.cache.get(id);
            const tag = user ? user.user.tag : `Unknown User (${id})`;
            return `**${i + 1}.** ${tag} — **${count}** invites`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setTitle("🏆 Invite Leaderboard")
            .setDescription(desc)
            .setColor(0xFFD700);

        message.channel.send({ embeds: [embed] });
    }
});

// Ticket system (unchanged)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'create_ticket') {
        const guild = interaction.guild;

        const channel = await guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: 0,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                }
            ]
        });

        await channel.send(`🎫 Ticket created by <@${interaction.user.id}>`);

        const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`close_ticket_${channel.id}`)
                .setLabel('Close Ticket')
                .setStyle(ButtonStyle.Danger)
        );

        await channel.send({
            content: 'Click the button below to close this ticket.',
            components: [closeRow]
        });

        interaction.reply({ content: `Your ticket has been created: ${channel}`, ephemeral: true });
    }
});

// Ticket closing (unchanged)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('close_ticket_')) {
        await interaction.deferReply({ ephemeral: true });

        const ticketChannelId = interaction.customId.replace('close_ticket_', '');
        const ticketChannel = await client.channels.fetch(ticketChannelId);

        if (!ticketChannel) {
            return interaction.editReply({ content: 'Could not find ticket channel.' });
        }

        let allMessages = [];
        let lastMessageId;

        while (true) {
            const options = { limit: 100 };
            if (lastMessageId) options.before = lastMessageId;

            const messages = await ticketChannel.messages.fetch(options);
            if (messages.size === 0) break;

            allMessages.push(...messages.values());
            lastMessageId = messages.last().id;
        }

        allMessages.reverse();

        const chatlogChannel = await client.channels.fetch(chatlogChannelId);

        if (chatlogChannel) {
            const chatlogEmbed = new EmbedBuilder()
                .setTitle(`📋 Chat Log - ${ticketChannel.name}`)
                .setDescription(
                    allMessages.slice(0, 10).map(msg =>
                        `**${msg.author.tag}**: ${msg.content.substring(0, 100)}`
                    ).join('\n') || 'No messages'
                )
                .addFields(
                    { name: 'Ticket Channel', value: `<#${ticketChannelId}>`, inline: true },
                    { name: 'Total Messages', value: `${allMessages.length}`, inline: true },
                    { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Closed At', value: `<t:${Math.floor(Date.now() / 1000)}:f>` }
                )
                .setColor(0xff0000);

            const chatContent = allMessages.map(msg =>
                `[${msg.createdAt.toLocaleString()}] ${msg.author.tag}: ${msg.content}`
            ).join('\n');

            const buffer = Buffer.from(chatContent, 'utf-8');

            await chatlogChannel.send({
                embeds: [chatlogEmbed],
                files: [{ attachment: buffer, name: `${ticketChannel.name}-chatlog.txt` }]
            });
        }

        interaction.editReply({ content: 'Ticket is being closed...' });

        setTimeout(() => ticketChannel.delete(), 1000);
    }
});

// LOGIN
client.login(process.env.TOKEN);
