
import i18next from 'i18next';
import { Telegraf } from 'telegraf';
import axios from 'axios';
import { createRequire } from 'node:module';
import path from 'node:path';

import './utils/bootstrap.js'; // !!! Этот импорт должен быть первым
import {
    sendReplyFromAssistant,
    sendVoiceAssistantResponse,
    replyWithRoles,
    accessDenied,
    setUserLanguage,
    getUsername,
    getReplyId,
    replyWithLanguageButtons,
    replyWithProgrammingLanguages,
    replyWithVoiceButtons,
} from './utils/chat.js';
import { recognizeVoice, iamToken } from './utils/yandex.js';
import { requestAssist } from './utils/openai.js';

import {
    getAssistantContext,
    characterDefault,
    roles,
    supportedLangs,
    langDefault,
    accounts,
    characters
} from './constants/index.js';

const require = createRequire(import.meta.url);

i18next.init({
    lng: langDefault,
    debug: false,
    resources: supportedLangs.reduce((acc, lang) => {
        acc[lang] = { translation: require(path.resolve(process.cwd(), 'src', 'locales', `${lang}.json`)) };
        return acc;
    }, {})
  });

/**
 * Стор, в кототом храним контекст чатов с ботом
 * @type {Map<number, { enableVoiceResponse: boolean; assistantCharacterExtra: Record<string, string>;lang: string; messages: Array<{role: string; content: string}>; assistantCharacter: string }>}
 */
const chatContextStore = new class {
    constructor() {
        this._store = new Map();
    }
    get(id) {
        console.debug('chatContextStore:get:' + id);
        return this._store.get(id);
    }

    set(id, value) {
        console.debug('chatContextStore:set:' + id + ':value:' + JSON.stringify(value, null, 1));
        return this._store.set(id, value);
    }

    has(id) {
        console.debug('chatContextStore:has:' + id);
        return this._store.has(id);
    }
};

/**
 * @type {import('telegraf').Telegram}
 */
const bot = new Telegraf(process.env.BOT_API_KEY, {
    handlerTimeout: 90_000 * 5 // Chat GPT Может отвечать долго, значение по умолчанию 90 сек
});


const initialChatContext = {
    lang: langDefault,
    messages: [],
    assistantCharacter: characterDefault,
    enableVoiceResponse: false,
    assistantCharacterExtra: { language: 'javascript' } // Default language JS ¯\_(ツ)_/¯ 
};

const checkChatContext = (id) => {
    console.log('checkChatContext:' + id)
    if (!chatContextStore.has(id)) {
        chatContextStore.set(id, {
            ...initialChatContext,
        });
    }
}

const sendMessageToChatGpt = async (ctx, message, id) => {
    checkChatContext(id);
    await setUserLanguage(ctx, i18next, chatContextStore);
    const assistantCharacter = chatContextStore.get(id).assistantCharacter;
    const extra = chatContextStore.get(id).assistantCharacterExtra;

    console.debug(`Send request: [${assistantCharacter}] ${message}\nextra: ${JSON.stringify(extra, null, 2)}` );
    const initialContext = [
        ...getAssistantContext(i18next.t, extra)[assistantCharacter]
    ];

    if (!chatContextStore.get(id).messages.length) {
        chatContextStore.set(id, {
            ...chatContextStore.get(id),
            messages: initialContext
        })
    }

    chatContextStore.get(id).messages.push({ role: roles.User, content: message });
    console.debug('Send request to chat gpt:', chatContextStore.get(id).messages.map(({ role, content }) => `Role:${role}:${content}`).join('\n'));
    const help = await requestAssist(chatContextStore.get(id).messages);
    const { choices, error } = help;

    if (error) {
        console.debug(error.response.data, );
        ctx.replyWithHTML(i18next.t('system.messages.error'));
        eraseMessages(getReplyId(ctx));
        return;
    }

    chatContextStore.get(id).messages = [
        ...chatContextStore.get(id).messages,
        ...(choices || []).map(({ message }) => ({ role: message.role, content: message.content }))
    ];

    return choices || [];
}

/**
 * 
 * @param {import('telegraf').Context} ctx 
 * @returns 
 */
const sendTypingAction = (ctx) => {
    let stop;

    const sendAction = async () => {
        try {
            await ctx.sendChatAction('typing');
        } catch (error) {
            console.debug('Send typing action error: ', error);
            stop && stop();
        }
    }

    sendAction();

    const timer = setInterval(() => {
        sendAction();
    }, 2000);

    stop = () => {
        clearInterval(timer);
    };
    return stop;
};

