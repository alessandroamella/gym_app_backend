import { Context, Middleware, Telegraf } from 'telegraf';
import { PrismaClient, UserRole } from '@prisma/client';
import { db } from '../db';
import moment from 'moment';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

bot.telegram.setMyCommands([
  {
    command: 'adduser',
    description: 'Add a new user to the database',
  },
  {
    command: 'removeuser',
    description: 'Remove a user from the database',
  },
  {
    command: 'changeusername',
    description: 'Change the username of a user',
  },
  {
    command: 'listusers',
    description: 'List all registered users',
  },
  {
    command: 'help',
    description: 'Show available commands',
  },
]);

bot.telegram.setMyDescription(
  'User Management Bot - Manage users in the system',
);

bot.telegram.setMyShortDescription('User Management Bot');

// Middleware to check user role
const roleMiddleware =
  (requiredRoles: UserRole[]) =>
  async (ctx: Context, next: () => Promise<void>) => {
    const telegramId = ctx.from?.id.toString();

    if (!telegramId) {
      return ctx.reply('Unable to retrieve your Telegram ID.');
    }

    try {
      const user = await db.user.findUnique({
        where: { telegramId },
      });

      if (!user) {
        return ctx.reply('You are not registered in the system.');
      }

      if (!requiredRoles.includes(user.role)) {
        return ctx.reply(
          `You do not have permission to execute this command (required: ${requiredRoles.join(
            ', ',
          )}, yours: ${user.role}).`,
        );
      }

      return next();
    } catch (error) {
      console.error(error);
      return ctx.reply('An error occurred while checking your permissions.');
    }
  };

// /start command
bot.start((ctx) =>
  ctx.reply(
    'Welcome to the User Management Bot! Type /help to see available commands.',
  ),
);

// /help command
bot.help((ctx) => {
  ctx.reply(`
  Available commands:
  /adduser <telegram id> <username> - Add a new user to the database
  /removeuser <telegram id> - Remove a user from the database
  /listusers - List all registered users
  /help - Show this help message
  `);
});

// /adduser command
bot.command(
  'adduser',
  roleMiddleware([UserRole.ADMIN, UserRole.OWNER]),
  async (ctx) => {
    const [, telegramId, username] = ctx.message.text.split(' ');

    if (!telegramId || !username) {
      return ctx.reply('Please provide both the Telegram ID and username.');
    }

    try {
      const existingUser = await db.user.findUnique({
        where: { telegramId },
      });

      if (existingUser) {
        return ctx.reply(`User with Telegram ID ${telegramId} already exists.`);
      }

      await db.user.create({
        data: {
          telegramId,
          username,
        },
      });

      ctx.reply(
        `User ${username} with Telegram ID ${telegramId} has been added.`,
      );
    } catch (error) {
      console.error(error);
      ctx.reply('An error occurred while adding the user.');
    }
  },
);

// /removeuser command
bot.command('removeuser', roleMiddleware([UserRole.OWNER]), async (ctx) => {
  const [, telegramId] = ctx.message.text.split(' ');

  if (!telegramId) {
    return ctx.reply('Please provide the Telegram ID of the user to remove.');
  }

  try {
    const existingUser = await db.user.findUnique({
      where: { telegramId },
    });

    if (!existingUser) {
      return ctx.reply(`User with Telegram ID ${telegramId} does not exist.`);
    }

    await db.user.delete({
      where: { telegramId },
    });

    ctx.reply(`User with Telegram ID ${telegramId} has been removed.`);
  } catch (error) {
    console.error(error);
    ctx.reply('An error occurred while removing the user.');
  }
});

// /listusers command
bot.command(
  'listusers',
  roleMiddleware([UserRole.ADMIN, UserRole.OWNER]),
  async (ctx) => {
    try {
      const users = await db.user.findMany({
        orderBy: { createdAt: 'desc' },
      });

      if (users.length === 0) {
        return ctx.reply('❌ No users registered in the database.');
      }

      let message = `*Registered Users \\(_${users.length}_\\)*:\n\n`;
      users.forEach((user) => {
        message += `👤 Username: *${user.username}*\n`;
        message += `🆔 Telegram ID: \`${user.telegramId}\`\n`;
        message += `📅 Joined: ${
          user.createdAt
            ? moment(user.createdAt).format('MMM D, YYYY [at] HH:mm')
            : 'Unknown'
        }\n\n`;
      });

      ctx.replyWithMarkdownV2(message);
    } catch (error) {
      console.error(error);
      ctx.reply('⚠️ An error occurred while listing the users.');
    }
  },
);

// /changeusername command
bot.command(
  'changeusername',
  roleMiddleware([UserRole.ADMIN, UserRole.OWNER]),
  async (ctx) => {
    const [, telegramId, newUsername] = ctx.message.text.split(' ');

    if (!telegramId || !newUsername) {
      return ctx.reply(
        'Please provide both the Telegram ID and the new username.',
      );
    }

    try {
      const existingUser = await db.user.findUnique({
        where: { telegramId },
      });

      if (!existingUser) {
        return ctx.reply(`User with Telegram ID ${telegramId} does not exist.`);
      }

      await db.user.update({
        where: { telegramId },
        data: { username: newUsername },
      });

      ctx.reply(
        `Username for user with Telegram ID ${telegramId} has been updated to ${newUsername}.`,
      );
    } catch (error) {
      console.error(error);
      ctx.reply('An error occurred while updating the username.');
    }
  },
);

export async function launchBot() {
  try {
    await bot.launch();
    console.log('Bot started successfully');
  } catch (err) {
    console.error('Error launching bot:', err);
  }
}

// listen to errors
bot.catch((err, ctx) => {
  console.error(`An error occurred for ${ctx.updateType}`, err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
