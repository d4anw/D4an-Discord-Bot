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

const ticketLogChannelId = "1488962491818967301";
const chatlogChannelId = "1488962511150649364";
const welcomeChannelId = "1488858798356693165";
const invitesChannelId = "1488858798356693167";

const INVITE_FILE = './invites.json';

let store = {
    invites: {},
    userTotals: {}
};

if (fs.existsSync(INVITE_FILE)) {
    try {
        const raw = fs.readFileSync(INVITE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        store.invites = parsed.invites || {};
        store.userTotals = parsed.userTotals || {};
    } catch (e) {
        console.error('Error reading invites.json, starting fresh:', e);
    }
}

function saveStore() {
    fs.writeFileSync(INVITE_FILE, JSON.stringify(store, null, 4));
}

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

let activeInvites = new Map();

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const guild = client.guilds.cache.first();
    if (!guild) {
        console.log('No guild found in cache.');
        return;
    }

    try {
        const invites = await guild.invites.fetch();
        invites.forEach(inv => {
            activeInvites.set(inv.code, inv.uses);

            if (!store.invites[inv.code]) {
                store.invites[inv.code] = {
                    inviter: inv.inviter?.id || null,
                    uses: inv.uses || 0
                };
            } else {
                store.invites[inv.code].uses = inv.uses || 0;
            }
        });

        saveStore();
        console.log('Invite tracking initialized.');
    } catch (err) {
        console.error('Error initializing invites:', err);
    }
});

client.on('inviteCreate', invite => {
    activeInvites.set(invite.code, invite.uses);

    if (!store.invites[invite.code]) {
        store.invites[invite.code] = {
            inviter: invite.inviter?.id || null,
            uses: invite.uses || 0
        };
    } else {
        store.invites[invite.code].inviter = invite.inviter?.id || null;
        store.invites[invite.code].uses = invite.uses || 0;
    }

    saveStore();
});

client.on('inviteDelete', invite => {
    activeInvites.delete(invite.code);
    saveStore();
});

