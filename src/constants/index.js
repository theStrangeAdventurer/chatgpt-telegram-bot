export const supportedLangs = ['en-EN', 'ru-RU'];

export const langDefault = ['ru-RU'];

// Аккаунты, которые могут писать этому боту, перечисленые через , (без @) в .env файле
// Если ACCOUNTS_WHITE_LIST пустая - бот будет отвечать всем
export const accounts = (process.env.ACCOUNTS_WHITE_LIST || '').trim().split(',');

export const roles = {
    System: 'system',
    User: 'user',
    Assistant: 'assistant', 
};

export const characters = {
    programmer: 'programmer',
    designer: 'designer',
    buddy: 'buddy',
    languageTeacher: 'languageTeacher',
};

export const languageButtons = [
    { text: '🇺🇸 English', callback_data: 'en' },
    { text: '🇷🇺 Русский', callback_data: 'ru' },
];

export const programmingLangButtons = [
    [
        { text: 'Javascript', callback_data: 'programming:js' },
        { text: 'NodeJS', callback_data: 'programming:nodejs' },
        { text: 'Python', callback_data: 'programming:python' },
    ],
    [
        { text: 'Php', callback_data: 'programming:php' },
        { text: 'Rust', callback_data: 'programming:rust' },
        { text: 'Go', callback_data: 'programming:go' },
        { text: 'Solidity', callback_data: 'programming:solidity' },
        { text: 'Any', callback_data: 'programming:-' },
    ]
];

/**
 * Изначальный контекст для ChatGpt
 * 
 * задается с помощью роли system
 * https://platform.openai.com/docs/guides/chat/introduction
 * 
 * @param {import('i18next').t} t 
 * @param {Record<string, any>} interpolation 
 * @returns {Record<string, Array<{ role: string, content: string  }>>}
 */
export const getAssistantContext = (t, interpolation = {}) => {
    const programmerContext = interpolation.language === '-'
        ? t('characters.programmer.context.any', interpolation)
        : t('characters.programmer.context', interpolation);

    return {
        [characters.programmer]: [
            { role: roles.System, content: programmerContext },
        ],
        [characters.designer]: [
            { role: roles.System, content: t('characters.designer.context', interpolation) },
        ],
        [characters.buddy]: [
            { role: roles.System, content: t('characters.buddy.context', interpolation) },
        ],
        [characters.languageTeacher]: [
            { role: roles.System, content: t('characters.languageTeacher.context', interpolation) },
        ],
    }
};

/**
 * Чтобы добавить персонажа, которого будет отыгрывать chat GPT,
 * его нужно описать и в assistantContext и в charactersButtons
 * 
 * @param {import('i18next').t} t
 * @param {'ru' | 'en'} lang
 */
export const getCharactersButtons = (t, lang) => {
    const buttons = [
        [ { text: t('characters.programmer.button'), callback_data: characters.programmer }],
        [ { text: t('characters.designer.button'), callback_data: characters.designer }],
        [ { text: t('characters.buddy.button'), callback_data: characters.buddy }],
    ];

    /**
     * Так как chat gpt 3.5 нормально умеет только в английский,
     * то пока он только учитель английского и больше никакого другого
     */
    if (lang == 'ru') {
        buttons.push([ { text: t('characters.languageTeacher.button'), callback_data: characters.languageTeacher }],)
    }
    return buttons;
};

export const characterDefault = characters.programmer;
