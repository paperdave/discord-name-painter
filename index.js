const Discord = require('discord.js');
const fs = require('fs');
const Color = require('color');
const Long = require('long');
const Cache = require('node-cache');
const client = new Discord.Client({
  intents: [
    'GUILDS',
    'GUILD_MEMBERS',
    'GUILD_MESSAGES',
  ],
});

function updateClientStatus() {
  client.user.setActivity(`/paint | ${client.guilds.cache.size} servers.`)
}

client.on('ready', async() => {
  console.log(`Logged in as ${client.user.tag}!`);
  updateClientStatus();

  // client.application.commands.create({
  //   name: 'paint',
  //   description: 'Customize your username color',
  //   options: [
  //     { name: 'color', description: 'Color to change your name to (HEX or CSS)', type: 'STRING', required: true },
  //   ]
  // });

  // client.application.commands.create({
  //   name: 'clean-roles',
  //   description: 'Run the role cleanup utility manually'
  // });
});

const schedules = {}

const rateLimitCache = new Cache({
  stdTTL: 2
})
const rateLimitCache2 = new Cache({
  stdTTL: 230
})

async function cleanup(guild) {
  clearTimeout(schedules[guild.id]);
  delete schedules[guild.id];
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
  if (schedules[guild.id]) {
    return;
  }
  schedules[guild.id] = setTimeout(() => {
    cleanup(guild)
  }, 5 * 60 * 1000);
}

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  if (msg.content.startsWith('!paint') || msg.content.startsWith('!color')) {
    msg.channel.send('Name Paint has been updated to use slash commands. If they do not show up, have an admin reinvite the bot:\n<https://davecode.me/name-painter-invite>')
  }
});

client.on('interactionCreate', async (i) => {
  if (i.isCommand() && i.commandName === 'paint') {
    const input = i.options.get('color').value;

    let color;
    try {
      color = Color(input);
    } catch (error) {
      try {
        color = Color('#' + input);
      } catch (error) {
        i.reply({
          ephemeral: true,
          content: `Could not get a color from \`\`${input.substring(0, 500).replace(/\n/g, ' ').replace(/`/g, '\u2063`\u2063')}\`\``,
        })
        return;
      }
    }

    const hex = color.hex();

    if (rateLimitCache.has(i.user.id)) {
      i.reply({
        ephemeral: true,
        content: 'You have reached the rate limit. Please wait a few seconds before running the command again.',
      });
      return;
    }

    rateLimitCache.set(i.user.id , 'true');

    let role = i.guild.roles.cache.find(role => role.name === hex);

    if (!role) {
      if (i.guild.roles.cache.length === 250) {
        i.reply({
          ephemeral: true,
          content: `The role limit of **250 Roles** has been hit, I cannot assign you this name color.` 
        });
        return;
      } else {
        try {
          role = await i.guild.roles.create({
            name: hex,
            color: color.rgbNumber(),
            permissions: [],
          });
        } catch (error) {
          console.log(error)
          i.reply({
            ephemeral: true,
            content: `Error creating a role for you, contact an admin to check my permissions.` 
          });
          return;
        }
      }
    }

    try {
      const rolesToRemove = i.member.roles.cache.filter(role => role.name.startsWith('#') && role.name !== hex);
      rolesToRemove.map(async (role) => {
        i.member.roles.remove(role);
      });
      await i.member.roles.add(role);
      i.reply({
        ephemeral: true,
        content: `You\'ve been painted to **${hex}**` 
      });

      scheduleClean(i.guild)
    } catch (error) {
      i.reply({
        ephemeral: true,
        content: `Error assigning your role, contact an admin to check my permissions.` 
      });
    }
  }
});

client.on('guildMemberRemove', (member) => {
  scheduleClean(member.guild);
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

- The paint command is available to **all users** in the server.
- You should not have existing roles that start with #
- You *generally* should not assign the roles manually

To use me, simply run
> /paint <color>
> Where <color> is any valid HEX or CSS color value.

Created by dave caruso, <https://davecode.me>, support \`dave@davecode.me\``);

  updateClientStatus();
});

client.login(fs.readFileSync(__dirname + '/token').toString().replace(/ |\n/g,''));
