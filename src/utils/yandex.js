import axios from 'axios';
import FormData from 'form-data';

/**
 * Получаем и обновляем iam токен
 * Концепции https://cloud.yandex.ru/docs/iam/concepts/authorization/iam-token
 * @type{{value: null | string; runUpdates: () => Promise<NodeJS.Timer>}}
 */
export const iamToken = {
    value: null,
    async runUpdates() {
        const { iamToken } = await getIamToken();
        this.value = iamToken;
        const interval = setInterval(async () => {
            const { iamToken: intervalToken } = await getIamToken();
            this.value = intervalToken;
        }, 1000 * 60 * 60); // Раз в час выписываем новый iam токен, потому что он протухает за 12 часов
        return interval;
    }
}

/**
 * Получение iam токена https://cloud.yandex.ru/docs/iam/operations/iam-token/create
 * @returns {Promise<{ iamToken: string; expiresAt?: string }>}
 */
export const getIamToken = async () => {
    try {
        const { data } = await axios.post('https://iam.api.cloud.yandex.net/iam/v1/tokens', {
            yandexPassportOauthToken: process.env.YA_PASSPORT_TOKEN
        });
        return data;
    } catch (err) {
        console.error('Error get iam token: ', err?.response?.description || err?.message)
        return { iamToken: null };
    }
}

/**
 * Распознавание речи через Yandex Speech Kit
 * https://cloud.yandex.ru/docs/speechkit/quickstart
 * @param {ArrayBuffer} buffer голосовое сообщение в виде ArrayBuffer
 * @param {'ru' | 'en'} lang 
 * @returns {string}
 */
export const recognizeVoice = async (buffer, lang = 'ru') => {
    const response = await axios({
        method: 'post',
        url: `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${process.env.BUCKET_ID}&lang=${lang}`,
        headers: {
          Authorization: `Bearer ${iamToken.value}`,
          'Content-Type': 'application/octet-stream'
        },
        data: buffer
      });
    return response.data?.result || '' ;
};

export const vocalizeText = async (text, lang = 'ru') => {
    const formData = new FormData();

    formData.append('text', text);
    formData.append('lang', lang);
    formData.append('voice', 'filipp');
    formData.append('folderId', process.env.BUCKET_ID);

    const headers = {
        Authorization: `Bearer ${iamToken.value}`,
        ...formData.getHeaders()
    };

    const response = await axios.post('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', formData, {
        headers,
        responseType: 'arraybuffer',
    });

    return response.data; 
}
