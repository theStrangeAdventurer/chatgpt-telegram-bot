import markdownEscape from 'markdown-escape';
import showdown from 'showdown';

const converter = new showdown.Converter();

// Пока не испоьлзуется, возможно понадобится, если буду делать web морду
export const getHtmlfromMarkdown = (text) => converter.makeHtml(textStr);

export function cleanMarkdown(text) {
    return markdownEscape(text);
}

export const cleanSpecialSymbols = (textStr) => textStr.replace(/([\#\*\|\~\=\.\\\-\{\}\(\)\!])/g, '\\$1');
   
  