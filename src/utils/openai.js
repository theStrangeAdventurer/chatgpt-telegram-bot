import { Configuration, OpenAIApi } from 'openai';

const openai = new OpenAIApi(new Configuration({
    apiKey: process.env.GPT_API_KEY,
}));

/**
 * Выполняет запрос к chat gpt
 * 
 * @param {Array<{ role: 'system' | 'assistant' | 'user'; content: string; }>} messages 
 * @returns {{ choices: { message: string }[], error?: import('axios').AxiosError }}
 */
export const requestAssist = async (messages = []) => {
    try {
        const { data } = await openai.createChatCompletion({
            model: 'gpt-4', // https://platform.openai.com/docs/models
            // model: 'gpt-3.5-turbo-16k', // Раскомментируйте эту строку и удалите предыдущую, если у вас нет доступа к gpt-4
            messages: messages
        });
    
        return data;
    } catch (error) {
        return { choices: [], error: error }
    }
};
