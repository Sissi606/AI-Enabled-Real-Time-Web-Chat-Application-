const OpenAI = require('openai'); 

const client = new OpenAI({
    baseURL: 'http://127.0.0.1:1234/v1',
    apiKey: 'lm-studio',
    timeout: 90000,
    maxRetries: 0
});
const rewriteModel =
    process.env.LM_STUDIO_REWRITE_MODEL ||
    process.env.LM_STUDIO_MODEL ||
    'google/gemma-3-4b';
const summaryModel =
    process.env.LM_STUDIO_SUMMARY_TEXT_MODEL ||
    rewriteModel;
const imageCaptionModel =
    process.env.LM_STUDIO_IMAGE_CAPTION_MODEL ||
    'qwen/qwen3-vl-8b';

function parseSpeakerMessage(line) {
    const match = String(line).match(/^([^:]{1,40})\s*:\s*(.+)$/);
    if (!match) return null;
    const speaker = match[1].trim();
    const text = match[2].trim();
    if (!speaker || !text) return null;
    return { speaker, text };
}

function normalizeSpeakerName(name) {
    const cleaned = String(name).trim().replace(/\s+/g, ' ');
    if (!cleaned) return 'Unknown';
    return cleaned
        .split(' ')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

const taskStopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'before', 'by', 'for', 'from', 'have', 'i',
    'in', 'is', 'it', 'my', 'of', 'on', 'our', 'please', 'the', 'to', 'we', 'will', 'with',
    'you', 'your', 'am', 'can', 'should', 'tonight', 'today', 'tomorrow'
]);

function stemToken(token) {
    if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
    if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
    if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
    if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
    return token;
}

function getTaskTokenSet(text) {
    return new Set(
        String(text)
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .map((token) => stemToken(token.trim()))
            .filter((token) => token && !taskStopWords.has(token))
    );
}

function taskSimilarity(a, b) {
    const tokensA = getTaskTokenSet(a);
    const tokensB = getTaskTokenSet(b);
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    tokensA.forEach((token) => {
        if (tokensB.has(token)) intersection += 1;
    });

    const union = new Set([...tokensA, ...tokensB]).size;
    return union === 0 ? 0 : intersection / union;
}

function isQuestionLike(text) {
    const value = String(text).trim().toLowerCase();
    if (!value) return false;
    if (value.endsWith('?')) return true;

    return /^(hi|hello|hey)?[\s,]*((can|could|would|will|do|does|did|is|are|what|when|where|who|why|how)\b)/i
        .test(value) || /\b(can|could|would)\s+you\b/i.test(value);
}

function isTaskLike(text) {
    const value = String(text).trim();
    if (!value) return false;
    if (isQuestionLike(value) && !/^action item\b/i.test(value)) return false;

    return (
        /\b(action item|todo|to do|deadline)\b/i.test(value) ||
        /\b(i|we)\s+(will|can|should|plan to|need to|have to|am going to|are going to)\b/i.test(value) ||
        /\b(please)\s+(review|submit|finish|complete|polish|push|update|finalize|check|write|test|deploy)\b/i.test(value) ||
        /\b(completed|done|finished|submitted|pushed|reviewed|resolved|sent)\b/i.test(value)
    );
}

function getTaskStatus(text) {
    return /(completed|done|finished|submitted|pushed|reviewed|resolved|sent)/i.test(String(text))
        ? 'Completed'
        : 'Pending';
}

function cleanTaskText(text) {
    let cleaned = String(text).trim();
    cleaned = cleaned.replace(/^(hi|hello|hey)\s+[a-z]+[,:\-]?\s*/i, '');
    cleaned = cleaned.replace(/^action item\s*[:\-]?\s*/i, '');
    cleaned = cleaned.replace(/^(i|we)\s+(have\s+)?(will|can|am|are|have|need to|plan to|going to)\s+/i, '');
    cleaned = cleaned.replace(/^(i|we)('ll|'ve)\s+/i, '');
    return cleaned.trim();
}

function normalizeTaskCandidate(taskText) {
    let task = cleanTaskText(taskText);
    task = task.replace(/\[shared an image\]/ig, ' ');
    task = task.replace(/\s+/g, ' ').trim();
    task = task.replace(/[.;,:-]+$/g, '').trim();
    task = task.replace(/\b(what are your thoughts|what do you think|any thoughts)\b[\s\S]*$/i, '').trim();
    task = task.replace(/\s+\band\s+(have|has|had)\b[\s\S]*$/i, '').trim();
    task = task.replace(/\s+\bthat\s+i\s+believe\b[\s\S]*$/i, '').trim();
    task = task.replace(/^to\s+/i, '').trim();
    if (!task) return '';
    if (task.length > 120) task = task.slice(0, 120).trim();
    return task;
}