// ----------------------
// MEMBER JOIN / INVITES
// ----------------------
client.on('guildMemberAdd', async (member) => {
    try {
        const communityRole = member.guild.roles.cache.find(r => r.name === 'Community');
        if (communityRole) {
            await member.roles.add(communityRole);
        }

        const welcomeChannel = await client.channels.fetch(welcomeChannelId);
        if (welcomeChannel) {
            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`Welcome to the server, ${member.user.username}!`)
                .setDescription(`We're glad to have you here! 🎉\n\nFeel free to explore and don't hesitate to ask if you need help.`)
                .setColor(0xFF9527)
                .setThumbnail(member.user.displayAvatarURL())
                .setFooter({ text: `Member #${member.guild.memberCount}` });

            await welcomeChannel.send({
                content: `<@${member.id}>`,
                embeds: [welcomeEmbed]
            });
        }

        let usedInvite = null;
        try {
            const newInvites = await member.guild.invites.fetch();

            newInvites.forEach(inv => {
                const oldUses = activeInvites.get(inv.code) || 0;
                if (inv.uses > oldUses) {
                    usedInvite = inv;
                }
            });

            newInvites.forEach(inv => {
                activeInvites.set(inv.code, inv.uses);
            });
        } catch (fetchError) {
            console.error('Error fetching invites on join:', fetchError);
        }

        let inviter = null;
        let inviteCode = null;

        if (usedInvite) {
            inviter = usedInvite.inviter || null;
            inviteCode = usedInvite.code;

            if (!store.invites[inviteCode]) {
                store.invites[inviteCode] = {
                    inviter: inviter ? inviter.id : null,
                    uses: 0
                };
            }

            store.invites[inviteCode].uses += 1;

            if (inviter) {
                if (!store.userTotals[inviter.id]) {
                    store.userTotals[inviter.id] = 0;
                }
                store.userTotals[inviter.id] += 1;
            }

            saveStore();
        } else {
            inviteCode = 'Expired/Deleted';
        }

        const invitesChannel = await client.channels.fetch(invitesChannelId);
        if (invitesChannel) {
            const inviteEmbed = new EmbedBuilder()
                .setTitle('📊 Member Invited')
                .setDescription(
                    inviter
                        ? `<@${inviter.id}> invited <@${member.id}>`
                        : `<@${member.id}> joined using an expired or deleted invite`
                )
                .addFields(
                    { name: 'Inviter', value: inviter ? inviter.tag : 'Unknown', inline: true },
                    { name: 'New Member', value: member.user.tag, inline: true },
                    { name: 'Invite Code', value: inviteCode || 'Unknown', inline: true },
                    { name: 'Joined At', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:f>` }
                )
                .setColor(0x0099ff)
                .setThumbnail(member.user.displayAvatarURL());

            await invitesChannel.send({ embeds: [inviteEmbed] });
        }

    } catch (error) {
        console.error('Error handling new member:', error);
    }
});

// ----------------------
// MESSAGE COMMANDS
// ----------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();

    if (content.startsWith('!invites')) {
        const mentionedUser = message.mentions.users.first();
        const targetUser = mentionedUser || message.author;

        const totalInvites = store.userTotals[targetUser.id] || 0;

        const embed = new EmbedBuilder()
            .setTitle('📨 Invite Count')
            .setDescription(
                mentionedUser
                    ? `<@${targetUser.id}> has **${totalInvites}** invite${totalInvites !== 1 ? 's' : ''}.`
                    : `You have **${totalInvites}** invite${totalInvites !== 1 ? 's' : ''}.`
            )
            .setColor(0xFF9527)
            .setThumbnail(targetUser.displayAvatarURL())
            .setFooter({ text: `Requested by ${message.author.tag}` });

        await message.channel.send({ embeds: [embed] });
        return;
    }

    if (content === '!leaderboard') {
        const entries = Object.entries(store.userTotals);
        if (entries.length === 0) {
            await message.channel.send('No invite data has been recorded yet.');
            return;
        }

        const sorted = entries
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const lines = [];
        for (let i = 0; i < sorted.length; i++) {
            const [userId, count] = sorted[i];
            let tag = `Unknown User (${userId})`;

            try {
                const member = await message.guild.members.fetch(userId).catch(() => null);
                if (member) {
                    tag = member.user.tag;
                } else {
                    const user = await client.users.fetch(userId).catch(() => null);
                    if (user) tag = user.tag;
                }
            } catch {}

            lines.push(`**${i + 1}.** ${tag} — **${count}** invite${count !== 1 ? 's' : ''}`);
        }

        const embed = new EmbedBuilder()
            .setTitle('🏆 Invite Leaderboard')
            .setDescription(lines.join('\n'))
            .setColor(0xFFD700)
            .setFooter({ text: `Requested by ${message.author.tag}` });

        await message.channel.send({ embeds: [embed] });
        return;
    }

    if (content === '!ticketpanel') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('Create Ticket')
                .setStyle(ButtonStyle.Primary)
        );

        const embed = new EmbedBuilder()
            .setTitle('D4an Texture Tickets')
            .setDescription('Click the button below to receive assistance from our staff team with any issue.')
            .setImage('https://media.discordapp.net/attachments/1488907627114135702/1488926655115169883/discordbanner.png')
            .setColor(0xFF9527)
            .setFooter({ text: 'Support Team' });

        await message.channel.send({
            embeds: [embed],
            components: [row]
        });
        return;
    }
});

// ----------------------
// INTERACTIONS (TICKETS)
// ----------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'create_ticket') {
        const guild = interaction.guild;

        const channel = await guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: 0,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                },
                {
                    id: "1490715225140494368",
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

        try {
            const logChannel = await client.channels.fetch(ticketLogChannelId);

            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🎫 Ticket Created')
                    .setDescription(`A new ticket has been created`)
                    .addFields(
                        { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
                        { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:f>` }
                    )
                    .setColor(0x0099ff)
                    .setThumbnail(interaction.user.displayAvatarURL());

                await logChannel.send({ embeds: [logEmbed] });
            }
        } catch (e) {
            console.log("Log channel error:", e);
        }

        await interaction.reply({ content: `Your ticket has been created: ${channel}`, ephemeral: true });
        return;
    }

    if (interaction.customId.startsWith('close_ticket_')) {
        await interaction.deferReply({ ephemeral: true });

        const ticketChannelId = interaction.customId.replace('close_ticket_', '');
        let ticketChannel;

        try {
            ticketChannel = await client.channels.fetch(ticketChannelId);
        } catch (error) {
            console.error('Error fetching ticket channel:', error);
            await interaction.editReply({ content: 'Could not find ticket channel.' });
            return;
        }

        if (!ticketChannel) {
            await interaction.editReply({ content: 'Could not find ticket channel.' });
            return;
        }

        try {
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

            try {
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
                        .setColor(0xff0000)
                        .setThumbnail(interaction.user.displayAvatarURL());

                    if (allMessages.length > 0) {
                        const chatContent = allMessages.map(msg =>
                            `[${msg.createdAt.toLocaleString()}] ${msg.author.tag}: ${msg.content}`
                        ).join('\n');

                        const buffer = Buffer.from(chatContent, 'utf-8');

                        await chatlogChannel.send({
                            embeds: [chatlogEmbed],
                            files: [{
                                attachment: buffer,
                                name: `${ticketChannel.name}-chatlog.txt`
                            }]
                        });
                    } else {
                        await chatlogChannel.send({ embeds: [chatlogEmbed] });
                    }
                }
            } catch (chatlogError) {
                console.error('Error with chatlog channel:', chatlogError);
            }

            await interaction.editReply({ content: 'Ticket is being closed...' });

            setTimeout(async () => {
                try {
                    await ticketChannel.delete('Ticket closed by ' + interaction.user.tag);
                } catch (deleteError) {
                    console.error('Error deleting channel:', deleteError);
                }
            }, 1000);

        } catch (error) {
            console.error('Error closing ticket:', error);
            await interaction.editReply({ content: `Error closing ticket: ${error.message}` });
        }
    }
});

client.login(process.env.TOKEN);
