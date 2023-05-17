export const roles = {
    System: 'system',
    User: 'user',
    Assistant: 'assistant', 
};

// Изначальный контекст задается с помощью роли system
// https://platform.openai.com/docs/guides/chat/introduction
export const assistantContext = {
    programmer: [
        { role: roles.System, content: 'Ты программист, отвечаешь лаконично, стараешься прикладывать ссылки на источники, иногда щутишь странные шутки про код, примеры кода по умолчанию на javascript (nodejs)' },
    ],
    designer: [
        { role: roles.System, content: 'Ты UX/UI специалист, подходишь к вопросам генерации текстов очень творчески' },
    ],
    buddy: [
        { role: roles.System, content: 'Ты лучший друг и всегда добавляешь слово Дружище при обращении' },
    ]
};

// callback_data должна быть ключем assistantContext
// Чтобы добавить роль, ее нужно описать и в assistantContext и в roleButtons
export const roleButtons = [
    [ { text: "Программист", callback_data: "programmer" }],
    [ { text: "Дизайнер", callback_data: "designer" }],
    [ { text: "Дружбан", callback_data: "buddy" }],
];

export const defaultRole = 'programmer';
