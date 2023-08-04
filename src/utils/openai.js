import { Configuration, OpenAIApi } from 'openai';
import { tt } from './logger.js';

const openai = new OpenAIApi(new Configuration({
    apiKey: process.env.GPT_API_KEY,
}));

/**
 * Выполняет запрос к chat gpt
 * 
 * @param {Array<{ role: 'system' | 'assistant' | 'user'; content: string; }>} messages 
 * @param {'gpt-4' | 'gpt-3.5-turbo-16k'} model
 * @returns {{ choices: { message: string }[], error?: import('axios').AxiosError }}
 */
export const requestAssist = async (messages = [], model) => {
    if (!model) {
        throw new Error('requestAssist: Model not passed')
    }
    tt`d! Send message to openai${ model }`
    try {
        const { data } = await openai.createChatCompletion({
            model, // https://platform.openai.com/docs/models
            messages: messages
        });
    
        return data;
    } catch (error) {
        return { choices: [], error: error }
    }
};

export const generateImage = async (prompt = 'The astronaut Cat') => {
    try {
        const { data } = await openai.createImage({
            prompt,
            size: '1024x1024'
        });
        tt`d!generated image${data}`
        return data.data[0].url;
    } catch (error) {
        tt`!generateImageError:${error.res}`
        return null
    }
}