# Телеграм бот для общения с CHAT GPT
> Chat Gpt Telegram bot using Yandex SpeechKit, telegraf and openai

С ботом можно общаться текстом и голосом, умеет отвечать с разметкой в markdown (Удобно читать сниппеты с кодом  копировать)

## Что по ценам?
Выходит довольно бюджетно(лично для меня), цифры очень примерные, точных замеров не проводил:
- Cloud AI	SpeechKit — распознавание речи 4,16₽ - За вечер отослал порядка 30 запросов
- platform.openai.com API chat gpt - $0.02 за это же кол-во запросов

## Быстрый старт

Проект использует:
- Yandex [speech kit](https://cloud.yandex.ru/services/speechkit) для преобразования голосовых сообщений в текст. Нужно завести там аккаунт и создать в yandex cloud бакет (ID которого нужно указать в `BUCKET_ID` в `.env`, видимо в этом бакете создаются временные файлы для распознавания)
- [API](https://platform.openai.com/account/api-keys) от openai для обработки запросов

### Создайте .env файл в корне с таким содержимым

```
BOT_API_KEY=<API ключ из @BotFather>
YC_TOKEN=<YC iam token https://cloud.yandex.ru/docs/iam/operations/iam-token/create>
BUCKET_ID=<ID бакета в https://cloud.yandex.ru/folders/<ID>>
GPT_API_KEY=<https://platform.openai.com/account/api-keys>
```

### Установка пакетов и старт

`npm install && npm start`
