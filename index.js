const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { token, ticketLogChannelId, chatlogChannelId } = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Send ticket panel
client.on('messageCreate', async (message) => {
    if (message.content === '!ticketpanel') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('Create Ticket')
                .setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({
            content: 'Click the button below to create a ticket.',
            components: [row]
        });
    }
});

// Handle ticket creation
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'create_ticket') {
        const guild = interaction.guild;

        const channel = await guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: 0, // text channel
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
        
        // Add close button to ticket channel
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
        
        // Log ticket creation
        const logChannel = await client.channels.fetch(ticketLogChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('🎫 Ticket Created')
                .setDescription(`A new ticket has been created`)
                .addFields(
                    { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Channel', value: `<#${channel.id}>`, inline: true },
                    { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: false }
                )
                .setColor(0x0099ff)
                .setThumbnail(interaction.user.displayAvatarURL());
            
            await logChannel.send({ embeds: [logEmbed] });
        }
        
        await interaction.reply({ content: `Your ticket has been created: ${channel}`, ephemeral: true });
    }
});

// Handle ticket closing
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('close_ticket_')) {
        const ticketChannelId = interaction.customId.replace('close_ticket_', '');
        const ticketChannel = await client.channels.fetch(ticketChannelId);
        
        if (!ticketChannel) {
            await interaction.reply({ content: 'Could not find ticket channel.', ephemeral: true });
            return;
        }

        try {
            // Fetch all messages from the ticket channel
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

            // Reverse to get chronological order
            allMessages.reverse();

            // Get the chatlog channel
            const chatlogChannel = await client.channels.fetch(chatlogChannelId);
            if (chatlogChannel) {
                // Create embed with chat log
                const chatlogEmbed = new EmbedBuilder()
                    .setTitle(`📋 Chat Log - ${ticketChannel.name}`)
                    .setDescription(allMessages.slice(0, 10).map(msg => 
                        `**${msg.author.tag}**: ${msg.content.substring(0, 100)}`
                    ).join('\n') || 'No messages')
                    .addFields(
                        { name: 'Ticket Channel', value: `<#${ticketChannelId}>`, inline: true },
                        { name: 'Total Messages', value: `${allMessages.length}`, inline: true },
                        { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Closed At', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: false }
                    )
                    .setColor(0xff0000)
                    .setThumbnail(interaction.user.displayAvatarURL());

                // Send full chat log as text file if there are messages
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

            await interaction.reply({ content: 'Ticket is being closed...', ephemeral: true });
            
            // Delete the ticket channel after a short delay
            setTimeout(async () => {
                await ticketChannel.delete('Ticket closed');
            }, 1000);

        } catch (error) {
            console.error('Error closing ticket:', error);
            await interaction.reply({ content: 'Error closing ticket.', ephemeral: true });
        }
    }
});

client.login(token);