const eraseMessages = (id) => {
    const data = chatContextStore.get(id);
    if (data?.messages?.length) {
        chatContextStore.set(id, {
            ...data,
            messages: [],
        });
    }
}

const commands = {
    lang: {
        desc: () => i18next.t('bot.commands.lang'),
        fn: (ctx) => {
            replyWithLanguageButtons(ctx, i18next.t)
        }
    },
    voice_response: {
        desc: () => i18next.t('bot.commands.voice'),
        fn: (ctx) => {
            replyWithVoiceButtons(ctx, i18next.t);
        }
    },
    start: {
        desc: () => i18next.t('bot.commands.start'),
        fn: (ctx) => {
            eraseMessages(getReplyId(ctx));
            replyWithRoles(ctx, i18next);
        }
    },
    async setCommands(ctx) {
        if (ctx) {
            await setUserLanguage(
                ctx,
                i18next,
                chatContextStore
            )
        }
         
        const _commands = Object.keys(commands)
            .filter(c => typeof commands[c] !== "function")
            .map(command => ({
                command,
                description: commands[command].desc()
            }));
        const result = await bot.telegram.setMyCommands(_commands);
        console.debug('Set commands: ', {
            result,
            commands: _commands.map(({ command:c, description:d }) => `/${c}:${d}`).join('\n')
        });
    }
};

