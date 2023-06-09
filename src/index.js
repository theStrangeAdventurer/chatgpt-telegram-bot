
import i18next from 'i18next';
import { Telegraf } from 'telegraf';
import axios from 'axios';
import { createRequire } from 'node:module';
import path from 'node:path';

import './utils/bootstrap.js'; // !!! Этот импорт должен быть первым

import { tt } from './utils/logger.js';

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
        tt`d!chatContextStore:get ${id}`
        return this._store.get(id);
    }

    set(id, value) {
        tt`d!chatContextStore:set ${id} ${{value}}`
        return this._store.set(id, value);
    }

    has(id) {
        tt`d!chatContextStore:has ${id}`
        return this._store.has(id);
    }
};

/**
 * @type {import('telegraf').Telegram}
 */
const bot = new Telegraf(process.env.BOT_API_KEY, {
    handlerTimeout: 90_000 * 20 // Chat GPT Может отвечать долго, значение по умолчанию 90 сек
});

const initialChatContext = {
    lang: langDefault,
    messages: [],
    assistantCharacter: characterDefault,
    enableVoiceResponse: false,
    assistantCharacterExtra: { language: 'javascript' } // Default language JS ¯\_(ツ)_/¯ 
};

const checkChatContext = (id) => {

    tt`d!Check chat context ${{id}}`;

    if (!chatContextStore.has(id)) {
        chatContextStore.set(id, {
            ...initialChatContext,
        });
    }
}

/**
 * 
 * @param {import('telegraf').Context} ctx 
 * @param {string} message 
 * @param {number} id 
 * @returns 
 */
const sendMessageToChatGpt = async (ctx, message, id) => {
    checkChatContext(id);
    await setUserLanguage(ctx, i18next, chatContextStore);
    const assistantCharacter = chatContextStore.get(id).assistantCharacter;
    const extra = chatContextStore.get(id).assistantCharacterExtra;

    tt`d!Send reques ${{assistantCharacter, message, extra }}`;

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

    tt`d!Send request to chat gpt ${{
        messages: chatContextStore.get(id).messages
    }}`

    const help = await requestAssist(chatContextStore.get(id).messages);
    const { choices, error } = help;

    if (error) {
        tt`!Can't receive message from chat gpt ${error}`

        ctx.replyWithHTML(i18next.t('system.messages.error'))
            .catch((err) => {
                tt`!Can\'t send error message ${{err}}`
            })
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
            tt`d!Send typing action error ${error}`
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
        tt`d!Set commands ${{ result, commands: _commands }}`
    }
};

const runBot = async () => {
    bot.on('callback_query', async (ctx) => {
        if (accounts.length && !accounts.includes(getUsername(ctx))) {
            accessDenied(ctx, i18next, chatContextStore);
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
            tt`d!Set programmer context ${characterCtx}`;
            ctx.replyWithHTML(`<code>${i18next.t('system.messages.change-character', { character: characters.programmer })}</code>`)
                .catch((err) => tt`!Can\'t send change character message ${err}`)
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
                ctx.replyWithHTML(`<code>${enableVoiceResponse ? 'Enabled' : 'Disabled' } voice response...</code>`)
                    .catch((err) => tt`!Can\'t send voice message feature status ${err}`)
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
                ctx.replyWithHTML(`<code>${i18next.t('system.messages.lang-changed', { lang: data })}</code>`)
                    .catch((err) => tt`!Can\'t send language status ${err}`)
                return;
            default: {
                const characterExtra = chatContextStore.get(id)?.assistantCharacterExtra || initialChatContext.assistantCharacterExtra;
                if (getAssistantContext(i18next.t, characterExtra)[data]) {
                    chatContextStore.set(id, {
                        ...(chatContextStore.get(id) || initialChatContext),
                        assistantCharacter: data,
                        assistantCharacterExtra: characterExtra,
                        messages: getAssistantContext(i18next.t, characterExtra)[data]
                    });
                    if (data === characters.programmer) {
                        replyWithProgrammingLanguages(ctx, i18next);
                    } else {
                        ctx.replyWithHTML(`<code>${i18next.t('system.messages.change-character', { character: data })}</code>`)
                            .catch((err) => tt`!Can\'t send character change status messsage ${err}`)    
                        const characterCtx = chatContextStore.get(id).messages[0].content;
                        tt`d!Set context${characterCtx}`
                    }
                    return;
                }
            }
        }
        ctx.reply(i18next.t('system.messages.unknown-command', { command: data }))
            .catch((err) => tt`!Can\'t send unknown command message ${err}`)
    });

    Object.keys(commands)
        .filter(c => typeof commands[c] !== "function")
        .forEach(command => {
            const { fn,  } = commands[command];
            bot.command(command, (ctx) => {
                if (accounts.length && !accounts.includes(getUsername(ctx))) {
                    accessDenied(ctx, i18next, chatContextStore);
                    return;
                }
                checkChatContext(getReplyId(ctx));
                fn(ctx);
            })
    });

    bot.on('message', async (ctx) => {
        if (accounts.length && !accounts.includes(getUsername(ctx))) {
            accessDenied(ctx, i18next, chatContextStore);
            return;
        }

        if (ctx.message.voice) { // Voice messages handling
            const { voice, from } = ctx.message;
            const { id } = from;
            const { file_id } = voice;
            await setUserLanguage(ctx, i18next, chatContextStore);
            let stopTyping
            ctx.replyWithHTML(`<code>${i18next.t('system.messages.processing')}</code>`)
                .catch((err) => tt`!Can\'t send processing message ${err}`)

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
                    await ctx.replyWithHTML(`<code>${i18next.t('system.messages.prompt', { prompt })}</code>`)
                        .catch((err) => tt`!Can\'t send user prompt message ${err}`)    
                    
                    stopTyping = sendTypingAction(ctx);
    
                    const choices = await sendMessageToChatGpt(
                        ctx,
                        prompt,
                        id
                    );
                    if (chatContextStore.get(getReplyId(ctx)).enableVoiceResponse) {
                        tt`d!Enabled voice response...`;

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
                        ).catch(async (err) => {
                            tt`!Failed send voice message${{
                                isBuffer: Buffer.isBuffer(err),
                            }}`

                            await ctx.replyWithHTML(`<code>${i18next.t('system.messages.error.voice-forbidden')}</code>`)
                                .catch((_err) => tt`!Can\'t send voice error message${{_err}}`)

                            ctx.reply(choices[0].message.content)
                                .catch((_err) => tt`!Can\'t send text instead voice message${{_err}}`)
                        });
                        return;
                    }
                    sendReplyFromAssistant(ctx, choices)
                } catch (error) {
                    tt`!Failed voice recognition ${error}`
                    ctx.reply(i18next.t('system.messages.error.voice'))
                        .catch((err) => tt`!Can\'t send voice error message${{err}}`)
                } finally {
                    stopTyping()
                }
            });
            return;
        }
        if (ctx.message.text.startsWith('/')) {
            ctx.reply(i18next.t('system.messages.unknown-command', { command: ctx.message.text }))
                .catch((err) => tt`!Can\'t send unknown command message${{err}}`)
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
    tt`✨ Bot started ✨`;
}

iamToken.runUpdates() // Выписываем токен для конвертации голосовых в текст и только после этого запускаем бота
    .then(_updateTimer => { // Можно отписаться от интервала обновления токенов 
        runBot()
    });
    
process.once('SIGINT', () => bot?.stop('SIGINT'));
process.once('SIGTERM', () => bot?.stop('SIGTERM'));