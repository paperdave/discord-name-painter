const Discord = require('discord.js');
const fs = require('fs');
const Color = require('color');
const Long = require('long');
const Cache = require('node-cache');
const client = new Discord.Client({
  cacheGuilds: true,
	cacheChannels: false,
	cacheOverwrites: false,
	cacheRoles: true,
	cacheEmojis: false,
	cachePresences: false
});

function updateClientStatus() {
  client.user.setActivity(`!paint | ${client.guilds.cache.size} servers.`)
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  updateClientStatus();
});

const schedules = {}

const rateLimitCache = new Cache({
  stdTTL: 12
})
const rateLimitCache2 = new Cache({
  stdTTL: 230
})

async function cleanup(guild) {
  clearTimeout(schedules[guild.id]);
  let n = 0;
  const rolesToCheck = guild.roles.cache.filter(role => role.name.startsWith('#'));
  const allMembers = await guild.members.fetch();
  const colorUses = {};
  allMembers.forEach(x => {
    x.roles.cache.forEach(role => {
      if (role.name.startsWith('#')) {
        colorUses[role.id] = true;
      }
    });
  });
  await Promise.all(rolesToCheck.map(async (role) => {
    if (!colorUses[role.id]) {
      n++;
      await role.delete();
    }
  }));
  return n;
}

async function scheduleClean(guild) {
  if (!schedules[guild.id]) {
    return;
  }
  schedules[guild.id] = setTimeout(() => {
    cleanup(guild)
  }, 5 * 60 * 1000);
}

client.on('message', async (msg) => {
  if (msg.author.bot) return;

  if (msg.content.trim() === '!help') {
    msg.channel.send('Name Painter v2\n`!help` - cmd list\n`!paint` or `!color` - assign a color role **(available to all users)**\n`!clean-roles` - remove color roles no one has as the bot sometimes bugs')
  }
  if (msg.content.startsWith('!paint') || msg.content.startsWith('!color')) {
    if(rateLimitCache.get(msg.author.id)) {
      msg.channel.send('> **Rate Limited**: This command can only be used every 12 seconds (per user).')
    }

    const args = msg.content.split(' ');
    args.shift();

    if (args.length === 0) {
      msg.channel.send('> **Usage**: !paint <color>\n> Where <color> is any valid HEX or CSS color value.')
      return;
    }

    const input = args.join(' ');
    let color;
    try {
      color = Color(input);
    } catch (error) {
      try {
        color = Color('#' + input);
      } catch (error) {
        msg.channel.send(`> Could not get a color from \`\`${input.substring(0, 500).replace(/\n/g, ' ').replace(/`/g, '\u2063`\u2063')}\`\``)
        return;
      }
    }

    const hex = color.hex();

    rateLimitCache.set(msg.author.id , 'true');

    let role = msg.guild.roles.cache.find(role => role.name === hex);

    if (!role) {
      if (msg.guild.roles.cache.length === 250) {
        msg.channel.send(`> **Error**: The Discord Role Limit of **250 Roles** has been hit!`);
        return;
      } else {
        try {
          role = await msg.guild.roles.create({
            data: {
              name: hex,
              color: color.rgbNumber(),
              permissions: 0,
            }
          });
        } catch (error) {
          msg.channel.send(`> **Error**: Could not create a role for you!`);
          return;
        }
      }
    }

    try {
      const rolesToRemove = msg.member.roles.cache.filter(role => role.name.startsWith('#') && role.name !== hex);
      rolesToRemove.map(async (role) => {
        msg.member.roles.remove(role);
      });
      await msg.member.roles.add(role);
      msg.channel.send(`> You\'ve been painted to **${hex}**`);

      scheduleClean(msg.guild)
    } catch (error) {
      msg.channel.send(`> **Error**: Could not assign your role, ask the server admin to check my permissions (Requires 'Manage Roles').`);
    }
  }
  if (msg.content.startsWith('!clean-roles')) {
    if(rateLimitCache2.get(msg.guild.id)) {
      msg.channel.send('> **Rate Limited**: This command can only be used every 230 seconds (per guild).\n> Note: role cleanup happens automatically up to 5 minutes after a !paint.')
      return;
    }
    rateLimitCache2.set(msg.guild.id , 'true');
    try {
      const n = await cleanup(msg.guild);
      msg.channel.send(`> Removed ${n} unused color roles.`);
    } catch (error) {
      console.log(error)
      msg.channel.send(`> **Error**: Could not assign your role, ask the server admin to check my permissions (Requires 'Manage Roles').`);
    }
  }
});

client.on('guildMemberRemove', (member) => {
  const rolesToRemove = member.roles.cache.filter(role => role.name.startsWith('#'));
  setTimeout(() => {
    rolesToRemove.map(async (role) => {
      if (role.members.cache.size === 0) {
        role.delete();
      }
    });
  }, 1000);
});

client.on('guildDelete', guild => {
	updateClientStatus();
});

function getDefaultChannel(guild) {
  // Check for a "general" channel, which is often default chat
  const generalChannel = guild.channels.cache.find(channel => channel.name === "general" && channel.permissionsFor(guild.client.user).has("SEND_MESSAGES"));
  if (generalChannel)
    return generalChannel;
  // Now we get into the heavy stuff: first channel in order where the bot can speak
  // hold on to your hats!
  return guild.channels.cache
   .filter(c => c.type === "text" &&
     c.permissionsFor(guild.client.user).has("SEND_MESSAGES"))
   .sort((a, b) => a.position - b.position ||
     Long.fromString(a.id).sub(Long.fromString(b.id)).toNumber())
   .first();
}

client.on('guildCreate', guild => {
  let defaultChannel = getDefaultChannel(guild);
  defaultChannel && defaultChannel.send(`**I'm the Name Painter. I let users customize their name color.**
Some things to note

- The paint command is available to all users in the server.
- You should not have existing roles that start with #
- You generally should not assign the roles manually

To use me, simply run
> !paint <color>
> Where <color> is any valid HEX or CSS color value.

Created by dave caruso, https://davecode.me, support \`dave@davecode.me\``);

  updateClientStatus();
});

client.login(fs.readFileSync(__dirname + '/token').toString().replace(/ |\n/g,''));
