import { participants } from '../data/participants';

export type Reaction = {
  emoji: string;
  count: number;
};

export type MediaType = 'none' | 'image' | 'video' | 'other';

export type Message = {
  id: number;
  date: string;
  text: string;
  photo: string | null;
  video?: string | null;
  hasMedia?: boolean;
  mediaType?: MediaType;
  reactions: Reaction[];
  totalReactions?: number;
  postUrl?: string | null;
};

export type PostsMetadata = {
  channel: string;
  source: string;
  syncedAt: string | null;
  count: number;
  latestId: number | null;
  earliestId: number | null;
  firstPostId?: number | null;
  backfillComplete?: boolean;
  recentRefreshPages?: number | null;
};

export type PostsFile = {
  metadata: PostsMetadata;
  posts: Message[];
};

export type MentionRanking = {
  name: string;
  fullName: string;
  count: number;
  image: string;
  eliminated: boolean;
};

export type Insights = {
  totalMessages: number;
  totalReactions: number;
  messagesWithMedia: number;
  messagesWithReactions: number;
  mediaRatio: number;
  reactionRatio: number;
  uniqueReactionCount: number;
  globalMentions: Record<string, number>;
  mentionRanking?: MentionRanking[];
  topReactions: { emoji: string; count: number }[];
  avgReactions: number;
  activityByHour: number[];
  peakHour: number;
  topMessage: Message | null;
  topParticipantName: string;
  topParticipantCount: number;
  latestMessageDate: string | null;
  earliestMessageDate: string | null;
};

export type SortBy = 'latest' | 'hot' | 'oldest';

type EnrichedMessage = Message & {
  normalizedText: string;
  mentionedParticipants: string[];
  matchedGameTerms: string[];
  hasParticipantMention: boolean;
  hasRelevantMention: boolean;
};

const GAME_TERMS = [
  'anjo',
  'prova',
  'sincerao',
  'sincerinho',
  'lider',
  'lideranca',
  'monstro',
  'paredao',
  'big fone',
  'votacao',
  'castigo',
  'imunidade',
  'imune',
] as const;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const getDateOnly = (value: string) => value?.slice(0, 10) ?? '';

