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

const ticketLogChannelId = "1488962491818967301";
const chatlogChannelId = "1488962511150649364";
const welcomeChannelId = "1488858798356693165";
const invitesChannelId = "1488858798356693167";

// Map to store user invite counts: userId -> inviteCount
const userInvites = new Map();

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

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    
    // Initialize invite counts on bot startup
    try {
        const guild = client.guilds.cache.first();
        if (guild) {
            const invites = await guild.invites.fetch();
            invites.forEach(invite => {
                if (invite.inviter) {
                    const currentCount = userInvites.get(invite.inviter.id) || 0;
                    userInvites.set(invite.inviter.id, currentCount + invite.uses);
                }
            });
            console.log('Invite counts initialized');
        }
    } catch (error) {
        console.error('Error initializing invites:', error);
    }
});

client.on('guildMemberAdd', async (member) => {
    try {
        // Assign Community role to new member
        try {
            const communityRole = member.guild.roles.cache.find(role => role.name === 'Community');
            if (communityRole) {
                await member.roles.add(communityRole);
                console.log(`Assigned Community role to ${member.user.tag}`);
            } else {
                console.log('Community role not found in this guild');
            }
        } catch (roleError) {
            console.error('Error assigning Community role:', roleError);
        }

        // Send welcome message
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

        // Check who invited them
        const invites = await member.guild.invites.fetch();
        let inviter = null;
        let inviteCode = null;

        for (const invite of invites.values()) {
            if (invite.inviter && userInvites.has(invite.inviter.id)) {
                const previousUses = userInvites.get(invite.inviter.id) || 0;
                if (invite.uses > previousUses) {
                    inviter = invite.inviter;
                    inviteCode = invite.code;
                    userInvites.set(inviter.id, invite.uses);
                    break;
                }
            }
        }

        // Send invite logging message
        if (inviter) {
            const inviteCount = userInvites.get(inviter.id) || 0;
            const invitesChannel = await client.channels.fetch(invitesChannelId);

            if (invitesChannel) {
                const inviteEmbed = new EmbedBuilder()
                    .setTitle('📊 Member Invited')
                    .setDescription(`<@${inviter.id}> invited <@${member.id}>`)
                    .addFields(
                        { name: 'Inviter', value: inviter.tag, inline: true },
                        { name: 'New Member', value: member.user.tag, inline: true },
                        { name: 'Total Invites', value: `${inviteCount}`, inline: true },
                        { name: 'Invite Code', value: inviteCode || 'Unknown', inline: true },
                        { name: 'Joined At', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:f>` }
                    )
                    .setColor(0x0099ff)
                    .setThumbnail(member.user.displayAvatarURL());

                await invitesChannel.send({ embeds: [inviteEmbed] });
            }
        }
    } catch (error) {
        console.error('Error handling new member:', error);
    }
});

client.on('messageCreate', async (message) => {
    if (message.content === '!ticketpanel') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('Create Ticket')
                .setStyle(ButtonStyle.Primary)
        );

        const embed = new EmbedBuilder()
            .setTitle('D4an Texture Tickets')
            .setDescription('Click the button below to receive assistance from our staff team with any issue.')
            .setImage('https://media.discordapp.net/attachments/1488907627114135702/1488926655115169883/discordbanner.png?ex=69ce8e81&is=69cd3d01&hm=c248de3403985322e462c5bb473c5e308171a43292e9ffc39565ccf6274cf8e8&=&format=webp&quality=lossless&width=1027&height=560') // Replace with your image URL
            .setColor(0xFF9527)
            .setFooter({ text: 'Support Team' });

        await message.channel.send({
            embeds: [embed],
            components: [row]
        });
    }
});

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
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

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

            // Fetch all messages from the ticket channel
            while (true) {
                try {
                    const options = { limit: 100 };
                    if (lastMessageId) options.before = lastMessageId;

                    const messages = await ticketChannel.messages.fetch(options);
                    if (messages.size === 0) break;

                    allMessages.push(...messages.values());
                    lastMessageId = messages.last().id;
                } catch (fetchError) {
                    console.error('Error fetching messages:', fetchError);
                    break;
                }
            }

            allMessages.reverse();

            // Send chatlog to chatlog channel if it exists
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

            // Delete the ticket channel after a short delay
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

// -------------------------------
// LOGIN (MUST BE LAST)
// -------------------------------
client.login(process.env.TOKEN);
