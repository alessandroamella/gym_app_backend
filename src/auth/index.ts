import { t, ValidationError } from "elysia";
import jwt, { VerifyOptions, Secret, SignOptions } from "jsonwebtoken";
import { User } from "@prisma/client";
import { db } from "../db";
import { config } from "../config";

function verifyAsync<T>(token: string, secret: string): Promise<T> {
    return new Promise((resolve, reject) => {
        jwt.verify(token, secret, {}, (err, val) => {
            if (err) reject(err);
            else resolve(val as T);
        });
    });
}

const signAsync = (payload: object, secret: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        jwt.sign(payload, secret, { expiresIn: config.jwtExpiresIn }, (err, val) => {
            if (err || !val) reject(err || new Error("JWT no value returned"));
            else resolve(val);
        });
    });
};

class Auth {
    async getUserFromHeader(authorization: string, secret: string): Promise<User> {
        const token = authorization.split("Bearer ")[1];
        let id: number;
        try {
            const val = await verifyAsync<{ id: number }>(token, secret);
            id = val.id;
        } catch (e) {
            throw new ValidationError("auth.invalid_token", t.Object({}), authorization);
        }

        const user = await db.user.findFirst({
            where: {
                id
            }
        });

        if (!user) {
            throw new ValidationError("auth.user_not_found", t.Object({}), authorization);
        }

        return user;
    }

    async createToken(userId: number, secret: string): Promise<string> {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not defined in the environment variables");
        }
        return signAsync({ id: userId }, secret);
    }
}

export const auth = new Auth();
