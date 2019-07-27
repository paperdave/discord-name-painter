const Discord = require('discord.js');
const fs = require('fs');
const client = new Discord.Client();
const Color = require('color');

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', async (msg) => {
  if (msg.author.bot) return;

  if (msg.content.startsWith('!paint') || msg.content.startsWith('!color')) {
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
        msg.channel.send(`> Could not get a color from ${input.replace(/\n/g, '').replace(/`/g, '\\\\`')}`)
        return;
      }
    }

    const hex = color.hex();

    let role = msg.guild.roles.find(role => role.name === hex);

    if (!role) {
      if (msg.guild.roles.length === 250) {
        msg.channel.send(`> **Error**: The Discord Role Limit of **250 Roles** has been hit!`);
        return;
      } else {
        try {
          role = await msg.guild.createRole({
            name: hex,
            color: color.rgbNumber(),
            permissions: 0,
          });
        } catch (error) {
          msg.channel.send(`> **Error**: Could not create a role for you!`);
          return;
        }
      }
    }

    try {
      const rolesToRemove = msg.member.roles.filter(role => role.name.startsWith('#') && role.name !== hex);
      rolesToRemove.map(async (role) => {
        msg.member.removeRole(role);
        if (role.members.size === 0) {
          console.log('Deleting ' + role.name)
          role.delete();
        }
      });
      await msg.member.addRole(role);
      msg.channel.send(`> You\'ve been painted to **${hex}**`);
    } catch (error) {
      console.log(error);
      msg.channel.send(`> **Error**: Could not assign your role, ask the server admin to check my permissions.`);
    }
  }
});

client.on('guildCreate', guild => {
  let defaultChannel = "";
  guild.channels.forEach((channel) => {
    if (channel.type == "text" && defaultChannel == "") {
      if (channel.permissionsFor(guild.me).has("SEND_MESSAGES")) {
        defaultChannel = channel;
      }
    }
  })
  //defaultChannel will be the channel object that it first finds the bot has permissions for
  defaultChannel.send(`**I'm the Name Painter. I let users customize their name color.**
Some things to note

- The paint command is available to all users in the server.
- You should not have existing roles that start with #
- You generally should not assign the roles manually

To use me, simply run
> !paint <color>
> Where <color> is any valid HEX or CSS color value.`);
});

client.login(fs.readFileSync('token').toString().replace(/ |\n/g,''));
