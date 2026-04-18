const {
    Client,
    GatewayIntentBits,
    Partials,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    EmbedBuilder,
    ActivityType
} = require('discord.js');
const fs = require('fs');

const ticketLogChannelId = "1488962491818967301";
const chatlogChannelId = "1488962511150649364";
const welcomeChannelId = "1488858798356693165";
const invitesChannelId = "1488858798356693167";

const INVITE_FILE = './invites.json';
const WARNS_FILE = './warns.json';

// ----------------------
// STORE: INVITES
// ----------------------
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

// ----------------------
// STORE: WARNINGS
// ----------------------
let warnStore = {};

if (fs.existsSync(WARNS_FILE)) {
    try {
        const raw = fs.readFileSync(WARNS_FILE, 'utf8');
        warnStore = JSON.parse(raw);
    } catch (e) {
        console.error('Error reading warns.json, starting fresh:', e);
    }
}

function saveWarns() {
    fs.writeFileSync(WARNS_FILE, JSON.stringify(warnStore, null, 4));
}

// ----------------------
// CLIENT
// ----------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Channel]
});

let activeInvites = new Map();

// ----------------------
// HELPER: Check Permissions
// ----------------------
function hasPermission(member, flag) {
    return member.permissions.has(flag);
}

// ----------------------
// READY
// ----------------------
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    client.user.setPresence({
        activities: [
            {
                name: 'discord.gg/d4antxt',
                type: ActivityType.Watching
            }
        ],
        status: 'online'
    });

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