function extractTaskCandidatesFromText(text) {
    const value = String(text).trim();
    if (!value) return [];

    const candidates = [];
    const addCandidate = (raw) => {
        const normalized = normalizeTaskCandidate(raw);
        if (normalized) candidates.push(normalized);
    };

    let match = value.match(/action item\s*[:\-]?\s*(.+?)(?:[.!?]|$)/i);
    if (match && match[1]) addCandidate(match[1]);

    const intentRegex = /\b(?:i|we)\s+(?:will|can|should|plan to|need to|have to|am going to|are going to)\s+(.+?)(?:[.!?]|$)/ig;
    while ((match = intentRegex.exec(value)) !== null) {
        if (match[1]) addCandidate(match[1]);
    }

    const completionRegex = /\b(?:i|we)\s+(?:have\s+)?(?:completed|done|finished|submitted|pushed|reviewed|resolved|sent)\s+(.+?)(?:[.!?]|$)/ig;
    while ((match = completionRegex.exec(value)) !== null) {
        if (match[1]) addCandidate(match[1]);
    }

    const requestRegex = /\bplease\s+(.+?)(?:[.!?]|$)/ig;
    while ((match = requestRegex.exec(value)) !== null) {
        if (match[1]) addCandidate(match[1]);
    }

    if (candidates.length === 0 && isTaskLike(value) && !isQuestionLike(value)) {
        addCandidate(value);
    }

    const seen = new Set();
    return candidates.filter((task) => {
        const key = task.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function findBestMatchingTask(existingItems, newTaskText) {
    let best = null;
    let bestScore = 0;

    existingItems.forEach((item) => {
        const score = taskSimilarity(item.text, newTaskText);
        if (score > bestScore) {
            bestScore = score;
            best = item;
        }
    });

    return bestScore >= 0.4 ? best : null;
}

function extractActionItems(messages) {
    const itemsByPerson = new Map();

    messages.forEach((line) => {
        const parsed = parseSpeakerMessage(line);
        if (!parsed) return;
        if (!isTaskLike(parsed.text)) return;

        const personLabel = normalizeSpeakerName(parsed.speaker);
        const personKey = personLabel.toLowerCase();
        const status = getTaskStatus(parsed.text);
        const taskCandidates = extractTaskCandidatesFromText(parsed.text);
        if (taskCandidates.length === 0) return;

        if (!itemsByPerson.has(personKey)) {
            itemsByPerson.set(personKey, { name: personLabel, items: [] });
        }

        const entry = itemsByPerson.get(personKey);
        const list = entry.items;

        taskCandidates.forEach((task) => {
            const key = task.toLowerCase();
            const existing = list.find((item) => item.key === key) || findBestMatchingTask(list, task);

            if (!existing) {
                list.push({ key, text: task, status });
            } else if (status === 'Completed') {
                existing.status = 'Completed';
            }
        });
    });

    return itemsByPerson;
}

function formatActionItems(itemsByPerson) {
    if (itemsByPerson.size === 0) {
        return 'No action items identified';
    }

    const lines = [];
    itemsByPerson.forEach((entry) => {
        lines.push(`${entry.name}:`);
        entry.items.forEach((item) => {
            lines.push(`- [${item.status}] ${item.text}`);
        });
    });
    return lines.join('\n');
}

function extractSummary(modelText) {
    const text = String(modelText || '').trim();
    if (!text) {
        return 'No summary generated.';
    }

    const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*)$/i);
    return (summaryMatch ? summaryMatch[1] : text).trim() || 'No summary generated.';
}

function buildConversationTextLines(entries) {
    return entries.map((entry) => {
        const username = normalizeSpeakerName(entry.username || 'Unknown');
        const text = String(entry.text || '').trim();
        const hasImage = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(String(entry.image || ''));
        const caption = String(entry.imageCaption || '').trim();
        const imageNote = hasImage
            ? (caption ? `[shared an image: ${caption}]` : '[shared an image]')
            : '';
        const content = text && imageNote
            ? `${text} ${imageNote}`
            : (text || imageNote);
        return `${username}: ${content}`.trim();
    }).filter((line) => line.length > 0);
}

function normalizeSummaryEntries(messages) {
    const entries = [];

    if (!Array.isArray(messages)) {
        return entries;
    }

    messages.forEach((msg) => {
        if (typeof msg === 'string') {
            const line = String(msg).trim();
            if (!line) return;

            const parsed = parseSpeakerMessage(line);
            if (parsed) {
                entries.push({
                    username: normalizeSpeakerName(parsed.speaker),
                    text: parsed.text,
                    image: ''
                });
            } else {
                entries.push({
                    username: 'Unknown',
                    text: line,
                    image: ''
                });
            }
            return;
        }

        if (!msg || typeof msg !== 'object') {
            return;
        }

        const username = normalizeSpeakerName(msg.username || 'Unknown');
        const text = String(msg.text === undefined || msg.text === null ? '' : msg.text).trim();
        const rawImage = String(msg.image === undefined || msg.image === null ? '' : msg.image).trim();
        const image = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(rawImage) ? rawImage : '';
        const imageCaption = String(msg.imageCaption === undefined || msg.imageCaption === null ? '' : msg.imageCaption).trim();

        if (!text && !image && !imageCaption) {
            return;
        }

        entries.push({ username, text, image, imageCaption });
    });

    return entries;
}

function buildFallbackSummary(entries, itemsByPerson, actionItemsText) {
    const summary =
        'The AI summary request timed out, so this response shows extracted action items from the full loaded thread.';

    return (
        `SUMMARY:\n${summary}\n\n` +
        `ACTION ITEMS BY PERSON:\n${actionItemsText}`
    );
}

function buildTextSummaryPrompt(conversationForModel, actionItemsText) {
    return (
        `Conversation thread:\n${conversationForModel}\n\n` +
        `Authoritative action items extracted from the thread:\n${actionItemsText}\n\n` +
        'Respond EXACTLY in this format:\n' +
        'SUMMARY:\n' +
        '<2-4 concise sentences that reflect the full thread>\n\n' +
        'Rules:\n' +
        '- Do not invent tasks not present in the authoritative action-items block.\n' +
        '- If one person posts an update, do not imply other tasks disappeared.'
    );
}

async function requestTextSummary(conversationForModel, actionItemsText, model = summaryModel) {
    return client.chat.completions.create({
        model,
        temperature: 0.0,
        max_tokens: 160,
        messages: [
            {
                role: 'system',
                content:
                    'You are a professional assistant for a chat application. ' +
                    'Analyze the full conversation chronologically. ' +
                    'Return output in plain text only.'
            },
            {
                role: 'user',
                content: buildTextSummaryPrompt(conversationForModel, actionItemsText)
            }
        ]
    });
}

function isTimeoutError(err) {
    return /timed out|timeout/i.test(String((err && err.message) || err || ''));
}

function isSafeImageDataUrl(value) {
    return /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(String(value || ''));
}

async function rewriteMessage(message, context, tone){
    const response = await client.chat.completions.create({
        model: rewriteModel,
        temperature: 0.3,
        messages: [
            {
                role: 'system',
                content: 'You are an AI message polishing assistant for a chat application.' +
                         'Rewrite the user message so it is clearer and language is more appropriate for a work or formal setting' +
                         'Preserve the orginal meaning. Do not add new facts.' +
                          // Avoid being too verbose
                         'Return exactly one polished version only. ' + 
                         'Do not explain your changes.' +
                         'Do not use markdown.' +
                         'Output only the polished message.'
            },
            {
                role: 'user',
                content:
                    `Target context: ${context}\n` + 
                    `Desired tone: ${tone}\n` +
                    `Original message: ${message}`
            }
        ]
    });
    return response.choices[0].message.content.trim();
}

async function captionImage(imageDataUrl, messageText = '') {
    const image = String(imageDataUrl || '').trim();
    if (!isSafeImageDataUrl(image)) {
        throw new Error('Invalid image data.');
    }

    const context = String(messageText || '').trim();
    const response = await client.chat.completions.create({
        model: imageCaptionModel,
        temperature: 0.2,
        max_tokens: 70,
        messages: [
            {
                role: 'system',
                content:
                    'You generate concise image captions for a chat application. ' +
                    'Return one plain sentence only. Focus on concrete visible details and likely work context. ' +
                    'Do not use markdown.'
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text:
                            `Optional message context: ${context || '(none)'}\n` +
                            'Generate a concise caption for this image.'
                    },
                    {
                        type: 'image_url',
                        image_url: { url: image }
                    }
                ]
            }
        ]
    });

    const caption = String(response.choices?.[0]?.message?.content || '').trim();
    return caption.replace(/\s+/g, ' ').slice(0, 180).trim();
}

async function summarizeMessages(messages){
    const normalizedEntries = normalizeSummaryEntries(messages);

    if (normalizedEntries.length === 0) {
        throw new Error('No messages provided for summarization');
    }

    const entriesForModel = normalizedEntries;

    const conversationLines = buildConversationTextLines(entriesForModel);
    const actionItemsByPerson = extractActionItems(conversationLines);
    const actionItemsText = formatActionItems(actionItemsByPerson);
    const conversationForModel = conversationLines.join('\n');

    try {
        const response = await requestTextSummary(
            conversationForModel,
            actionItemsText,
            summaryModel
        );

        const rawText = response.choices[0].message.content.trim();
        const extractedSummary = extractSummary(rawText);

        return (
            `SUMMARY:\n${extractedSummary}\n\n` +
            `ACTION ITEMS BY PERSON:\n${actionItemsText}`
        );
    } catch (err) {
        if (isTimeoutError(err)) {
            return buildFallbackSummary(entriesForModel, actionItemsByPerson, actionItemsText);
        }
        throw err;
    }
}

module.exports = {
    rewriteMessage,
    summarizeMessages,
    captionImage
};
