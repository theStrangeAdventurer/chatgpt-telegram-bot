import TT from 'tiny-track';
import fs from 'node:fs';
import path from 'node:path';

const loggers = [
    {
        stream: fs.createWriteStream(path.resolve(process.cwd(), 'logs', 'error.log'), {
            flags: 'a+'
        }),
        colorize: false,
        format: 'json',
        maxDepth: 3,
    },
];

if (process.env.__DEV__) {
    loggers.push({
        stream: process.stdout,
        colorize: true,
        maxDepth: 0,
    })
}

export const tt = TT.tinyTrack(loggers)