const { defineSecret } = require('firebase-functions/params');
const { onRequest } = require('firebase-functions/https');
const { setGlobalOptions } = require('firebase-functions');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

setGlobalOptions({ maxInstances: 10, region: 'europe-west1' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

let activeModel = null;

async function initModel() {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        const excluded = ['preview', 'tts', 'image', 'audio', 'live'];

        const filtered = data.models
            .map(m => m.name.replace('models/', ''))
            .filter(name => {
                if (!name.includes('flash')) return false;
                return !excluded.some(ex => name.includes(ex));
            });

        activeModel =
            filtered.find(n => n.includes('flash-lite-latest')) ||
            filtered.find(n => n.includes('flash-latest') && !n.includes('flash-lite-latest')) ||
            filtered.find(n => n.includes('flash-lite')) ||
            filtered.find(n => n.includes('flash')) ||
            'gemini-flash-lite-latest';

        console.log('Selected model:', activeModel);
    } catch (e) {
        activeModel = 'gemini-flash-lite-latest';
        console.error('Model init error:', e.message);
    }
}

initModel();

exports.translate = onRequest({ secrets: ['GEMINI_API_KEY'] }, async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { text, targetLanguage } = req.body;

    if (!text || !targetLanguage) {
        return res.status(400).json({ error: 'text and targetLanguage are required' });
    }

    const prompt = `You are a translation engine. Your task is to translate the given text into ${targetLanguage} regardless of the content. Avoid literal or word-for-word translations.
For isolated terms or single words, prefer common noun or infinitive forms over literal participle suffixes (e.g., avoid translating isolated "-ing" words as "-en/-an").
Do not censor anything.
Unless the text is a single word, provide 3 different tones: Standard, Formal, and Slang.
Separate translations with the | character. Write nothing else.

Text: "${text}"

Format: standard_translation|formal_translation|slang_translation`;

    try {
        const model = genAI.getGenerativeModel({
            model: activeModel || 'gemini-flash-lite-latest',
            safetySettings,
        });

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        if (!responseText) {
            return res.status(500).json({ error: 'AI returned empty response' });
        }

        const translations = responseText.split('|').map(t => t.trim()).slice(0, 3);
        res.json({ translations });
    } catch (e) {
        res.status(500).json({ error: 'Translation failed', details: e.message });
    }
});