# Телеграм бот для общения с CHAT GPT
> Chat Gpt Telegram bot using Yandex SpeechKit, telegraf and openai

С ботом можно общаться текстом и голосом, умеет отвечать с разметкой в markdown (Удобно читать сниппеты с кодом  копировать). Бот также умеет отвечать голосовыми, можно настроить определенный голос, в зависимости от выбранного персонажа и языка (см. `src/utils/yandex.js`).

## Что по ценам?
Выходит довольно бюджетно(лично для меня), цифры очень примерные, точных замеров не проводил:
- Cloud AI	SpeechKit — распознавание речи 4,16₽ - За вечер отослал порядка 30 запросов
- platform.openai.com API chat gpt - $0.02 за это же кол-во запросов

> Вышеописанные цены более менее актуальны для модели gpt 3.5, для 4 версии никаких измерений не проводилось

## Быстрый старт

Проект использует:
- Yandex [speech kit](https://cloud.yandex.ru/services/speechkit) для преобразования голосовых сообщений в текст. Нужно завести там аккаунт и [получить идентификатор каталога](https://cloud.yandex.ru/docs/resource-manager/operations/folder/get-id) (ID которого нужно указать в `FOLDER_ID` в `.env`) 
- [API](https://platform.openai.com/account/api-keys) от openai для обработки запросов

### Создайте .env файл в корне с таким содержимым

```sh
BOT_API_KEY=<API ключ из @BotFather>
YA_PASSPORT_TOKEN=<https://oauth.yandex.ru/authorize?response_type=token&client_id=1a6990aa636648e9b2ef855fa7bec2fb>
FOLDER_ID=<https://cloud.yandex.ru/folders/FOLDER_ID>
GPT_API_KEY=<https://platform.openai.com/account/api-keys>
ACCOUNTS_WHITE_LIST=login1,login2 # Логины для которых должен быть доступен бот, если не указаны, бот будет доступен для всех
```

### Установка пакетов и старт

`npm install && npm start`