export const normalize = (value: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const getReactionTotal = (reactions: Reaction[] | undefined) =>
  (reactions || []).reduce((sum, reaction) => {
    const count = Number(reaction?.count || 0);
    return sum + (Number.isFinite(count) ? count : 0);
  }, 0);

export const getMessageReactionTotal = (message: Pick<Message, 'reactions' | 'totalReactions'> | null | undefined) => {
  const explicitTotal = Number(message?.totalReactions || 0);
  const reactionsTotal = getReactionTotal(message?.reactions);
  return Math.max(Number.isFinite(explicitTotal) ? explicitTotal : 0, reactionsTotal);
};

export const safeDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const countMentions = (normalizedText: string, query: string) => {
  const safe = escapeRegex(normalize(query));
  if (!safe) return false;
  const regex = new RegExp(`(^|[^a-z0-9])${safe}([^a-z0-9]|$)`, 'i');
  return regex.test(normalizedText);
};

const countParticipantMention = (normalizedText: string, participantName: string) => {
  const [firstName] = participantName.split(' ');
  return countMentions(normalizedText, participantName) || countMentions(normalizedText, firstName);
};

export const normalizeMessage = (message: Message): Message => ({
  ...message,
  text: typeof message.text === 'string' ? message.text.trim() : '',
  photo: message.photo || null,
  video: message.video || null,
  hasMedia: Boolean(message.hasMedia ?? message.photo ?? message.video),
  mediaType: (message.mediaType || (message.video ? 'video' : message.photo ? 'image' : 'none')) as MediaType,
  reactions: Array.isArray(message.reactions)
    ? message.reactions
        .map((reaction) => ({
          emoji: String(reaction?.emoji || '').trim(),
          count: Number(reaction?.count || 0),
        }))
        .filter((reaction) => reaction.emoji && Number.isFinite(reaction.count) && reaction.count > 0)
    : [],
  totalReactions: getMessageReactionTotal(message),
  postUrl: message.postUrl || `https://t.me/espiadinha/${message.id}`,
});

const enrichCache = new WeakMap<Message[], EnrichedMessage[]>();

const enrichMessages = (messages: Message[]) => {
  const cached = enrichCache.get(messages);
  if (cached) return cached;

  const enriched = messages.map((msg) => {
    const normalizedText = normalize(msg.text || '');
    const mentionedParticipants = participants
      .filter((participant) => countParticipantMention(normalizedText, participant.name))
      .map((participant) => participant.name);
    const matchedGameTerms = GAME_TERMS.filter((term) => countMentions(normalizedText, term));

    return {
      ...normalizeMessage(msg),
      normalizedText,
      mentionedParticipants,
      matchedGameTerms,
      hasParticipantMention: mentionedParticipants.length > 0,
      hasRelevantMention: mentionedParticipants.length > 0 || matchedGameTerms.length > 0,
    } satisfies EnrichedMessage;
  });

  enrichCache.set(messages, enriched);
  return enriched;
};

export const buildDataset = ({
  rawMessages,
  searchTerm,
  selectedParticipant,
  startDate,
  endDate,
  withPhotosOnly,
  minReactions,
  sortBy,
}: {
  rawMessages: Message[];
  searchTerm: string;
  selectedParticipant: string | null;
  startDate: string;
  endDate: string;
  withPhotosOnly: boolean;
  minReactions: number;
  sortBy: SortBy;
}): { messages: Message[]; insights: Insights } => {
  let messages = enrichMessages(rawMessages).filter((msg) => msg.hasRelevantMention);

  if (startDate) {
    messages = messages.filter((msg) => getDateOnly(msg.date) >= startDate);
  }

  if (endDate) {
    messages = messages.filter((msg) => getDateOnly(msg.date) <= endDate);
  }

  const normalizedSearch = normalize(searchTerm || '');
  if (normalizedSearch) {
    messages = messages.filter((msg) => msg.normalizedText.includes(normalizedSearch));
  }

  if (selectedParticipant) {
    messages = messages.filter((msg) => msg.mentionedParticipants.includes(selectedParticipant));
  }

  if (withPhotosOnly) {
    messages = messages.filter((msg) => Boolean(msg.hasMedia || msg.photo || msg.video));
  }

  if (minReactions > 0) {
    messages = messages.filter((msg) => (msg.totalReactions || 0) >= minReactions);
  }

  const activityByHour = Array(24).fill(0);
  const reactionCounts: Record<string, number> = {};
  let totalGlobalReactions = 0;
  let topMessage: Message | null = null;
  let latestMessageDate: string | null = null;
  let earliestMessageDate: string | null = null;

  for (const msg of messages) {
    const totalReactions = getMessageReactionTotal(msg);
    totalGlobalReactions += totalReactions;

    for (const reaction of msg.reactions || []) {
      reactionCounts[reaction.emoji] = (reactionCounts[reaction.emoji] || 0) + reaction.count;
    }

    const date = safeDate(msg.date);
    const hour = date?.getHours();
    if (typeof hour === 'number') {
      activityByHour[hour] += 1;
    }

    if (!topMessage || totalReactions > getMessageReactionTotal(topMessage)) {
      topMessage = { ...msg, totalReactions };
    }

    if (!latestMessageDate || (safeDate(msg.date)?.getTime() || 0) > (safeDate(latestMessageDate)?.getTime() || 0)) {
      latestMessageDate = msg.date;
    }

    if (!earliestMessageDate || (safeDate(msg.date)?.getTime() || 0) < (safeDate(earliestMessageDate)?.getTime() || 0)) {
      earliestMessageDate = msg.date;
    }
  }

  const mentionRanking = participants.map((participant) => {
    const count = messages.reduce(
      (sum, msg) => sum + (msg.mentionedParticipants.includes(participant.name) ? 1 : 0),
      0,
    );

    return {
      name: participant.name.split(' ')[0] || participant.name,
      fullName: participant.name,
      count,
      image: participant.image,
      eliminated: participant.eliminated,
    } satisfies MentionRanking;
  });

  const mentionRankingSorted = [...mentionRanking].sort((a, b) => b.count - a.count);
  const topParticipant = mentionRankingSorted[0] || { name: 'Ninguém', count: 0 };
  const globalMentions = mentionRanking.reduce<Record<string, number>>((acc, item) => {
    acc[item.fullName] = item.count;
    return acc;
  }, {});

  if (sortBy === 'hot') {
    messages = [...messages].sort((a, b) => getMessageReactionTotal(b) - getMessageReactionTotal(a));
  } else if (sortBy === 'oldest') {
    messages = [...messages].sort((a, b) => (safeDate(a.date)?.getTime() || 0) - (safeDate(b.date)?.getTime() || 0));
  } else {
    messages = [...messages].sort((a, b) => (safeDate(b.date)?.getTime() || 0) - (safeDate(a.date)?.getTime() || 0));
  }

  const topReactions = Object.entries(reactionCounts)
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const mediaCount = messages.filter((msg) => Boolean(msg.hasMedia || msg.photo || msg.video)).length;
  const reactionsCount = messages.filter((msg) => getMessageReactionTotal(msg) > 0).length;
  const peakHour = activityByHour.indexOf(Math.max(...activityByHour));

  return {
    messages: messages.map(({ normalizedText, mentionedParticipants, matchedGameTerms, hasParticipantMention, hasRelevantMention, ...rest }) => ({
      ...rest,
      totalReactions: getMessageReactionTotal(rest),
    })),
    insights: {
      totalMessages: messages.length,
      totalReactions: totalGlobalReactions,
      messagesWithMedia: mediaCount,
      messagesWithReactions: reactionsCount,
      mediaRatio: messages.length > 0 ? Math.round((mediaCount / messages.length) * 100) : 0,
      reactionRatio: messages.length > 0 ? Math.round((reactionsCount / messages.length) * 100) : 0,
      uniqueReactionCount: Object.keys(reactionCounts).length,
      globalMentions,
      mentionRanking: mentionRankingSorted,
      topReactions,
      avgReactions: messages.length > 0 ? Math.round(totalGlobalReactions / messages.length) : 0,
      activityByHour,
      peakHour,
      topMessage,
      topParticipantName: topParticipant.name,
      topParticipantCount: topParticipant.count,
      latestMessageDate,
      earliestMessageDate,
    },
  };
};

export const buildEmptyMetadata = (): PostsMetadata => ({
  channel: 'espiadinha',
  source: 'https://t.me/s/espiadinha',
  syncedAt: null,
  count: 0,
  latestId: null,
  earliestId: null,
  firstPostId: 168574,
  backfillComplete: false,
  recentRefreshPages: null,
});

export const normalizePostsPayload = (payload: unknown): PostsFile => {
  if (Array.isArray(payload)) {
    const posts = payload.map((item) => normalizeMessage(item as Message));
    const ids = posts.map((item) => item.id).filter((value) => Number.isFinite(value));
    return {
      metadata: {
        ...buildEmptyMetadata(),
        count: posts.length,
        latestId: ids.length ? Math.max(...ids) : null,
        earliestId: ids.length ? Math.min(...ids) : null,
      },
      posts,
    };
  }

  const file = (payload || {}) as Partial<PostsFile>;
  const posts = Array.isArray(file.posts) ? file.posts.map((item) => normalizeMessage(item)) : [];
  const ids = posts.map((item) => item.id).filter((value) => Number.isFinite(value));

  return {
    metadata: {
      ...buildEmptyMetadata(),
      ...(file.metadata || {}),
      count: posts.length,
      latestId: ids.length ? Math.max(...ids) : file.metadata?.latestId ?? null,
      earliestId: ids.length ? Math.min(...ids) : file.metadata?.earliestId ?? null,
    },
    posts,
  };
};

export const formatSyncDateTime = (value: string | null | undefined) => {
  if (!value) return 'sincronização pendente';
  const date = safeDate(value);
  if (!date) return 'sincronização pendente';

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

