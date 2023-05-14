import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import axios from 'axios';
import { Configuration, OpenAIApi } from 'openai';
import showdown from 'showdown';

dotenv.config();

const converter = new showdown.Converter();

// Пока не испоьлзуется, возможно понадобится, если буду делать web морду
const getHtmlfromMarkdown = (text) => converter.makeHtml(textStr);

// Аккаунты, которые могут писать этому боту, перечисленые через , (без @) в .env файле
const accounts = (process.env.ACCOUNTS_WHITE_LIST || '').trim().split(',');

const configuration = new Configuration({
  apiKey: process.env.GPT_API_KEY,
});

const openai = new OpenAIApi(configuration);

const roles = {
    System: 'system',
    User: 'user',
    Assistant: 'assistant', 
}

const defaultRole = 'programmer';

// Изначальный контекст задается с помощью роли system
// https://platform.openai.com/docs/guides/chat/introduction
const assistantContext = {
    programmer: [
        { role: roles.System, content: 'Ты помогаешь решать задачи программирования и всегда объяснаяешь все максимально подробно и прикладываешь ссылки' },
    ],
    designer: [
        { role: roles.System, content: 'Ты очень творческая натура и общаешься в френдли стиле, готов генерировать новые и смелые идеи' },
    ],
    buddy: [
        { role: roles.System, content: 'Ты лучший друг и всегда добавляешь слово Дружище при обращении' },
    ]
};

// Тут храним контекст сообщений для каждого чата
const messagesStore = new Map();

// Тут храним роль для ассистента для каждого чата
const assistantInitialContextStore = new Map();

// TODO: Нормально обработать завезервированные символы
const sendReply = (ctx, choices) => {
    const textStr = choices.map(({ message }) => message.content).join('\n');

    ctx.reply(textStr
            .replace(/\./g, "\\.")
            .replace(/-/g, "\-")
            .replace(/\(/g, "\(")
            .replace(/\)/g, "\)")
        , { parse_mode: 'MarkdownV2' })
        .catch((error) => {
            // TODO: Добавить нормальный логгер
            // error?.response?.description || 'Unexpected error'
            console.log('Error: ', error?.response?.description || error);
            ctx.reply(textStr);
        })
}

const accessDenied = (ctx) => {
    ctx.reply('Извини, я тебя не знаю...')
}

const requestAssist = async (messages = []) => {
    const { data } = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: messages
    });

    return data;
};

const recognizeVoice = async (buffer) => {
    const response = await axios({
        method: 'post',
        url: `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${process.env.BUCKET_ID}&lang=ru-RU`,
        headers: {
          Authorization: `Bearer ${process.env.YC_TOKEN}`,
          'Content-Type': 'application/octet-stream'
        },
        data: buffer
      });
    return response.data?.result || 'Не распознано' ;
};

const bot = new Telegraf(process.env.BOT_API_KEY);

const sendMessageToChatGpt = async (message, id) => {
    const assistantRole = assistantInitialContextStore.get(id) || defaultRole;

    console.debug('Send request: ', message, assistantRole);

    const initialContext = [
        ...assistantContext[assistantRole]
    ];

    let messages = messagesStore.get(id) || initialContext;

    messages = [
        ...messages,
        { role: roles.User, content: message }
    ];

    console.dir(messages);
    const help = await requestAssist(messages);
    const { choices } = help;
    
    messages = [
        ...messages,
        ...choices.map(({ message }) => ({ role: message.role, content: message.content }))
    ];

    messagesStore.set(id, messages);

    return choices;
}

bot.on('callback_query', (ctx) => {
    const username = ctx.update.callback_query.message.chat.username;
    if (accounts.length && !accounts.includes(username)) {
        accessDenied(ctx);
        return;
    }
    const data = ctx.update.callback_query.data;
    const id = ctx.update.callback_query.from.id;

    if (assistantContext[data]) {
        ctx.reply('Выбрана роль: ' + data + ', весь предыдущий контекст забывается...');
        assistantInitialContextStore.set(id, data);
        messagesStore.delete(id);
        return;
    }

    ctx.reply('Неизвестная команда: ' + data);
    
});

bot.on('text', async (ctx) => {
    if (accounts.length && !accounts.includes(ctx.message.from.username)) {
        accessDenied(ctx);
        return;
    }
    switch(ctx.message.text) {
        case '/start':
            if (messagesStore.has(ctx.message.from.id)) {
                messagesStore.delete(ctx.message.from.id);
                ctx.replyWithHTML(`<code>Стер всю память боту, теперь он ничего не помнит</code>`);
            } else {
                ctx.reply('Привет! Выбери роль ассистента: ', {
                    reply_markup: {
                        inline_keyboard: [
                            [ { text: "Программист", callback_data: "programmer" }],
                            [ { text: "Дизайнер", callback_data: "designer" }],
                            [ { text: "Дружбан", callback_data: "buddy" }],
                        ]
                    } 
                });
            }
            break;
        case '/role':
            ctx.reply('Выбери роль ассистента: ', {
                // TODO: Убрать дубликат кода
                reply_markup: {
                    inline_keyboard: [
                        [ { text: "Программист", callback_data: "programmer" }],
                        [ { text: "Дизайнер", callback_data: "designer" }],
                        [ { text: "Дружбан", callback_data: "buddy" }],
                    ]
                } 
            });
            break;
        default:
            if (ctx.message.text.startsWith('/')) {
                ctx.reply('Неизвестная команда: ' + ctx.message.text);
                return;
            }
            ctx.replyWithHTML(`<code>Запрос: ${ctx.message.text}</code>`);
            const choices =  await sendMessageToChatGpt(ctx.message.text);
            sendReply(ctx, choices);
    }
});

bot.on('voice', (ctx) => {
    if (accounts.length && !accounts.includes(ctx.message.from.username)) {
        accessDenied(ctx);
        return;
    }
    const { voice, from } = ctx.message;
    const { id } = from;
    const { file_id } = voice;
    ctx.replyWithHTML(`<code>Обрабатываю запрос...</code>`);
    ctx.telegram.getFileLink(file_id).then(async (fileLink) => {
        // Получаем ссыль на голосовое сообщение
        const { href } = fileLink;
        // Получаем данные в ArrayBuffer и их же передаем в Yandex Speech Kit
        const { data: voiceBuffer } = await axios.get(href, { responseType: 'arraybuffer' });
        // Таким образом обходимся без установки ffmpeg и
        // Промежуточного сохранения и конвертирования файла
        const propmt = await recognizeVoice(voiceBuffer);
        ctx.replyWithHTML(`<code>Запрос: ${propmt}</code>`);
        const choices = await sendMessageToChatGpt(
            propmt,
            id
        );
        sendReply(ctx, choices);
    });
});

bot.launch();