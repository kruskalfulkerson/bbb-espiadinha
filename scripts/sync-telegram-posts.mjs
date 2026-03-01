import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const CHANNEL = process.env.TG_CHANNEL || 'espiadinha';
const SOURCE_URL = `https://t.me/s/${CHANNEL}`;
const ROOT = process.cwd();
const POSTS_FILE = path.join(ROOT, 'public', 'posts.json');
const RECENT_REFRESH_PAGES = Math.max(1, Number.parseInt(process.env.TG_RECENT_REFRESH_PAGES || '6', 10));
const BACKFILL_PAGE_LIMIT = Math.max(1, Number.parseInt(process.env.TG_BACKFILL_PAGE_LIMIT || '5000', 10));
const FIRST_POST_ID = Math.max(1, Number.parseInt(process.env.TG_FIRST_POST_ID || '168574', 10));
const USER_AGENT =
  process.env.TG_USER_AGENT ||
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const NAVIGATION_TIMEOUT_MS = Math.max(10_000, Number.parseInt(process.env.TG_NAVIGATION_TIMEOUT_MS || '45000', 10));
const STABILIZE_TIMEOUT_MS = Math.max(250, Number.parseInt(process.env.TG_STABILIZE_TIMEOUT_MS || '1500', 10));

const decodeCompactNumber = (value) => {
  if (!value) return 0;
  const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.').toUpperCase();
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)([KMB])?$/);
  if (!match) {
    const digits = normalized.replace(/[^0-9]/g, '');
    return digits ? Number(digits) : 0;
  }
  const number = Number(match[1]);
  const suffix = match[2];
  if (suffix === 'K') return Math.round(number * 1_000);
  if (suffix === 'M') return Math.round(number * 1_000_000);
  if (suffix === 'B') return Math.round(number * 1_000_000_000);
  return Math.round(number);
};


const toSaoPauloIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const shifted = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const pad = (num) => String(num).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}-03:00`;
};

const uniqueByEmojiMaxCount = (reactions) => {
  const merged = new Map();
  for (const reaction of reactions || []) {
    const emoji = String(reaction?.emoji || '').trim();
    const count = Number(reaction?.count || 0);
    if (!emoji || !Number.isFinite(count) || count <= 0) continue;
    merged.set(emoji, Math.max(count, merged.get(emoji) || 0));
  }
  return [...merged.entries()]
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count);
};

const normalizeMediaType = (value) => {
  if (value === 'video' || value === 'other' || value === 'image') return value;
  return 'none';
};

const normalizeMessage = (message) => {
  const reactions = uniqueByEmojiMaxCount(message.reactions || []);
  const totalReactions = Math.max(
    Number.isFinite(message.totalReactions) ? Number(message.totalReactions) : 0,
    reactions.reduce((sum, item) => sum + item.count, 0),
  );
  const video = message.video || null;
  const photo = message.photo || null;
  const hasMedia = Boolean(message.hasMedia ?? photo ?? video);
  let mediaType = normalizeMediaType(message.mediaType);
  if (mediaType === 'none' && video) mediaType = 'video';
  if (mediaType === 'none' && photo) mediaType = 'image';
  if (mediaType === 'none' && hasMedia) mediaType = 'other';

  return {
    id: Number(message.id),
    date: toSaoPauloIso(message.date || null),
    text: String(message.text || '').trim(),
    photo,
    video,
    hasMedia,
    mediaType,
    reactions,
    totalReactions,
    postUrl: message.postUrl || `https://t.me/${CHANNEL}/${message.id}`,
  };
};

const loadExistingPayload = async () => {
  try {
    const content = await fs.readFile(POSTS_FILE, 'utf8');
    const payload = JSON.parse(content);
    const posts = Array.isArray(payload)
      ? payload.map(normalizeMessage)
      : Array.isArray(payload?.posts)
        ? payload.posts.map(normalizeMessage)
        : [];

    return {
      metadata: payload?.metadata || null,
      posts,
    };
  } catch {
    return { metadata: null, posts: [] };
  }
};

