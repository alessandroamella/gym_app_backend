import { Elysia, t, ValidationError } from "elysia";
import { env } from "@yolk-oss/elysia-env";
import _ from "lodash";
import { db } from "./db";
import moment from "moment";
import { auth } from "./auth";
import crypto from "crypto";
import { WorkoutType } from "@prisma/client";

new Elysia()
    .use(
        env({
            JWT_SECRET: t.String({
                minLength: 5
            }),
            TELEGRAM_BOT_TOKEN: t.String({
                minLength: 5
            }),
            PORT: t.Integer({
                minimum: 0,
                maximum: 65535,
                default: 3000
            }),
            HOST: t.String({
                default: "127.0.0.1",
                format: "ipv4"
            })
        })
    )
    .onError(err => {
        const errToPrint = _.omit(err, ["env", "error"]);

        const status = (err.error as any)?.type?.startsWith("auth.")
            ? 401
            : err.code === "VALIDATION"
            ? 400
            : err.code === "NOT_FOUND"
            ? 404
            : 500;

        if (status >= 500) {
            console.error(status + " error occurred:", errToPrint);
            // } else {
            //     console.debug(status + " error occurred:", errToPrint);
        }

        return new Response(
            JSON.stringify(
                _.omit(err.error, [
                    "value",
                    "stack",
                    "validator.code",
                    "validator.references",
                    "validator.hasTransform",
                    "validator.schema.additionalProperties"
                ])
            ),
            {
                headers: { "content-type": "application/json" },
                status
            }
        );
    })
    .get("/login", () => Bun.file("public/telegram.html"))
    .get(
        "/auth/telegram",
        // parameters: id, first_name, last_name, username, photo_url, auth_date and hash;
        async ({ query, env: { JWT_SECRET, TELEGRAM_BOT_TOKEN } }) => {
            console.debug("Telegram auth query", query);

            // parse query.auth_date with moment, which is Unix
            // timestamp, to ensure it is not older than 24 hours
            // and not in the future
            const authDate = moment.unix(Number(query.auth_date));
            const diffHours = moment().diff(authDate, "hours");
            if (!authDate.isValid() || diffHours > 24 || diffHours < 0) {
                console.debug(
                    `Telegram auth date ${
                        authDate.isValid()
                            ? authDate.format("YYYY-MM-DD HH:mm:ss") +
                              " (" +
                              authDate.fromNow() +
                              ")"
                            : JSON.stringify(query.auth_date)
                    } expired by ${diffHours || "∞"} hours`
                );
                throw new ValidationError(
                    "auth.telegram_auth_date_expired",
                    t.Object({}),
                    query.auth_date
                );
            }

            // From docs: Data-check-string is a concatenation
            // of all received fields, sorted in alphabetical
            // order, in the format key=<value> with a line
            // feed character ('\n', 0x0A) used as separator
            // e.g., 'auth_date=<auth_date>\nfirst_name=<first_name>\nid=<id>\nusername=<username>'.
            const _query = _.omit(query, ["hash"]);
            const __query = _.pick(_query, Object.keys(_query).sort());
            const dataCheckString = Object.entries(__query)
                .map(([key, value]) => `${key}=${value}`)
                .join("\n");

            // compute HMAC_SHA256 of the data-check-string using, as secret, the SHA256 of bot token
            const hmac = crypto.createHmac(
                "sha256",
                crypto.createHash("sha256").update(TELEGRAM_BOT_TOKEN).digest()
            );
            hmac.update(dataCheckString);
            const hash = hmac.digest("hex");

            // compare the hash with the one received in the request
            if (hash !== query.hash) {
                console.debug("Telegram hash mismatch", hash, query.hash);
                throw new ValidationError("auth.telegram_hash_mismatch", t.Object({}), query);
            }

            // find user and create JWT token
            const user = await db.user.findUnique({ where: { telegramId: query.id } });
            if (!user) {
                console.warn(`User with Telegram id ${query.id} not found in /auth/telegram`);
                throw new ValidationError("auth.user_not_found", t.Object({}), query.id);
            } else {
                console.debug(
                    `User with Telegram id ${query.id} found in /auth/telegram: ${JSON.stringify(
                        user
                    )}`
                );
            }
            const token = await auth.createToken(user.id, JWT_SECRET);
            return { token };
        },
        {
            query: t.Object({
                id: t.String(),
                first_name: t.Optional(t.String()),
                last_name: t.Optional(t.String()),
                username: t.Optional(t.String()),
                photo_url: t.Optional(t.String()),
                auth_date: t.String(),
                hash: t.String()
            })
        }
    )
    .guard(
        {
            headers: t.Object({
                authorization: t.String({ minLength: 1 })
            })
        },
        app =>
            app
                .get("/me", async ({ headers: { authorization }, env: { JWT_SECRET } }) => {
                    return auth.getUserFromHeader(authorization, JWT_SECRET);
                })
                .post(
                    "/entry",
                    async ({
                        headers: { authorization },
                        body: { date, points, type },
                        env: { JWT_SECRET }
                    }) => {
                        const user = await auth.getUserFromHeader(authorization, JWT_SECRET);
                        return db.gymEntry.create({
                            data: {
                                // set to midnight
                                date: moment(date).startOf("day").toDate(),
                                points,
                                user: {
                                    connect: {
                                        id: user.id
                                    }
                                },
                                type
                            }
                        });
                    },
                    {
                        body: t.Object({
                            date: t.Date(),
                            type: t.Union(
                                Object.values(WorkoutType).map(value => t.Literal(value))
                            ),
                            points: t.Integer({ minimum: 1 })
                        })
                    }
                )
    )
    .listen(
        {
            hostname: process.env.HOST,
            port: process.env.PORT,
            cert: await Bun.file("./certs/selfsigned.crt").text(),
            key: await Bun.file("./certs/selfsigned.key").text()
        },
        () => {
            console.log(`Server is running on ${process.env.HOST}:${process.env.PORT}`);
        }
    );
