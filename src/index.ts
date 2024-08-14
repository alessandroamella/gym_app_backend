import { Elysia, t, ValidationError } from 'elysia';
import { env } from '@yolk-oss/elysia-env';
import _ from 'lodash';
import { db } from './db';
import moment from 'moment';
import { auth } from './auth';
import crypto from 'crypto';
import { MediaType, Prisma, WorkoutType } from '@prisma/client';
import randomstring from 'randomstring';
import { config } from './config';
import { extname, join, parse } from 'node:path';
import { resampleArray } from './helpers/resample';
import { decode } from 'node-base64-image';
import { staticPlugin } from '@elysiajs/static';
import { launchBot } from './telegram';
import { unlink, exists, readdir } from 'node:fs/promises';
import { handleB64Image } from './helpers/imageUtils';

new Elysia()
  .use(staticPlugin({ assets: 'public' }))
  .use(
    env({
      JWT_SECRET: t.String({
        minLength: 5,
      }),
      TELEGRAM_BOT_TOKEN: t.String({
        minLength: 5,
      }),
      PORT: t.Integer({
        minimum: 0,
        maximum: 65535,
        default: 3000,
      }),
      HOST: t.String({
        default: '127.0.0.1',
        format: 'ipv4',
      }),
    }),
  )
  .onError((err) => {
    const errToPrint = _.omit(err, ['env', 'error']);

    const status = (err.error as any)?.type?.startsWith('auth.')
      ? 401
      : err.code === 'VALIDATION'
      ? 400
      : err.code === 'NOT_FOUND'
      ? 404
      : 500;

    if (status >= 500) {
      console.error(status + ' error occurred:', errToPrint);
      // } else {
      //     console.debug(status + " error occurred:", errToPrint);
    }

    return new Response(
      JSON.stringify(
        _.omit(err.error, [
          'value',
          'stack',
          'validator.code',
          'validator.references',
          'validator.hasTransform',
          'validator.schema.additionalProperties',
        ]),
      ),
      {
        headers: { 'content-type': 'application/json' },
        status,
      },
    );
  })
  .get('/login', () => Bun.file('login/telegram.html'))
  .get(
    '/auth/telegram',
    // parameters: id, first_name, last_name, username, photo_url, auth_date and hash;
    async ({ query, env: { JWT_SECRET, TELEGRAM_BOT_TOKEN } }) => {
      console.debug('Telegram auth query', query);

      try {
        // parse query.auth_date with moment, which is Unix
        // timestamp, to ensure it is not older than 24 hours
        // and not in the future
        const authDate = moment.unix(Number(query.auth_date));
        const diffHours = moment().diff(authDate, 'hours');
        if (!authDate.isValid() || diffHours > 24 || diffHours < 0) {
          console.debug(
            `Telegram auth date ${
              authDate.isValid()
                ? authDate.format('YYYY-MM-DD HH:mm:ss') +
                  ' (' +
                  authDate.fromNow() +
                  ')'
                : JSON.stringify(query.auth_date)
            } expired by ${diffHours || '∞'} hours`,
          );
          throw new ValidationError(
            'auth.telegram_auth_date_expired',
            t.Object({}),
            query.auth_date,
          );
        }

        // From docs: Data-check-string is a concatenation
        // of all received fields, sorted in alphabetical
        // order, in the format key=<value> with a line
        // feed character ('\n', 0x0A) used as separator
        // e.g., 'auth_date=<auth_date>\nfirst_name=<first_name>\nid=<id>\nusername=<username>'.
        const _query = _.omit(query, ['hash']);
        const __query = _.pick(_query, Object.keys(_query).sort());
        const dataCheckString = Object.entries(__query)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n');

        // compute HMAC_SHA256 of the data-check-string using, as secret, the SHA256 of bot token
        const hmac = crypto.createHmac(
          'sha256',
          crypto.createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest(),
        );
        hmac.update(dataCheckString);
        const hash = hmac.digest('hex');

        // compare the hash with the one received in the request
        if (hash !== query.hash) {
          console.debug('Telegram hash mismatch', hash, query.hash);
          throw new ValidationError(
            'auth.telegram_hash_mismatch',
            t.Object({}),
            query,
          );
        }

        // find user and create JWT token
        const user = await db.user.findUnique({
          where: { telegramId: query.id },
        });
        if (!user) {
          console.warn(
            `User with Telegram id ${query.id} not found in /auth/telegram`,
          );
          throw new ValidationError(
            'auth.user_not_found',
            t.Object({}),
            query.id,
          );
        } else {
          console.debug(
            `User with Telegram id ${
              query.id
            } found in /auth/telegram: ${JSON.stringify(user)}`,
          );
        }

        if (!user.profilePic && query.photo_url) {
          await db.user.update({
            where: { id: user.id },
            data: { profilePic: query.photo_url },
          });
        }

        const token = await auth.createToken(user.id, JWT_SECRET);
        console.debug(`Generated token: ${token}`);
        return { token };
      } catch (err) {
        console.error('Error in "/auth/telegram" route:', err);
        throw err;
      }
    },
    {
      query: t.Object({
        id: t.String(),
        first_name: t.Optional(t.String()),
        last_name: t.Optional(t.String()),
        username: t.Optional(t.String()),
        photo_url: t.Optional(t.String()),
        auth_date: t.String(),
        hash: t.String(),
      }),
    },
  )
  .guard(
    {
      headers: t.Object({
        authorization: t.String({ minLength: 1 }),
      }),
    },
    (app) =>
      app
        .get(
          '/me',
          async ({ headers: { authorization }, env: { JWT_SECRET } }) => {
            const { user } = await auth.getUserFromHeader(
              authorization,
              JWT_SECRET,
            );
            return user;
          },
        )
        .patch(
          '/me',
          async ({
            headers: { authorization },
            body: { username, profilePic },
            env: { JWT_SECRET },
          }) => {
            const { id, user } = await auth.getUserFromHeader(
              authorization,
              JWT_SECRET,
            );

            if (profilePic) {
              profilePic = await handleB64Image(profilePic);
            }
            console.debug('Updating user with params', {
              id,
              username,
              profilePic,
            });
            if (profilePic && user.profilePic) {
              try {
                const path = join(
                  process.cwd(),
                  user.profilePic.replace(
                    config.uploadsPublicPath,
                    config.uploadsBasePath,
                  ),
                );
                if (!(await exists(path))) {
                  throw new Error('Profile pic not found: ' + path);
                }
                await unlink(path);
                console.debug(
                  'Deleted old profile pic URL:',
                  user.profilePic,
                  'path:',
                  path,
                );
              } catch (err) {
                console.error('Error deleting old profile pic:', err);
              }
            }
            return db.user.update({
              where: { id },
              data: {
                username,
                profilePic,
              },
            });
          },
          {
            body: t.Object({
              username: t.Optional(t.String({ minLength: 1 })),
              profilePic: t.Optional(t.String({ minLength: 1 })),
            }),
          },
        )
        // to view everyone gym entries
        .get(
          '/stats',
          async ({ query: { resample } }) => {
            const users = await db.user.findMany({
              include: {
                gymEntries: {
                  orderBy: { date: 'desc' },
                  take: 10,
                },
              },
            });
            const weighted = users.map((user) => ({
              ...user,
              gymEntries: resampleArray(
                user.gymEntries.map((g) => g.points),
                resample,
              ),
            }));
            return weighted;
          },
          {
            query: t.Object({
              resample: t.Integer({ minimum: 1, default: 10 }),
            }),
          },
        )
        .get(
          'gym-entries',
          async ({ query: { from, to } }) => {
            const workouts = await db.gymEntry.findMany({
              where: {
                date: {
                  gte: from ? moment(from).toDate() : undefined,
                  lte: to ? moment(to).toDate() : undefined,
                },
              },
              select: {
                id: true,
                date: true,
                points: true,
                types: true,
                media: {
                  select: {
                    path: true,
                  },
                },
                user: {
                  select: {
                    id: true,
                    username: true,
                    profilePic: true,
                  },
                },
              },
            });
            return { workouts };
          },
          {
            query: t.Object({
              from: t.Optional(t.Date()),
              to: t.Optional(t.Date()),
            }),
          },
        )
        .post(
          '/gym-entry',
          async ({
            headers: { authorization },
            body: { date, points, types, media },
            env: { JWT_SECRET },
          }) => {
            const maxPoints1Day =
              (config.maxWorkoutHoursPerDay * 60) / config.minutesPerPoint;
            if (points > maxPoints1Day) {
              throw new ValidationError(
                'gym_entry.points_exceed_max',
                t.Object({}),
                points,
              );
            }

            const { id } = await auth.getUserFromHeader(
              authorization,
              JWT_SECRET,
            );
            const existing = await db.gymEntry.findFirst({
              where: {
                userId: id,
                date: {
                  gte: moment(date).startOf('day').toDate(),
                  lt: moment(date).endOf('day').toDate(),
                },
              },
            });
            if (existing) {
              throw new ValidationError(
                'gym_entry.already_exists',
                t.Object({}),
                existing,
              );
            }
            const files: Prisma.MediaCreateManyGymEntryInput[] = [];
            if (media) {
              for (const b64 of media) {
                const handled = await handleB64Image(b64);
                const file = Bun.file(handled);
                // use Bun.file to save the file in /uploads
                // and store the path in the database

                // check if image or video with file.type
                const type = file.type.startsWith('image')
                  ? MediaType.IMAGE
                  : file.type.startsWith('video')
                  ? MediaType.VIDEO
                  : null;

                console.debug(
                  'Received media file',
                  file.name,
                  'of type',
                  type,
                );

                if (!type || !config.supportedMimeType.includes(file.type)) {
                  console.debug('Media type not supported', file.type);
                  throw new ValidationError(
                    'gym_entry.media_type_not_supported',
                    t.Object({}),
                    file.type,
                  );
                }

                const path =
                  config.uploadsBasePath +
                  moment().format('YYYYMMDDHHmmss') +
                  '_' +
                  randomstring.generate({
                    length: 8,
                    charset: 'alphanumeric',
                  }) +
                  extname(file.name!);
                const fileSize = await Bun.write(path, file);

                console.debug(
                  `Saved media file "${file.name}" to ${path} with size ${fileSize} bytes`,
                );
                files.push({
                  path,
                  type,
                });
              }
            }
            await db.gymEntry.create({
              data: {
                // start of the day
                date: moment(date).startOf('day').toDate(),
                points,
                user: {
                  connect: { id },
                },
                types,
                media: {
                  createMany: {
                    data: files,
                  },
                },
              },
            });
            const { user } = await auth.getUserFromHeader(
              authorization,
              JWT_SECRET,
            );
            return user;
          },
          {
            body: t.Object({
              date: t.Date(),
              // must contain values in WorkoutType enum
              types: t.Array(t.Enum(WorkoutType), { minItems: 1 }),
              points: t.Integer({ minimum: 1 }),
              media: t.Optional(t.Array(t.String())),
            }),
          },
        )
        .delete(
          '/gym-entry/:id',
          async ({ params: { id }, headers: { authorization }, env }) => {
            const { id: userId } = await auth.getUserFromHeader(
              authorization,
              env.JWT_SECRET,
            );
            const entry = await db.gymEntry.findUnique({
              where: { id: Number(id), userId },
              select: { media: { select: { path: true } } },
            });
            if (!entry) {
              throw new ValidationError(
                'gym_entry.not_found',
                t.Object({}),
                id,
              );
            }
            for (const media of entry.media.map((e) => e.path)) {
              console.debug('Deleting media file', media);
              await unlink(media);
            }
            await db.gymEntry.delete({ where: { id: Number(id) } });
            return { success: true };
          },
          {
            params: t.Object({
              id: t.String(),
            }),
          },
        )
        .post(
          '/weight-entry',
          async ({
            headers: { authorization },
            body: { date, weight },
            env: { JWT_SECRET },
          }) => {
            const { id } = await auth.getUserFromHeader(
              authorization,
              JWT_SECRET,
            );
            await db.weightEntry.create({
              data: {
                date: moment(date).startOf('day').toDate(),
                weight,
                user: {
                  connect: { id },
                },
              },
            });
            const { user } = await auth.getUserFromHeader(
              authorization,
              JWT_SECRET,
            );
            return user;
          },
          {
            body: t.Object({
              date: t.Date(),
              weight: t.Number({ minimum: 0 }),
            }),
          },
        )
        .delete(
          '/weight-entry/:id',
          async ({ params: { id }, headers: { authorization }, env }) => {
            const { id: userId } = await auth.getUserFromHeader(
              authorization,
              env.JWT_SECRET,
            );
            const entry = await db.weightEntry.findUnique({
              where: { id: Number(id), userId },
              select: { userId: true },
            });
            if (!entry) {
              throw new ValidationError(
                'weight_entry.not_found',
                t.Object({}),
                id,
              );
            }
            await db.weightEntry.delete({ where: { id: Number(id) } });
            return { success: true };
          },
          {
            params: t.Object({
              id: t.String(),
            }),
          },
        ),
  )
  .listen(
    {
      hostname: process.env.HOST,
      port: process.env.PORT,
      // cert: await Bun.file("./certs/selfsigned.crt").text(),
      // key: await Bun.file("./certs/selfsigned.key").text()
    },
    async () => {
      console.log(
        `Server is running on ${process.env.HOST}:${process.env.PORT}`,
      );
      launchBot();
    },
  );
