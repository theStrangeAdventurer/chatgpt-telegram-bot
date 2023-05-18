
import i18next from 'i18next';
import { Telegraf } from 'telegraf';
import axios from 'axios';
import { createRequire } from 'node:module';
import path from 'node:path';

import './utils/bootstrap.js'; // !!! Этот импорт должен быть первым
import { sendReplyFromAssistant } from './utils/chat.js';
import { recognizeVoice, iamToken } from './utils/yandex.js';
import { requestAssist } from './utils/openai.js';

import {
    getAssistantContext,
    getCharactersButtons,
    characterDefault,
    roles,
    supportedLangs,
    langDefault,
    accounts,
    languageButtons
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
 * @type {Map<number, { lang: string; messages: Array<{role: string; content: string}>; assistantCharacter: string }>}
 */
const chatContextStore = new Map();

const initialChatContext = {
    lang: langDefault,
    messages: [],
    assistantCharacter: characterDefault,
};

const getReplyId = (ctx) => {
    if (ctx.message)
        return ctx.message.from.id;
    
    return ctx.update?.callback_query?.from.id
}

const getUsername = (ctx) => {
    if (ctx.message)
        return ctx.message.from.username;
    
    return ctx.update?.callback_query?.message?.chat?.username
}

const setUserLanguage = async (ctx) => {
    const lang = chatContextStore.get(getReplyId(ctx))?.lang || langDefault;
    await i18next.changeLanguage(lang);
}

const accessDenied = async (t, ctx) => {
    await setUserLanguage(ctx);
    ctx.reply(t('system.messages.unknown-chat'));
}

const replyWithRoles = (ctx) => {
    ctx.reply( i18next.t('system.messages.choose-character') + ': ', {
        reply_markup: {
            inline_keyboard: getCharactersButtons(i18next.t, i18next.language)
        }
    });
}

const replyWithLanguageButtons= (ctx) => {
    ctx.reply( i18next.t('system.messages.choose-character') + ': ', {
        reply_markup: {
            inline_keyboard: [
                languageButtons
            ]
        }
    });
}

const sendMessageToChatGpt = async (ctx, message, id) => {
    if (!chatContextStore.has(id)) {
        chatContextStore.set(id, {
            ...initialChatContext,
        });
    }
    const assistantCharacter = chatContextStore.get(id).assistantCharacter;

    console.debug(`Send request: [${assistantCharacter}] ${message}` );

    const initialContext = [
        ...getAssistantContext(i18next.t, {
            language: 'javascript' // FIXME: пробросить язык для программиста
        })[assistantCharacter]
    ];

    if (!chatContextStore.get(id).messages.length) {
        chatContextStore.set(id, {
            ...chatContextStore.get(id),
            messages: initialContext
        })
    }

    chatContextStore.get(id).messages.push({ role: roles.User, content: message });

    const help = await requestAssist(chatContextStore.get(id).messages);
    const { choices, error } = help;

    if (error) {
        console.debug(error);
        ctx.replyWithHTML(i18next.t('system.messages.error'));
        eraseMessages(getId(ctx));
        return;
    }

    chatContextStore.get(id).messages = [
        ...chatContextStore.get(id).messages,
        ...choices.map(({ message }) => ({ role: message.role, content: message.content }))
    ];

    return choices;
}

const sendTypingAction = (ctx) => {
    ctx.sendChatAction('typing');

    const timer = setInterval(() => {
        ctx.sendChatAction('typing');
    }, 1000);

    return function stop() {
        clearInterval(timer);
    };
};

const eraseMessages = (id) => {
    if (chatContextStore.has(id) && chatContextStore.get(id).messages?.length) {
        chatContextStore.set(id, {
            ...chatContextStore.get(id),
            messages: []
        });
    }
}

const runBot = () => {
    const bot = new Telegraf(process.env.BOT_API_KEY);

    bot.on('callback_query', async (ctx) => {
        if (accounts.length && !accounts.includes(getUsername(ctx))) {
            accessDenied(i18next.t, ctx);
            return;
        }
        const data = ctx.update.callback_query.data;
        const id = getReplyId(ctx);

        switch (data) {
            case 'en':
            case 'ru':
                chatContextStore.set(id, {
                    ...chatContextStore.get(id) || initialChatContext,
                    lang: data
                });
                await setUserLanguage(ctx);
                ctx.replyWithHTML(`<code>${i18next.t('system.messages.lang-changed', { lang: data })}</code>`);
                return;
            default:
                if (getAssistantContext(i18next.t, {
                    language: 'javascript' // FIXME: добавить выбор языков
                })[data]) {
                    ctx.reply(i18next.t('system.messages.change-character', { character: data }));
                    chatContextStore.set(id, {
                        ...chatContextStore.get(id) || initialChatContext,
                        assistantCharacter: data,
                    });
                    return eraseMessages(id);
                }
        }
        ctx.reply(i18next.t('system.messages.unknown-command', { command: data }));
    });

    bot.hears(/\/lang/, (ctx) => {
        if (accounts.length && !accounts.includes(getUsername(ctx))) {
            accessDenied(i18next.t, ctx);
            return;
        }
        replyWithLanguageButtons(ctx);
    })

    bot.hears(/\/start/, (ctx) => {
        if (accounts.length && !accounts.includes(getUsername(ctx))) {
            accessDenied(i18next.t, ctx);
            return;
        }
        eraseMessages(getReplyId(ctx));
        replyWithRoles(ctx);
    })

    bot.hears(/\/role/, (ctx) => {
        if (accounts.length && !accounts.includes(getUsername(ctx))) {
            accessDenied(i18next.t, ctx);
            return;
        }
        eraseMessages(getReplyId(ctx));
        replyWithRoles(ctx);
    })

    bot.on('message', async (ctx) => {
        if (accounts.length && !accounts.includes(getUsername(ctx))) {
            accessDenied(i18next.t, ctx);
            return;
        }

        if (ctx.message.voice) {
            const { voice, from } = ctx.message;
            const { id } = from;
            const { file_id } = voice;
            await setUserLanguage(ctx);
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
                    await setUserLanguage(ctx);
                    const prompt = await recognizeVoice(voiceBuffer, i18next.language);
                    await ctx.replyWithHTML(`<code>${i18next.t('system.messages.prompt', { prompt })}</code>`);
                    const stopTyping = sendTypingAction(ctx);
    
                    const choices = await sendMessageToChatGpt(
                        ctx,
                        prompt,
                        id
                    );
                    stopTyping();
                    sendReplyFromAssistant(ctx, choices);
                } catch (error) {
                    console.debug('Failed voice recognition: ', error?.response?.data.description || error.message);
                    ctx.reply(i18next.t('system.messages.error.voice')); 
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

    bot.launch();
}

iamToken.runUpdates() // Выписываем токен для конвертации голосовых в текст и только после этого запускаем бота
    .then(_updateTimer => { // Можно отписаться от интервала обновления токенов 
        console.debug(`✨ Bot started ✨`)
        runBot();
    });