const mergeSingleMessage = (current, incoming, { preferIncoming = false } = {}) => {
  const reactions = uniqueByEmojiMaxCount([...(current?.reactions || []), ...(incoming?.reactions || [])]);
  const totalReactions = Math.max(
    Number(current?.totalReactions || 0),
    Number(incoming?.totalReactions || 0),
    reactions.reduce((sum, item) => sum + item.count, 0),
  );
  const currentText = String(current?.text || '').trim();
  const incomingText = String(incoming?.text || '').trim();

  return normalizeMessage({
    ...current,
    ...incoming,
    text: preferIncoming
      ? incomingText || currentText
      : incomingText.length >= currentText.length
        ? incomingText
        : currentText,
    photo: incoming?.photo || current?.photo || null,
    video: incoming?.video || current?.video || null,
    hasMedia: Boolean(incoming?.hasMedia ?? current?.hasMedia ?? incoming?.photo ?? current?.photo ?? incoming?.video ?? current?.video),
    mediaType:
      incoming?.mediaType && incoming.mediaType !== 'none'
        ? incoming.mediaType
        : current?.mediaType || (incoming?.video || current?.video ? 'video' : incoming?.photo || current?.photo ? 'image' : 'none'),
    reactions,
    totalReactions,
    postUrl: incoming?.postUrl || current?.postUrl || `https://t.me/${CHANNEL}/${incoming?.id || current?.id}`,
    date: incoming?.date || current?.date || null,
  });
};

const mergePosts = (existing, incoming, recentIds = new Set()) => {
  const merged = new Map(existing.map((message) => [message.id, message]));
  let changed = false;

  for (const message of incoming) {
    const current = merged.get(message.id);
    if (!current) {
      merged.set(message.id, message);
      changed = true;
      continue;
    }

    const next = mergeSingleMessage(current, message, { preferIncoming: recentIds.has(message.id) });
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      merged.set(message.id, next);
      changed = true;
    }
  }

  return {
    changed,
    posts: [...merged.values()].sort((a, b) => b.id - a.id),
  };
};

