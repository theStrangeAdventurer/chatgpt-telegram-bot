export type UserContext = {
    model: 'gpt-3.5-turbo-16k' | 'gpt-4';
    enableVoiceResponse: boolean;
    assistantCharacterExtra: Record<string, string>;
    lang: string;
    messages: Array<{ role: string; content: string }>;
    assistantCharacter: string;
    waitForImagePrompt: boolean;
}