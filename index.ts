import Color from "color";
import * as Discord from "discord.js";
import Long from "long";
import NodeCache from "node-cache";

import 'dotenv/config';

const helpMessage = `**I'm the Name Painter. I let users customize their name color.**
Some things to note

- The paint command is available to **all users** in the server by default.
- You should not have existing roles that start with \`#\` as this is how the bot identifies color roles.
- Roles always are added at the bottom of the role list, meaning none of your other roles should have colors.

To use me, simply run
> /paint <color>
> Where <color> is any valid HEX or CSS color value.

Created by dave caruso, <https://paperdave.net>, support \`me@paperdave.net\``;

const client = new Discord.Client({
  intents: [
    Discord.IntentsBitField.Flags.Guilds,
    Discord.IntentsBitField.Flags.GuildMembers,
  ],
});

function updateClientStatus() {
  client.user?.setActivity(`/paint | ${client.guilds.cache.size} servers.`)
}

client.on('ready', async() => {
  console.log(`Logged in as ${client.user?.tag}!`);
  updateClientStatus();

  // client.application.commands.create({
  //   name: 'paint',
  //   description: 'Customize your username color',
  //   options: [
  //     { name: 'color', description: 'Color to change your name to (HEX or CSS)', type: 'STRING', required: true },
  //   ]
  // });
});

const rateLimitCache = new NodeCache({
  stdTTL: 2,
})

async function cleanup(guild: Discord.Guild) {
  const now = Date.now();
  let n = 0;
  const rolesToCheck = guild.roles.cache.filter(role => role.name.startsWith('#'));
  const allMembers = await guild.members.fetch();
  const colorUses: Record<string, boolean> = {};
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
  const time = Date.now() - now;
  console.log(`[guild ${guild.id}] cleaned up ${n} roles in ${time}ms [${guild.roles.cache.size} roles left]`);
  return n;
}

client.on('interactionCreate', async (i) => {
  if (i.isCommand() && i.commandName === 'paint') {
    const input = String(i.options.get('color')!.value);

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

    let guild = i.guild ?? await client.guilds.fetch(i.guildId!);

    let role = guild.roles.cache.find(role => role.name === hex);

    if (!role) {
      if (guild.roles.cache.size === 250) {
        i.reply({
          ephemeral: true,
          content: `The role limit of **250 Roles** has been hit, I cannot assign you this name color.` 
        });
        return;
      } else {
        try {
          role = await guild.roles.create({
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
      const member = i.member!;
      const memberRoles = member.roles as Discord.GuildMemberRoleManager;
      const rolesToRemove = memberRoles.cache.filter(role => role.name.startsWith('#') && role.name !== hex);
      rolesToRemove.map(async (role) => {
        memberRoles.remove(role);
      });
      await memberRoles.add(role);
      i.reply({
        ephemeral: true,
        content: `You\'ve been painted to **${hex}**` 
      });
      await cleanup(guild);
    } catch (error) {
      i.reply({
        ephemeral: true,
        content: `Error assigning your role, contact an admin to check my permissions.` 
      });
    }
  }
});

client.on('guildMemberRemove', (member) => {
  cleanup(member.guild);
});

client.on('guildDelete', guild => {
	updateClientStatus();
});

async function getDefaultChannel(guild: Discord.Guild) {
  const channels = await guild.channels.fetch();
  const array = [...channels.values()].filter(Boolean).sort((a, b) => (a as any).rawPosition - (b as any).rawPosition) as Discord.TextChannel[];
  
  console.log(array.map(x => x.name))

  // Check for a "general" channel, which is often default chat
  const generalChannel = array.find(channel => channel.name === "general" && channel.permissionsFor(guild.client.user)?.has("SendMessages"));
  if (generalChannel)
    return generalChannel;

  // Now we get into the heavy stuff: first channel in order where everyone (and the bot) can speak
  // hold on to your hats!
  const sendableChannels = array
   .filter(c => c.type === Discord.ChannelType.GuildText && c.permissionsFor(guild.client.user)?.has("SendMessages"))
   .filter(c => c.permissionsFor(guild.id)?.has("ViewChannel") && c.permissionsFor(guild.id)?.has("SendMessages"))

  return sendableChannels[0];
}

client.on('guildCreate', async(guild) => {
  let defaultChannel = await getDefaultChannel(guild) as Discord.TextChannel;
  defaultChannel && defaultChannel.send(helpMessage);

  updateClientStatus();
});

client.login(process.env.TOKEN);

// if (process.env.HEALTHCHECKS_URL) {
//   var https = require('https');
//   setInterval(() => {
//     https.get(process.env.HEALTHCHECKS_URL).on('error', () => {});
//   }, 5 * 60 * 1000);
// }