// ----------------------
// INVITE EVENTS
// ----------------------
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
// MEMBER JOIN
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
    const args = content.split(/\s+/);
    const command = args[0].toLowerCase();

    // ----------------------
    // INVITE COMMANDS
    // ----------------------
    if (command === '!invites') {
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

    if (command === '!leaderboard') {
        const entries = Object.entries(store.userTotals);
        if (entries.length === 0) {
            await message.channel.send('No invite data has been recorded yet.');
            return;
        }

        const sorted = entries.sort((a, b) => b[1] - a[1]).slice(0, 10);
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

    if (command === '!ticketpanel') {
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

        await message.channel.send({ embeds: [embed], components: [row] });
        return;
    }

    // ----------------------
    // USERINFO
    // ----------------------
    if (command === '!userinfo') {
        const mentionedUser = message.mentions.users.first();
        let targetMember;

        try {
            if (mentionedUser) {
                targetMember = await message.guild.members.fetch(mentionedUser.id);
            } else {
                targetMember = await message.guild.members.fetch(message.author.id);
            }
        } catch {
            await message.channel.send('❌ Could not find that user.');
            return;
        }

        const user = targetMember.user;
        const roles = targetMember.roles.cache
            .filter(r => r.id !== message.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(r => `<@&${r.id}>`)
            .slice(0, 10)
            .join(', ') || 'None';

        const warns = warnStore[user.id] || [];
        const totalInvites = store.userTotals[user.id] || 0;

        const embed = new EmbedBuilder()
            .setTitle(`👤 User Info — ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '🆔 User ID', value: user.id, inline: true },
                { name: '🤖 Bot', value: user.bot ? 'Yes' : 'No', inline: true },
                { name: '📅 Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: false },
                { name: '📥 Joined Server', value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:F>`, inline: false },
                { name: '🎨 Nickname', value: targetMember.nickname || 'None', inline: true },
                { name: '📨 Invites', value: `${totalInvites}`, inline: true },
                { name: '⚠️ Warnings', value: `${warns.length}`, inline: true },
                { name: `🎭 Roles (${targetMember.roles.cache.size - 1})`, value: roles, inline: false }
            )
            .setColor(targetMember.displayHexColor || 0xFF9527)
            .setFooter({ text: `Requested by ${message.author.tag}` })
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
        return;
    }

    // ----------------------
    // SERVERINFO
    // ----------------------
    if (command === '!serverinfo') {
        const guild = message.guild;
        await guild.fetch();

        const totalMembers = guild.memberCount;
        const onlineMembers = guild.members.cache.filter(m => m.presence?.status !== 'offline' && m.presence?.status !== undefined).size;
        const botCount = guild.members.cache.filter(m => m.user.bot).size;
        const humanCount = totalMembers - botCount;
        const channelCount = guild.channels.cache.size;
        const roleCount = guild.roles.cache.size - 1;
        const emojiCount = guild.emojis.cache.size;
        const boostCount = guild.premiumSubscriptionCount || 0;
        const boostTier = guild.premiumTier || 0;

        const verificationLevels = {
            0: 'None',
            1: 'Low',
            2: 'Medium',
            3: 'High',
            4: 'Very High'
        };

        const embed = new EmbedBuilder()
            .setTitle(`🏠 Server Info — ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '🆔 Server ID', value: guild.id, inline: true },
                { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false },
                { name: '👥 Members', value: `Total: **${totalMembers}**\nHumans: **${humanCount}**\nBots: **${botCount}**`, inline: true },
                { name: '💬 Channels', value: `${channelCount}`, inline: true },
                { name: '🎭 Roles', value: `${roleCount}`, inline: true },
                { name: '😄 Emojis', value: `${emojiCount}`, inline: true },
                { name: '🚀 Boosts', value: `${boostCount} (Tier ${boostTier})`, inline: true },
                { name: '🔒 Verification', value: verificationLevels[guild.verificationLevel] || 'Unknown', inline: true }
            )
            .setColor(0xFF9527)
            .setFooter({ text: `Requested by ${message.author.tag}` })
            .setTimestamp();

        if (guild.bannerURL()) {
            embed.setImage(guild.bannerURL({ size: 1024 }));
        }

        await message.channel.send({ embeds: [embed] });
        return;
    }

    // ----------------------
    // BAN
    // ----------------------
    if (command === '!ban') {
        if (!hasPermission(message.member, PermissionsBitField.Flags.BanMembers)) {
            return message.channel.send('❌ You don\'t have permission to ban members.');
        }

        const target = message.mentions.members.first();
        if (!target) return message.channel.send('❌ Please mention a user to ban. Usage: `!ban @user [reason]`');

        if (!target.bannable) {
            return message.channel.send('❌ I cannot ban this user. They may have a higher role than me.');
        }

        const reason = args.slice(2).join(' ') || 'No reason provided';

        try {
            await target.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🔨 You have been banned')
                        .setDescription(`You were banned from **${message.guild.name}**`)
                        .addFields({ name: 'Reason', value: reason })
                        .setColor(0xff0000)
                        .setTimestamp()
                ]
            }).catch(() => {});

            await target.ban({ reason: `${message.author.tag}: ${reason}` });

            const embed = new EmbedBuilder()
                .setTitle('🔨 Member Banned')
                .addFields(
                    { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
                    { name: 'Moderator', value: message.author.tag, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setColor(0xff0000)
                .setThumbnail(target.user.displayAvatarURL())
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
        } catch (err) {
            console.error('Ban error:', err);
            message.channel.send('❌ Failed to ban the user.');
        }
        return;
    }

    // ----------------------
    // KICK
    // ----------------------
    if (command === '!kick') {
        if (!hasPermission(message.member, PermissionsBitField.Flags.KickMembers)) {
            return message.channel.send('❌ You don\'t have permission to kick members.');
        }

        const target = message.mentions.members.first();
        if (!target) return message.channel.send('❌ Please mention a user to kick. Usage: `!kick @user [reason]`');

        if (!target.kickable) {
            return message.channel.send('❌ I cannot kick this user. They may have a higher role than me.');
        }

        const reason = args.slice(2).join(' ') || 'No reason provided';

        try {
            await target.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('👢 You have been kicked')
                        .setDescription(`You were kicked from **${message.guild.name}**`)
                        .addFields({ name: 'Reason', value: reason })
                        .setColor(0xff8800)
                        .setTimestamp()
                ]
            }).catch(() => {});

            await target.kick(`${message.author.tag}: ${reason}`);

            const embed = new EmbedBuilder()
                .setTitle('👢 Member Kicked')
                .addFields(
                    { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
                    { name: 'Moderator', value: message.author.tag, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setColor(0xff8800)
                .setThumbnail(target.user.displayAvatarURL())
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
        } catch (err) {
            console.error('Kick error:', err);
            message.channel.send('❌ Failed to kick the user.');
        }
        return;
    }

    // ----------------------
    // TIMEOUT / MUTE
    // ----------------------
    if (command === '!timeout' || command === '!mute') {
        if (!hasPermission(message.member, PermissionsBitField.Flags.ModerateMembers)) {
            return message.channel.send('❌ You don\'t have permission to timeout members.');
        }

        const target = message.mentions.members.first();
        if (!target) return message.channel.send('❌ Please mention a user. Usage: `!timeout @user <duration> [reason]`\nDuration examples: `10m`, `1h`, `1d`');

        const durationStr = args[2];
        if (!durationStr) return message.channel.send('❌ Please provide a duration. Examples: `10m`, `1h`, `2d`');

        const durationMs = parseDuration(durationStr);
        if (!durationMs) return message.channel.send('❌ Invalid duration format. Use `10m`, `1h`, `2d`, etc.');

        const maxTimeout = 28 * 24 * 60 * 60 * 1000;
        if (durationMs > maxTimeout) return message.channel.send('❌ Timeout cannot exceed 28 days.');

        const reason = args.slice(3).join(' ') || 'No reason provided';

        try {
            await target.timeout(durationMs, `${message.author.tag}: ${reason}`);

            await target.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🔇 You have been timed out')
                        .setDescription(`You were timed out in **${message.guild.name}**`)
                        .addFields(
                            { name: 'Duration', value: durationStr },
                            { name: 'Reason', value: reason }
                        )
                        .setColor(0xffcc00)
                        .setTimestamp()
                ]
            }).catch(() => {});

            const embed = new EmbedBuilder()
                .setTitle('🔇 Member Timed Out')
                .addFields(
                    { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
                    { name: 'Moderator', value: message.author.tag, inline: true },
                    { name: 'Duration', value: durationStr, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setColor(0xffcc00)
                .setThumbnail(target.user.displayAvatarURL())
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
        } catch (err) {
            console.error('Timeout error:', err);
            message.channel.send('❌ Failed to timeout the user.');
        }
        return;
    }

    // ----------------------
    // UNTIMEOUT / UNMUTE
    // ----------------------
    if (command === '!untimeout' || command === '!unmute') {
        if (!hasPermission(message.member, PermissionsBitField.Flags.ModerateMembers)) {
            return message.channel.send('❌ You don\'t have permission to remove timeouts.');
        }

        const target = message.mentions.members.first();
        if (!target) return message.channel.send('❌ Please mention a user to untimeout.');

        try {
            await target.timeout(null);

            const embed = new EmbedBuilder()
                .setTitle('🔊 Timeout Removed')
                .addFields(
                    { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
                    { name: 'Moderator', value: message.author.tag, inline: true }
                )
                .setColor(0x00cc44)
                .setThumbnail(target.user.displayAvatarURL())
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
        } catch (err) {
            console.error('Untimeout error:', err);
            message.channel.send('❌ Failed to remove timeout.');
        }
        return;
    }

    // ----------------------
    // WARN
    // ----------------------
    if (command === '!warn') {
        if (!hasPermission(message.member, PermissionsBitField.Flags.ModerateMembers)) {
            return message.channel.send('❌ You don\'t have permission to warn members.');
        }

        const target = message.mentions.members.first();
        if (!target) return message.channel.send('❌ Please mention a user to warn. Usage: `!warn @user [reason]`');

        const reason = args.slice(2).join(' ') || 'No reason provided';
        const userId = target.user.id;

        if (!warnStore[userId]) warnStore[userId] = [];

        warnStore[userId].push({
            reason,
            moderator: message.author.tag,
            timestamp: Date.now()
        });

        saveWarns();

        const warnCount = warnStore[userId].length;

        await target.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('⚠️ You have been warned')
                    .setDescription(`You received a warning in **${message.guild.name}**`)
                    .addFields(
                        { name: 'Reason', value: reason },
                        { name: 'Total Warnings', value: `${warnCount}` }
                    )
                    .setColor(0xffcc00)
                    .setTimestamp()
            ]
        }).catch(() => {});

        const embed = new EmbedBuilder()
            .setTitle('⚠️ Member Warned')
            .addFields(
                { name: 'User', value: `${target.user.tag} (${userId})`, inline: true },
                { name: 'Moderator', value: message.author.tag, inline: true },
                { name: 'Reason', value: reason, inline: false },
                { name: 'Total Warnings', value: `${warnCount}`, inline: true }
            )
            .setColor(0xffcc00)
            .setThumbnail(target.user.displayAvatarURL())
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });

        // Auto-punish thresholds
        if (warnCount === 3) {
            await target.timeout(30 * 60 * 1000, 'Auto-timeout: 3 warnings').catch(() => {});
            await message.channel.send(`⚠️ **${target.user.tag}** has reached **3 warnings** and has been automatically timed out for **30 minutes**.`);
        } else if (warnCount === 5) {
            await target.timeout(24 * 60 * 60 * 1000, 'Auto-timeout: 5 warnings').catch(() => {});
            await message.channel.send(`⚠️ **${target.user.tag}** has reached **5 warnings** and has been automatically timed out for **24 hours**.`);
        } else if (warnCount >= 7) {
            await target.ban({ reason: 'Auto-ban: 7+ warnings' }).catch(() => {});
            await message.channel.send(`🔨 **${target.user.tag}** has reached **${warnCount} warnings** and has been automatically **banned**.`);
        }

        return;
    }

    // ----------------------
    // WARNINGS LIST
    // ----------------------
    if (command === '!warnings' || command === '!warns') {
        const target = message.mentions.users.first() || message.author;
        const warns = warnStore[target.id] || [];

        if (warns.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle(`⚠️ Warnings — ${target.tag}`)
                .setDescription('This user has no warnings.')
                .setColor(0x00cc44)
                .setThumbnail(target.displayAvatarURL());
            return message.channel.send({ embeds: [embed] });
        }

        const warnLines = warns.map((w, i) =>
            `**#${i + 1}** — ${w.reason}\n> Mod: ${w.moderator} • <t:${Math.floor(w.timestamp / 1000)}:R>`
        ).join('\n\n');

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ Warnings — ${target.tag}`)
            .setDescription(warnLines)
            .setColor(0xffcc00)
            .setFooter({ text: `Total: ${warns.length} warning${warns.length !== 1 ? 's' : ''}` })
            .setThumbnail(target.displayAvatarURL());

        await message.channel.send({ embeds: [embed] });
        return;
    }

    // ----------------------
    // CLEAR WARNINGS
    // ----------------------
    if (command === '!clearwarnings' || command === '!clearwarns') {
        if (!hasPermission(message.member, PermissionsBitField.Flags.ModerateMembers)) {
            return message.channel.send('❌ You don\'t have permission to clear warnings.');
        }

        const target = message.mentions.users.first();
        if (!target) return message.channel.send('❌ Please mention a user. Usage: `!clearwarnings @user`');

        warnStore[target.id] = [];
        saveWarns();

        const embed = new EmbedBuilder()
            .setTitle('✅ Warnings Cleared')
            .setDescription(`All warnings for **${target.tag}** have been cleared.`)
            .addFields({ name: 'Moderator', value: message.author.tag, inline: true })
            .setColor(0x00cc44)
            .setThumbnail(target.displayAvatarURL())
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
        return;
    }

    // ----------------------
    // PURGE
    // ----------------------
    if (command === '!purge') {
        if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) {
            return message.channel.send('❌ You don\'t have permission to delete messages.');
        }

        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.channel.send('❌ Please provide a number between 1 and 100. Usage: `!purge <amount>`');
        }

        try {
            await message.delete();
            const deleted = await message.channel.bulkDelete(amount, true);

            const reply = await message.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`🗑️ Deleted **${deleted.size}** message${deleted.size !== 1 ? 's' : ''}.`)
                        .setColor(0xff0000)
                ]
            });

            setTimeout(() => reply.delete().catch(() => {}), 4000);
        } catch (err) {
            console.error('Purge error:', err);
            message.channel.send('❌ Failed to delete messages. Messages older than 14 days cannot be bulk deleted.');
        }
        return;
    }

    // ----------------------
    // UNBAN
    // ----------------------
    if (command === '!unban') {
        if (!hasPermission(message.member, PermissionsBitField.Flags.BanMembers)) {
            return message.channel.send('❌ You don\'t have permission to unban members.');
        }

        const userId = args[1];
        if (!userId) return message.channel.send('❌ Please provide a user ID. Usage: `!unban <userID>`');

        try {
            await message.guild.members.unban(userId);

            const embed = new EmbedBuilder()
                .setTitle('✅ Member Unbanned')
                .addFields(
                    { name: 'User ID', value: userId, inline: true },
                    { name: 'Moderator', value: message.author.tag, inline: true }
                )
                .setColor(0x00cc44)
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
        } catch (err) {
            console.error('Unban error:', err);
            message.channel.send('❌ Failed to unban. Make sure the user ID is correct and the user is actually banned.');
        }
        return;
    }

    // ----------------------
    // SLOWMODE
    // ----------------------
    if (command === '!slowmode') {
        if (!hasPermission(message.member, PermissionsBitField.Flags.ManageChannels)) {
            return message.channel.send('❌ You don\'t have permission to manage channels.');
        }

        const seconds = parseInt(args[1]);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
            return message.channel.send('❌ Please provide a number between 0 and 21600 seconds. Usage: `!slowmode <seconds>`');
        }

        try {
            await message.channel.setRateLimitPerUser(seconds);
            const embed = new EmbedBuilder()
                .setDescription(seconds === 0
                    ? '✅ Slowmode has been **disabled** in this channel.'
                    : `✅ Slowmode set to **${seconds} second${seconds !== 1 ? 's' : ''}** in this channel.`
                )
                .setColor(0x00cc44);

            await message.channel.send({ embeds: [embed] });
        } catch (err) {
            console.error('Slowmode error:', err);
            message.channel.send('❌ Failed to set slowmode.');
        }
        return;
    }

    // ----------------------
    // ADD EMOJI
    // ----------------------
    if (command === '!add') {
        if (!hasPermission(message.member, PermissionsBitField.Flags.ManageGuildExpressions)) {
            return message.channel.send('❌ You don\'t have permission to manage emojis.');
        }

        const emojiArg = args[1];
        if (!emojiArg) return message.channel.send('❌ Please provide an emoji. Usage: `!add <emoji>`');

        try {
            // Check if it's a custom emoji
            const customEmojiRegex = /<a?:(\w+):(\d+)>/;
            const match = emojiArg.match(customEmojiRegex);

            if (match) {
                const emojiName = match[1];
                const emojiId = match[2];
                const isAnimated = emojiArg.startsWith('<a:');
                
                // Build the emoji URL
                const format = isAnimated ? 'gif' : 'png';
                const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${format}`;

                // Download the emoji and create it
                const createdEmoji = await message.guild.emojis.create(emojiUrl, emojiName);

                const embed = new EmbedBuilder()
                    .setTitle('✅ Emoji Added')
                    .setDescription(`Successfully added **${createdEmoji}** to the server!`)
                    .addFields(
                        { name: 'Emoji Name', value: emojiName, inline: true },
                        { name: 'Added By', value: message.author.tag, inline: true }
                    )
                    .setColor(0x00cc44)
                    .setThumbnail(emojiUrl)
                    .setTimestamp();

                await message.channel.send({ embeds: [embed] });
            } else {
                await message.channel.send('❌ Please provide a valid custom emoji. Usage: `!add <emoji>`');
            }
        } catch (err) {
            console.error('Add emoji error:', err);
            
            let errorMsg = '❌ Failed to add emoji.';
            if (err.message.includes('Maximum number')) {
                errorMsg = '❌ Server has reached maximum emoji limit.';
            } else if (err.message.includes('Invalid')) {
                errorMsg = '❌ Invalid emoji provided.';
            }
            
            message.channel.send(errorMsg);
        }
        return;
    }

    // ----------------------
    // HELP
    // ----------------------
    if (command === '!help') {
        const embed = new EmbedBuilder()
            .setTitle('📖 Bot Commands')
            .setColor(0xFF9527)
            .addFields(
                {
                    name: '🎫 Tickets',
                    value: '`!ticketpanel` — Post the ticket creation panel'
                },
                {
                    name: '📨 Invites',
                    value: '`!invites [@user]` — Check invite count\n`!leaderboard` — Top 10 inviters'
                },
                {
                    name: '📊 Info',
                    value: '`!userinfo [@user]` — View user info\n`!serverinfo` — View server info'
                },
                {
                    name: '😄 Emojis',
                    value: '`!add <emoji>` — Add a custom emoji to the server'
                },
                {
                    name: '🔨 Moderation',
                    value: [
                        '`!ban @user [reason]` — Ban a member',
                        '`!unban <userID>` — Unban a member',
                        '`!kick @user [reason]` — Kick a member',
                        '`!timeout @user <duration> [reason]` — Timeout a member',
                        '`!untimeout @user` — Remove timeout',
                        '`!warn @user [reason]` — Warn a member',
                        '`!warnings [@user]` — View warnings',
                        '`!clearwarnings @user` — Clear all warnings',
                        '`!purge <1-100>` — Bulk delete messages',
                        '`!slowmode <seconds>` — Set channel slowmode'
                    ].join('\n')
                },
                {
                    name: '⚠️ Auto-Punishment',
                    value: '3 warns → 30m timeout\n5 warns → 24h timeout\n7+ warns → Ban'
                }
            )
            .setFooter({ text: `Requested by ${message.author.tag}` })
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
        return;
    }
});

// ----------------------
// DURATION PARSER
// ----------------------
function parseDuration(str) {
    const match = str.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    return value * multipliers[unit];
}

// ----------------------
// INTERACTIONS (TICKETS)
// ----------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'create_ticket') {
        await interaction.deferReply({ ephemeral: true });

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
                    id: "1490715225140494368", // MOD ROLE
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

        await interaction.editReply({ content: `Your ticket has been created: ${channel}` });
        return;
    }

    // CLOSE TICKET
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
