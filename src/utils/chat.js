import { cleanSpecialSymbols } from './common.js';

export const sendReplyFromAssistant = (ctx, choices) => {
    const textStr = (choices || []).map(({ message }) => message.content).join('\n');

    if (textStr)
        ctx.reply(cleanSpecialSymbols(textStr), { parse_mode: 'MarkdownV2' })
            .catch((error) => {
                // TODO: Добавить нормальный логгер
                // error?.response?.description || 'Unexpected error'
                console.error('Error: ', error?.response?.description || error);
                ctx.reply(textStr);
            })
}