const writePostsFile = async (posts) => {
  const ids = posts.map((item) => item.id).filter((value) => Number.isFinite(value));
  const earliestId = ids.length ? Math.min(...ids) : null;
  const latestId = ids.length ? Math.max(...ids) : null;
  const payload = {
    metadata: {
      channel: CHANNEL,
      source: SOURCE_URL,
      syncedAt: new Date().toISOString(),
      count: posts.length,
      latestId,
      earliestId,
      firstPostId: FIRST_POST_ID,
      backfillComplete: earliestId !== null ? earliestId <= FIRST_POST_ID : false,
      recentRefreshPages: RECENT_REFRESH_PAGES,
      scraper: 'playwright',
    },
    posts,
  };

  await fs.mkdir(path.dirname(POSTS_FILE), { recursive: true });
  await fs.writeFile(POSTS_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const createScraper = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 2200 },
    locale: 'pt-BR',
    colorScheme: 'dark',
    extraHTTPHeaders: {
      'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);

  const collectPage = async (url) => {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.tgme_widget_message', { timeout: NAVIGATION_TIMEOUT_MS });
    if (STABILIZE_TIMEOUT_MS > 0) {
      await page.waitForTimeout(STABILIZE_TIMEOUT_MS);
    }

    const rawItems = await page.evaluate(({ channel }) => {
      const absolutizeUrl = (value) => {
        if (!value) return null;
        const text = String(value);
        if (/^https?:\/\//i.test(text)) return text;
        if (text.startsWith('//')) return `https:${text}`;
        if (text.startsWith('/')) return `https://t.me${text}`;
        return text;
      };

      const extractUrlFromStyle = (style) => {
        const match = String(style || '').match(/url\((['"]?)(.*?)\1\)/i);
        if (!match?.[2]) return null;
        return absolutizeUrl(match[2].replace(/&amp;/g, '&'));
      };

      const getRenderedText = (node) =>
        String(node?.innerText || node?.textContent || '')
          .replace(/\u00a0/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

      const normalizeSpace = (value) => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

      const looksLikeEmoji = (value) => {
        const label = normalizeSpace(value);
        if (!label || label.length > 24) return false;
        if (/views?|edited|telegram|abrir|open|share|forwarded|channel|image|canal|context/i.test(label)) return false;
        return /\p{Extended_Pictographic}|[❤♥️🔥]/u.test(label);
      };

      const decodeCompactNumber = (value) => {
        if (!value) return 0;
        const normalized = normalizeSpace(value).replace(',', '.').toUpperCase();
        const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)([KMB])?$/);
        if (!match) {
          const digits = normalized.replace(/[^0-9]/g, '');
          return digits ? Number(digits) : 0;
        }
        const number = Number(match[1]);
        const suffix = match[2];
        if (suffix === 'K') return Math.round(number * 1_000);
        if (suffix === 'M') return Math.round(number * 1_000_000);
        if (suffix === 'B') return Math.round(number * 1_000_000_000);
        return Math.round(number);
      };

      const parseEmojiCountPairs = (value) => {
        const text = normalizeSpace(value)
          .replace(/[•·]/g, ' ')
          .replace(/(\d)(\p{Extended_Pictographic}|[❤♥️🔥])/gu, '$1 $2')
          .replace(/(\p{Extended_Pictographic}|[❤♥️🔥])(\d)/gu, '$1 $2');

        const pattern = /((?:\p{Extended_Pictographic}|[❤♥️🔥])(?:[\uFE0F\u200D\p{Extended_Pictographic}]*)?)\s*([0-9]+(?:[.,][0-9]+)?[KMB]?)/gu;
        const pairs = [];
        for (const match of text.matchAll(pattern)) {
          const emoji = normalizeSpace(match[1]);
          const count = decodeCompactNumber(match[2]);
          if (looksLikeEmoji(emoji) && count > 0) {
            pairs.push({ emoji, count });
          }
        }
        return pairs;
      };

      const dedupeReactions = (reactions) => {
        const merged = new Map();
        for (const item of reactions || []) {
          const emoji = normalizeSpace(item?.emoji);
          const count = Number(item?.count || 0);
          if (!emoji || !Number.isFinite(count) || count <= 0) continue;
          merged.set(emoji, Math.max(count, merged.get(emoji) || 0));
        }
        return [...merged.entries()].map(([emoji, count]) => ({ emoji, count })).sort((a, b) => b.count - a.count);
      };

      const extractReactions = (root) => {
        const reactions = [];
        const pushMany = (pairs) => {
          for (const pair of pairs || []) reactions.push(pair);
        };

        const scopedSelectors = [
          '.tgme_widget_message_reactions',
          '.tgme_widget_message_footer',
          '.tgme_widget_message_info',
          '[class*="reaction"]',
          '[class*="footer"]',
        ];

        for (const selector of scopedSelectors) {
          root.querySelectorAll(selector).forEach((node) => {
            const text = getRenderedText(node);
            if (text) pushMany(parseEmojiCountPairs(text));
          });
        }

        root.querySelectorAll('[class*="reaction"], button, a, span, div').forEach((node) => {
          const bits = [
            node.getAttribute('aria-label'),
            node.getAttribute('title'),
            node.getAttribute('data-reaction'),
            node.getAttribute('data-count'),
            node.getAttribute('data-counter'),
            getRenderedText(node),
          ].filter(Boolean);

          node.querySelectorAll('img[alt]').forEach((img) => bits.push(img.getAttribute('alt') || ''));
          const text = normalizeSpace(bits.join(' '));
          if (text) pushMany(parseEmojiCountPairs(text));
        });

        const deduped = dedupeReactions(reactions);
        const total = deduped.reduce((sum, item) => sum + item.count, 0);
        return { reactions: deduped, totalReactions: total };
      };

      const messages = Array.from(document.querySelectorAll('.tgme_widget_message'));
      return messages
        .map((element) => {
          const dataPost = element.getAttribute('data-post') || '';
          const idMatch = dataPost.match(/([^/]+)\/(\d+)/);
          if (!idMatch) return null;
          const id = Number(idMatch[2]);
          if (!Number.isFinite(id)) return null;

          const hasVideo = Boolean(element.querySelector('video, .tgme_widget_message_video, .tgme_widget_message_roundvideo'));
          const video =
            absolutizeUrl(element.querySelector('video source')?.getAttribute('src')) ||
            absolutizeUrl(element.querySelector('video')?.getAttribute('src')) ||
            null;
          const photo =
            extractUrlFromStyle(element.querySelector('.tgme_widget_message_photo_wrap')?.getAttribute('style')) ||
            extractUrlFromStyle(element.querySelector('.tgme_widget_message_video_thumb')?.getAttribute('style')) ||
            absolutizeUrl(element.querySelector('video')?.getAttribute('poster')) ||
            null;
          const hasDocumentMedia = Boolean(element.querySelector('.tgme_widget_message_document_wrap, .tgme_widget_message_animation'));
          const mediaType = hasVideo ? 'video' : photo ? 'image' : hasDocumentMedia ? 'other' : 'none';
          const hasMedia = mediaType !== 'none';
          const date = element.querySelector('time')?.getAttribute('datetime') || null;
          const text = getRenderedText(element.querySelector('.tgme_widget_message_text'));
          const postUrl = absolutizeUrl(element.querySelector('.tgme_widget_message_date')?.getAttribute('href')) || `https://t.me/${channel}/${id}`;
          const reactionData = extractReactions(element);

          return {
            id,
            date,
            text,
            photo,
            video,
            hasMedia,
            mediaType,
            reactions: reactionData.reactions,
            totalReactions: reactionData.totalReactions,
            postUrl,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.id - a.id);
    }, { channel: CHANNEL });

    return rawItems.map(normalizeMessage);
  };

  const close = async () => {
    await context.close();
    await browser.close();
  };

  return { collectPage, close };
};

const collectPages = async ({ scraper, startBefore = null, pageLimit, stopAtOrBelowId = null, label }) => {
  const collected = [];
  let before = startBefore;
  let page = 0;

  while (page < pageLimit) {
    const url = before ? `${SOURCE_URL}?before=${before}` : SOURCE_URL;
    const posts = await scraper.collectPage(url);

    if (!posts.length) break;

    collected.push(...posts);
    const oldestId = Math.min(...posts.map((item) => item.id));
    const newestId = Math.max(...posts.map((item) => item.id));
    page += 1;
    console.log(`[${label}] página ${page}: ${posts.length} posts (${newestId} → ${oldestId})`);

    if (!Number.isFinite(oldestId)) break;
    if (stopAtOrBelowId && oldestId <= stopAtOrBelowId) break;
    if (before === oldestId) break;
    before = oldestId;
  }

  return [...new Map(collected.map((item) => [item.id, item])).values()].sort((a, b) => b.id - a.id);
};

const main = async () => {
  const existingPayload = await loadExistingPayload();
  const existingPosts = existingPayload.posts;
  const earliestExistingId = existingPosts.length ? Math.min(...existingPosts.map((item) => item.id)) : null;
  const backfillComplete = Boolean(existingPayload.metadata?.backfillComplete) && Boolean(earliestExistingId && earliestExistingId <= FIRST_POST_ID);

  const scraper = await createScraper();

  try {
    console.log(`Sincronizando @${CHANNEL} com Playwright. Atualização recente: ${RECENT_REFRESH_PAGES} páginas. Primeiro post alvo: ${FIRST_POST_ID}.`);
    const recentPosts = await collectPages({
      scraper,
      startBefore: null,
      pageLimit: RECENT_REFRESH_PAGES,
      label: 'recentes',
    });

    let olderPosts = [];
    if (!backfillComplete) {
      const backfillStartBefore = earliestExistingId ?? (recentPosts.length ? Math.min(...recentPosts.map((item) => item.id)) : null);
      olderPosts = await collectPages({
        scraper,
        startBefore: backfillStartBefore,
        pageLimit: BACKFILL_PAGE_LIMIT,
        stopAtOrBelowId: FIRST_POST_ID,
        label: 'backfill',
      });
    }

    const incoming = [...recentPosts, ...olderPosts];
    if (!incoming.length) {
      if (!existingPosts.length) {
        throw new Error('Nenhum post encontrado para criar o arquivo inicial.');
      }
      console.log('Nenhum post retornado agora; mantendo public/posts.json atual.');
      return;
    }

    const recentIds = new Set(recentPosts.map((item) => item.id));
    const merged = mergePosts(existingPosts, incoming, recentIds);
    if (!merged.changed && existingPosts.length) {
      console.log('Sem mudanças materiais detectadas nesta sincronização.');
      return;
    }

    await writePostsFile(merged.posts);
    const earliestMergedId = merged.posts.length ? Math.min(...merged.posts.map((item) => item.id)) : null;
    console.log(
      `Arquivo atualizado com ${merged.posts.length} posts. Intervalo atual: ${earliestMergedId ?? 'n/d'} → ${merged.posts[0]?.id ?? 'n/d'}.`,
    );
    if (earliestMergedId && earliestMergedId > FIRST_POST_ID) {
      console.log(`Backfill ainda pendente. Faltam posts anteriores ao ID ${earliestMergedId}.`);
    }
  } finally {
    await scraper.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