const runBot = async () => {
    bot.on('callback_query', async (ctx) => {
        if (accounts.length && !accounts.includes(getUsername(ctx))) {
            accessDenied(ctx, i18next);
            return;
        }
        const data = ctx.update.callback_query.data;
        const id = getReplyId(ctx);

        if (data?.startsWith('programming:')) {
            const [, language] = data.split(':');
            chatContextStore.set(id, {
                ...(chatContextStore.get(id) || initialChatContext),
                assistantCharacterExtra: { language },
                messages: getAssistantContext(i18next.t, { language })[characters.programmer]
            });
            const characterCtx = chatContextStore.get(id).messages[0].content;
            console.debug('Set programmer context: ', characterCtx);
            ctx.replyWithHTML(`<code>${i18next.t('system.messages.change-character', { character: characters.programmer })}</code>`);
            return;
        }
        switch (data) {
            case 'enable_voice_response':
            case 'disable_voice_response': 
                const enableVoiceResponse = Boolean(data.startsWith('enable'))
                chatContextStore.set(id, {
                    ...chatContextStore.get(id) || initialChatContext,
                    enableVoiceResponse
                });
                ctx.replyWithHTML(`<code>${enableVoiceResponse ? 'Enabled' : 'Disabled' } voice response...</code>`);
                return;
            case 'en':
            case 'ru':
                chatContextStore.set(id, {
                    ...chatContextStore.get(id) || initialChatContext,
                    /**
                     * ru-RU, en-EN !!! Важно для преобразования текста в голос  ¯\_(ツ)_/¯ 
                     * Иначе получаю ошибку из vocalizeText
                     * {"error_code":"BAD_REQUEST","error_message":"Error while parsing and validating request: Request voice is applicable for Ru language only: filipp"}
                     */
                    lang: `${data}-${data.toUpperCase()}`
                });
                await setUserLanguage(ctx, i18next, chatContextStore);
                ctx.replyWithHTML(`<code>${i18next.t('system.messages.lang-changed', { lang: data })}</code>`);
                return;
            default: {
                const characterExtra = chatContextStore.get(id)?.assistantCharacterExtra || initialChatContext.assistantCharacterExtra;
                if (getAssistantContext(i18next.t, characterExtra)[data]) {
                    chatContextStore.set(id, {
                        ...(chatContextStore.get(id) || initialChatContext),
                        assistantCharacter: data,
                        assistantCharacterExtra: characterExtra, // FIXME: тут всегда находится { language: 'javascript' }
                        messages: getAssistantContext(i18next.t, characterExtra)[data]
                    });
                    if (data === characters.programmer) {
                        replyWithProgrammingLanguages(ctx, i18next);
                    } else {
                        ctx.replyWithHTML(`<code>${i18next.t('system.messages.change-character', { character: data })}</code>`);
                        const characterCtx = chatContextStore.get(id).messages[0].content;
                        console.debug('Set context: ', characterCtx);
                    }
                    return;
                }
            }   
        }
        ctx.reply(i18next.t('system.messages.unknown-command', { command: data }));
    });

    Object.keys(commands)
        .filter(c => typeof commands[c] !== "function")
        .forEach(command => {
            const { fn,  } = commands[command];
            bot.command(command, (ctx) => {
                if (accounts.length && !accounts.includes(getUsername(ctx))) {
                    accessDenied(ctx, i18next);
                    return;
                }
                checkChatContext(getReplyId(ctx));
                fn(ctx);
            })
    });

    bot.on('message', async (ctx) => {
        if (accounts.length && !accounts.includes(getUsername(ctx))) {
            accessDenied(ctx, i18next);
            return;
        }

        if (ctx.message.voice) { // Voice messages handling
            const { voice, from } = ctx.message;
            const { id } = from;
            const { file_id } = voice;
            await setUserLanguage(ctx, i18next, chatContextStore);
            let stopTyping
            ctx.replyWithHTML(`<code>${i18next.t('system.messages.processing')}</code>`);
            ctx.telegram.getFileLink(file_id).then(async (fileLink) => {
                // Получаем ссыль на голосовое сообщение
                const { href } = fileLink;

                try {
                    // Получаем данные в ArrayBuffer и их же передаем в Yandex Speech Kit
                    const { data: voiceBuffer } = await axios.get(href, { responseType: 'arraybuffer' });
                    // Таким образом обходимся без установки ffmpeg и
                    // Промежуточного сохранения и конвертирования файла
                    // А значит - сокращаем время ответа
                    await setUserLanguage(ctx, i18next, chatContextStore);
                    const prompt = await recognizeVoice(voiceBuffer, i18next.language);
                    await ctx.replyWithHTML(`<code>${i18next.t('system.messages.prompt', { prompt })}</code>`);
                    stopTyping = sendTypingAction(ctx);
    
                    const choices = await sendMessageToChatGpt(
                        ctx,
                        prompt,
                        id
                    );
                    if (chatContextStore.get(getReplyId(ctx)).enableVoiceResponse) {
                        console.debug('Enabled voice response');

                        /**
                         * Выдернет из многострочного текста, участки с кодом
                         * заключченные в тройные backtick кавычки (формат markdown)
                         */
                        const codeRe = /```(.+?)```/gis;

                        const preparedForVoiceResponse = choices.map((choice) => {
                            const { message } = choice;
                            const { content } = message;

                            /**
                             * Участки с кодом, вместе с ```
                             */
                            let codeBlocks = [];

                            /**
                             * Участки с текстом
                             * по умолчанию весь текст, если он не подходит
                             * под регулярное выражение
                             */
                            let texts = [];
                            
                            if (codeRe.test(content)) {
                                codeBlocks = content.match(codeRe);
                                const _messages = content.replace(codeRe, '__CODE__');
                                texts = _messages.split('__CODE__');
                            } else {
                                texts = [content]
                            }
                           
                            return {
                                ...choice,
                                voiceData: {
                                    texts,
                                    codeBlocks,
                                }
                            }
                        })
                        await setUserLanguage(ctx, i18next, chatContextStore);
                        await sendVoiceAssistantResponse(
                            ctx,
                            preparedForVoiceResponse,
                            i18next,
                            chatContextStore.get(
                                getReplyId(ctx)
                            ).assistantCharacter
                        );
                        return;
                    }
                    sendReplyFromAssistant(ctx, choices)
                } catch (error) {
                    const errMessage = error?.response?.data.description || error?.message;
                    console.debug('Failed voice recognition: ', errMessage);
                    console.dir(Buffer.isBuffer(error?.response?.data) ? error?.response?.data.toString() : error?.response?.data);
                    ctx.reply(i18next.t('system.messages.error.voice'));
                } finally {
                    stopTyping()
                }
            });
            return;
        }
        if (ctx.message.text.startsWith('/')) {
            ctx.reply(i18next.t('system.messages.unknown-command', { command: ctx.message.text }));
            return;
        }

        const stopTyping = sendTypingAction(ctx);
        const choices =  await sendMessageToChatGpt(
            ctx,
            ctx.message.text,
            getReplyId(ctx)
        );

        stopTyping();

        sendReplyFromAssistant(ctx, choices);
    })
    await commands.setCommands();
    bot.launch();
    console.debug(`✨ Bot started ✨`);
}

iamToken.runUpdates() // Выписываем токен для конвертации голосовых в текст и только после этого запускаем бота
    .then(_updateTimer => { // Можно отписаться от интервала обновления токенов 
        runBot()
    });
    
process.once('SIGINT', () => bot?.stop('SIGINT'));
process.once('SIGTERM', () => bot?.stop('SIGTERM'));