'use client';

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Filter,
  Flame,
  LayoutGrid,
  List,
  Loader2,
  MessageSquare,
  Moon,
  MoveUpRight,
  RefreshCcw,
  Search,
  Sparkles,
  Sun,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { participants } from './src/data/participants';
import {
  buildDataset,
  buildEmptyMetadata,
  formatSyncDateTime,
  getMessageReactionTotal,
  normalizePostsPayload,
  type Message,
  type PostsMetadata,
  type SortBy,
} from './src/lib/messages';
import { TelegramPostEmbed } from './src/components/TelegramPostEmbed';

type LayoutMode = 'timeline' | 'grid';
type ThemeMode = 'dark' | 'light';
type ActiveTab = 'feed' | 'dashboard' | 'favorites';

const cls = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Agora há pouco';

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
};

const formatRangeDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'America/Sao_Paulo',
  });
};

const getSaoPauloDateParts = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) return null;
  return { year, month, day };
};

const getDayKey = (value: string) => {
  const parts = getSaoPauloDateParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : '';
};

const formatDayChip = (dayKey: string) => {
  if (!dayKey) return 'Sem data';
  const date = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dayKey;

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'America/Sao_Paulo',
  });
};

const formatDayHeading = (dayKey: string) => {
  if (!dayKey) return 'Sem data';
  const date = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dayKey;

  return date.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
  });
};

const getFirstName = (name: string) => name.split(' ')[0] || name;

const formatCompactNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0';

  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: value >= 1000000 ? 1 : 0,
  }).format(value);
};

const formatFullNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(Number.isFinite(value) ? value : 0);

const formatLastSyncLabel = (value: string | null | undefined) => formatSyncDateTime(value);

export default function Page() {
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [dataMeta, setDataMeta] = useState<PostsMetadata>(buildEmptyMetadata);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [shortcutDayKey, setShortcutDayKey] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<SortBy>('latest');
  const [layout, setLayout] = useState<LayoutMode>('timeline');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [activeTab, setActiveTab] = useState<ActiveTab>('feed');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [participantsExpanded, setParticipantsExpanded] = useState(false);

  const [favorites, setFavorites] = useState<number[]>([]);
  const [favoriteMessages, setFavoriteMessages] = useState<Record<number, Message>>({});
  const [showBackToTop, setShowBackToTop] = useState(false);

  const observerTarget = useRef<HTMLDivElement>(null);
  const timelineScrollerRef = useRef<HTMLDivElement>(null);

  const invalidDateRange = Boolean(startDate && endDate && startDate > endDate);

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const deferredSelectedParticipant = useDeferredValue(selectedParticipant);
  const deferredStartDate = useDeferredValue(startDate);
  const deferredEndDate = useDeferredValue(endDate);
  const deferredSortBy = useDeferredValue(sortBy);

  const queryKey = useMemo(
    () =>
      JSON.stringify({
        searchTerm: deferredSearchTerm,
        selectedParticipant: deferredSelectedParticipant,
        startDate: deferredStartDate,
        endDate: deferredEndDate,
        shortcutDayKey,
        sortBy: deferredSortBy,
        layout,
      }),
    [deferredEndDate, deferredSearchTerm, deferredSelectedParticipant, deferredSortBy, deferredStartDate, layout, shortcutDayKey],
  );

  const isFiltering =
    searchTerm !== deferredSearchTerm ||
    selectedParticipant !== deferredSelectedParticipant ||
    startDate !== deferredStartDate ||
    endDate !== deferredEndDate ||
    shortcutDayKey !== null ||
    sortBy !== deferredSortBy;

  const pageSize = layout === 'grid' ? 8 : 6;

  const baseProcessedData = useMemo(() => {
    if (!allMessages.length || invalidDateRange) return null;

    return buildDataset({
      rawMessages: allMessages,
      searchTerm: deferredSearchTerm,
      selectedParticipant: deferredSelectedParticipant,
      startDate: deferredStartDate,
      endDate: deferredEndDate,
      withPhotosOnly: false,
      minReactions: 0,
      sortBy: deferredSortBy,
    });
  }, [allMessages, deferredEndDate, deferredSearchTerm, deferredSelectedParticipant, deferredSortBy, deferredStartDate, invalidDateRange]);

  const processedData = useMemo(() => {
    if (!allMessages.length || invalidDateRange) return null;

    const sourceMessages = shortcutDayKey
      ? allMessages.filter((message) => getDayKey(message.date) === shortcutDayKey)
      : allMessages;

    return buildDataset({
      rawMessages: sourceMessages,
      searchTerm: deferredSearchTerm,
      selectedParticipant: deferredSelectedParticipant,
      startDate: deferredStartDate,
      endDate: deferredEndDate,
      withPhotosOnly: false,
      minReactions: 0,
      sortBy: deferredSortBy,
    });
  }, [
    allMessages,
    deferredEndDate,
    deferredSearchTerm,
    deferredSelectedParticipant,
    deferredSortBy,
    deferredStartDate,
    invalidDateRange,
    shortcutDayKey,
  ]);

  const insights = processedData?.insights ?? null;

  const saoPauloTodayKey = useMemo(() => getDayKey(new Date().toISOString()), []);

  const todayData = useMemo(() => {
    if (!allMessages.length) return null;

    return buildDataset({
      rawMessages: allMessages.filter((message) => getDayKey(message.date) === saoPauloTodayKey),
      searchTerm: '',
      selectedParticipant: null,
      startDate: '',
      endDate: '',
      withPhotosOnly: false,
      minReactions: 0,
      sortBy: 'latest',
    });
  }, [allMessages, saoPauloTodayKey]);

  const todayInsights = todayData?.insights ?? null;
  const todayTopReaction = todayInsights?.topReactions?.[0] ?? null;
  const messages = useMemo(() => (processedData ? processedData.messages.slice(0, page * pageSize) : []), [page, pageSize, processedData]);
  const hasMore = Boolean(processedData && messages.length < processedData.messages.length);

  const timelineJumps = useMemo(() => {
    const source = baseProcessedData?.messages ?? [];
    const jumps: Array<{ key: string; label: string; fullLabel: string; count: number; firstIndex: number; lastIndex: number; firstMessageId: number; lastMessageId: number }> = [];
    const indexByDay = new Map<string, number>();

    source.forEach((message, index) => {
      const key = getDayKey(message.date);
      if (!key) return;

      const existingIndex = indexByDay.get(key);
      if (typeof existingIndex === 'number') {
        jumps[existingIndex].count += 1;
        jumps[existingIndex].lastIndex = index;
        jumps[existingIndex].lastMessageId = message.id;
        return;
      }

      indexByDay.set(key, jumps.length);
      jumps.push({
        key,
        label: formatDayChip(key),
        fullLabel: formatDayHeading(key),
        count: 1,
        firstIndex: index,
        lastIndex: index,
        firstMessageId: message.id,
        lastMessageId: message.id,
      });
    });

    return jumps;
  }, [baseProcessedData]);

  const dayCountMap = useMemo(() => {
    return timelineJumps.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.key] = item.count;
      return accumulator;
    }, {});
  }, [timelineJumps]);

  const scrollTimelineMap = useCallback((direction: 'left' | 'right') => {
    const element = timelineScrollerRef.current;
    if (!element) return;
    const amount = Math.max(220, Math.round(element.clientWidth * 0.72));
    element.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  }, []);

  const colors = {
    bgApp: theme === 'dark' ? 'bg-[#07070a] text-zinc-100' : 'bg-zinc-50 text-zinc-900',
    card:
      theme === 'dark'
        ? 'bg-zinc-900/80 border-zinc-800 shadow-xl shadow-black/40'
        : 'bg-white border-zinc-200 shadow-xl shadow-zinc-200/60',
    soft: theme === 'dark' ? 'bg-zinc-900/65 border-zinc-800' : 'bg-white/90 border-zinc-200',
    glass:
      theme === 'dark'
        ? 'bg-zinc-950/70 backdrop-blur-2xl border-zinc-800'
        : 'bg-white/75 backdrop-blur-2xl border-zinc-200 shadow-sm',
    textMuted: theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500',
    input: theme === 'dark' ? 'bg-zinc-950/60 border-zinc-800 text-white' : 'bg-zinc-50 border-zinc-200 text-zinc-900',
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    secondary:
      theme === 'dark'
        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
        : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800',
  };

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('bbb-theme');
    const savedFavorites = window.localStorage.getItem('bbb-favorites');
    const savedFavoriteMessages = window.localStorage.getItem('bbb-favorite-messages');

    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    }

    if (savedFavorites) {
      try {
        const parsed = JSON.parse(savedFavorites);
        if (Array.isArray(parsed)) setFavorites(parsed.filter((item) => typeof item === 'number'));
      } catch {
        // ignore invalid local data
      }
    }

    if (savedFavoriteMessages) {
      try {
        const parsed = JSON.parse(savedFavoriteMessages) as Record<string, Message>;
        const next: Record<number, Message> = {};
        Object.entries(parsed || {}).forEach(([key, value]) => {
          if (typeof value?.id === 'number') next[Number(key)] = value;
        });
        setFavoriteMessages(next);
      } catch {
        // ignore invalid local data
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('bbb-theme', theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('bbb-favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    window.localStorage.setItem('bbb-favorite-messages', JSON.stringify(favoriteMessages));
  }, [favoriteMessages]);

  useEffect(() => {
    let cancelled = false;

    const loadPosts = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('./posts.json', { cache: 'no-store' });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.details || data?.error || `Erro ${response.status}`);
        }

        if (cancelled) return;

        const payload = normalizePostsPayload(data);
        setAllMessages(payload.posts);
        setDataMeta(payload.metadata);
        setHasLoadedOnce(true);
      } catch (fetchError) {
        if (cancelled) return;

        const message = fetchError instanceof Error ? fetchError.message : 'Falha inesperada ao carregar.';
        setError(message);
        setAllMessages([]);
        setDataMeta(buildEmptyMetadata());
        setHasLoadedOnce(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPosts();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [invalidDateRange, queryKey]);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;
      if (target?.isIntersecting && hasMore && !loading && activeTab === 'feed' && !invalidDateRange) {
        setPage((prev) => prev + 1);
      }
    },
    [activeTab, hasMore, invalidDateRange, loading],
  );

  useEffect(() => {
    const element = observerTarget.current;
    if (!element || activeTab !== 'feed') return;

    const observer = new IntersectionObserver(handleObserver, {
      threshold: 0.2,
      rootMargin: '220px 0px',
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [activeTab, handleObserver]);

  useEffect(() => {
    if (!messages.length) return;
    setFavoriteMessages((prev) => {
      const next = { ...prev };
      messages.forEach((msg) => {
        if (favorites.includes(msg.id)) next[msg.id] = msg;
      });
      return next;
    });
  }, [favorites, messages]);

  useEffect(() => {
    const onScroll = () => {
      setShowBackToTop(window.scrollY > 900);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (activeTab !== 'feed') {
      setMobileFiltersOpen(false);
    }
  }, [activeTab]);

  const favoriteList = useMemo(
    () =>
      favorites
        .map((id) => favoriteMessages[id])
        .filter((item): item is Message => Boolean(item))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [favoriteMessages, favorites],
  );

  const topNames = useMemo(() => {
    if (!insights?.globalMentions) return [] as Array<{ name: string; fullName: string; count: number }>;
    return (Object.entries(insights.globalMentions) as Array<[string, number]>)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([fullName, count]) => ({ name: getFirstName(fullName), fullName, count }));
  }, [insights]);

  const topReaction = useMemo(() => insights?.topReactions?.[0] ?? null, [insights]);
  const topMessageReactionTotal = useMemo(() => getMessageReactionTotal(insights?.topMessage ?? null), [insights]);
  const todayTopMessageReactionTotal = useMemo(() => getMessageReactionTotal(todayInsights?.topMessage ?? null), [todayInsights]);
  const totalReactionsAcrossPeriod = insights?.totalReactions ?? 0;

  const participantMentionsMap = useMemo(() => {
    if (!insights?.globalMentions) return {} as Record<string, number>;
    return insights.globalMentions;
  }, [insights]);

  const participantsForFilter = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (selectedParticipant === a.name) return -1;
      if (selectedParticipant === b.name) return 1;
      const countA = participantMentionsMap[a.name] || 0;
      const countB = participantMentionsMap[b.name] || 0;
      if (countB !== countA) return countB - countA;
      if (a.eliminated !== b.eliminated) return Number(a.eliminated) - Number(b.eliminated);
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [participantMentionsMap, selectedParticipant]);

  const visibleParticipants = useMemo(
    () => (participantsExpanded ? participantsForFilter : participantsForFilter.slice(0, 8)),
    [participantsExpanded, participantsForFilter],
  );

  const maxActivityCount = useMemo(() => Math.max(...(insights?.activityByHour ?? [0]), 0), [insights]);

  const headlineText = useMemo(() => {
    if (selectedParticipant) return `Tudo sobre ${getFirstName(selectedParticipant)}`;
    if (sortBy === 'hot') return 'Os assuntos mais quentes da casa';
    if (sortBy === 'oldest') return 'Os primeiros registros do recorte';
    return 'O que está rendendo papo na casa';
  }, [selectedParticipant, sortBy]);

  const summaryCards = useMemo(() => {
    if (!insights) return [] as Array<{ label: string; value: string; accent: string; helper?: string }>;

    return [
      {
        label: 'Nome do momento',
        value: insights.topParticipantName || 'Sem destaque',
        accent: 'text-indigo-400',
        helper: insights.topParticipantCount > 0 ? `${formatFullNumber(insights.topParticipantCount)} menções no recorte` : 'Sem menções fortes no recorte',
      },
      {
        label: 'Hora mais agitada',
        value: `${insights.peakHour}h`,
        accent: 'text-rose-400',
        helper: `${insights.totalMessages} posts analisados`,
      },
      {
        label: 'Emoji do momento',
        value: topReaction ? `${topReaction.emoji} ${formatCompactNumber(topReaction.count)}` : 'Sem destaque',
        accent: 'text-emerald-400',
        helper: topReaction ? `${formatFullNumber(insights.uniqueReactionCount)} emojis distintos contados no recorte` : 'Sem reações suficientes',
      },
    ];
  }, [insights, topReaction]);

  const todaySummaryCards = useMemo(() => {
    if (!todayInsights) return [] as Array<{ label: string; value: string; accent: string; helper?: string }>;

    return [
      {
        label: 'Nome do dia',
        value: todayInsights.topParticipantName || 'Sem destaque',
        accent: 'text-indigo-400',
        helper: todayInsights.topParticipantCount > 0 ? `${formatFullNumber(todayInsights.topParticipantCount)} menções hoje` : 'Sem menções fortes hoje',
      },
      {
        label: 'Hora mais agitada hoje',
        value: `${todayInsights.peakHour}h`,
        accent: 'text-rose-400',
        helper: `${todayInsights.totalMessages} posts hoje`,
      },
      {
        label: 'Emoji do dia',
        value: todayTopReaction ? `${todayTopReaction.emoji} ${formatCompactNumber(todayTopReaction.count)}` : 'Sem destaque',
        accent: 'text-emerald-400',
        helper: todayTopReaction ? `${formatFullNumber(todayInsights.totalReactions)} reações somadas hoje` : 'Sem reações suficientes hoje',
      },
    ];
  }, [todayInsights, todayTopReaction]);

  const activeFilterCount = [
    Boolean(searchTerm),
    Boolean(selectedParticipant),
    Boolean(startDate),
    Boolean(endDate),
    Boolean(shortcutDayKey),
    sortBy !== 'latest',
  ].filter(Boolean).length;

  const toggleFavorite = (message: Message) => {
    const isCurrentlySaved = favorites.includes(message.id);

    setFavorites((current) => {
      const exists = current.includes(message.id);
      return exists ? current.filter((id) => id !== message.id) : [message.id, ...current];
    });

    setFavoriteMessages((current) => {
      if (isCurrentlySaved) {
        const next = { ...current };
        delete next[message.id];
        return next;
      }

      return {
        ...current,
        [message.id]: message,
      };
    });
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedParticipant(null);
    setStartDate('');
    setEndDate('');
    setShortcutDayKey(null);
    setSortBy('latest');
  };

  const scrollToTop = () => {
    setPage(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const applyDayShortcut = useCallback((dayKey: string) => {
    setShortcutDayKey(dayKey);
    setPage(1);
  }, []);

  const renderDayMarker = (dayKey: string) => (
    <div
      id={`day-anchor-${dayKey}`}
      className={cls(
        'mb-5 flex scroll-mt-28 items-center justify-between gap-3 rounded-[1.4rem] border px-4 py-3',
        theme === 'dark' ? 'border-zinc-800 bg-zinc-950/80' : 'border-zinc-200 bg-white/95',
      )}
    >
      <div>
        <p className={cls('text-[10px] font-black uppercase tracking-[0.22em]', colors.textMuted)}>atalho temporal</p>
        <h3 className="mt-1 text-sm font-black sm:text-base">{formatDayHeading(dayKey)}</h3>
      </div>
      <span
        className={cls(
          'rounded-full px-3 py-1 text-[11px] font-bold',
          theme === 'dark' ? 'bg-indigo-500/10 text-indigo-300' : 'bg-indigo-50 text-indigo-700',
        )}
      >
        {formatCompactNumber(dayCountMap[dayKey] || 0)} posts
      </span>
    </div>
  );

  const renderMessageCard = (msg: Message, compact = false) => {
    const isSaved = favorites.includes(msg.id);
    const reactionTotal = getMessageReactionTotal(msg);

    return (
      <article
        className={cls(
          'group w-full overflow-hidden rounded-[2rem] border transition-all duration-300 hover:-translate-y-0.5 content-visibility-auto bg-noise-soft',
          colors.card,
          compact ? '' : 'mb-8',
        )}
      >
        {msg.postUrl ? (
          <div className={cls('w-full overflow-hidden p-2 sm:p-3', compact ? 'min-h-[18rem]' : 'min-h-[20rem]')}>
            <TelegramPostEmbed
              postUrl={msg.postUrl as string}
              compact={compact}
              className="mx-auto max-w-full overflow-hidden rounded-[1.5rem]"
            />
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
          <span
            className={cls(
              'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-black tracking-tight',
              reactionTotal > 0
                ? 'border-orange-500/20 bg-orange-500/10 text-orange-500'
                : theme === 'dark'
                  ? 'border-zinc-700 bg-zinc-950 text-zinc-400'
                  : 'border-zinc-200 bg-zinc-100 text-zinc-500',
            )}
            title={`🔥 Em alta: ${formatFullNumber(reactionTotal)} reações somadas neste post`}
          >
            <span className="text-base leading-none">🔥</span>
            <span>{formatCompactNumber(reactionTotal)}</span>
          </span>

          <button
            type="button"
            onClick={() => toggleFavorite(msg)}
            className={cls(
              'inline-flex h-11 w-11 items-center justify-center rounded-full border transition',
              isSaved
                ? 'border-amber-500/25 bg-amber-500/10 text-amber-500'
                : theme === 'dark'
                  ? 'border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-amber-400/40 hover:text-amber-400'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:border-amber-300 hover:text-amber-500',
            )}
            aria-label={isSaved ? 'Remover dos salvos' : 'Salvar post'}
            title={isSaved ? 'Remover dos salvos' : 'Salvar post'}
          >
            {isSaved ? <BookmarkCheck className="h-4.5 w-4.5" /> : <Bookmark className="h-4.5 w-4.5" />}
          </button>
        </div>
      </article>
    );
  };

  const renderHotSummaryCard = (msg: Message) => {
    const isSaved = favorites.includes(msg.id);
    const reactionTotal = getMessageReactionTotal(msg);

    return (
      <div className="mx-auto w-full max-w-[22rem] xl:max-w-[23rem]">
        <div
          className={cls(
            'overflow-hidden rounded-[1.8rem] border p-3 sm:p-4',
            theme === 'dark'
              ? 'border-orange-500/20 bg-[linear-gradient(180deg,rgba(249,115,22,0.10),rgba(24,24,27,0.92))]'
              : 'border-orange-200 bg-[linear-gradient(180deg,rgba(255,247,237,0.92),rgba(255,255,255,0.99))]',
          )}
        >
          {msg.postUrl ? (
            <TelegramPostEmbed
              postUrl={msg.postUrl as string}
              compact
              className="mx-auto max-w-full overflow-hidden rounded-[1.35rem]"
            />
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-3">
            <span
              className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3.5 py-1.5 text-sm font-black text-orange-500"
              title={`🔥 Em alta: ${formatFullNumber(reactionTotal)} reações somadas neste post`}
            >
              <span className="text-base leading-none">🔥</span>
              <span>{formatCompactNumber(reactionTotal)}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-400/90">em alta</span>
            </span>
            <button
              type="button"
              onClick={() => toggleFavorite(msg)}
              className={cls(
                'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition',
                isSaved
                  ? 'border-amber-500/25 bg-amber-500/10 text-amber-500'
                  : theme === 'dark'
                    ? 'border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-amber-400/40 hover:text-amber-400'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-amber-300 hover:text-amber-500',
              )}
              aria-label={isSaved ? 'Remover dos salvos' : 'Salvar post'}
              title={isSaved ? 'Remover dos salvos' : 'Salvar post'}
            >
              {isSaved ? <BookmarkCheck className="h-4.5 w-4.5" /> : <Bookmark className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderSkeletonCard = (key: string) => (
    <div key={key} className={cls('overflow-hidden rounded-[2rem] border p-5 sm:p-6', colors.card)}>
      <div className="animate-pulse">
        <div className={cls('mb-5 h-52 rounded-[1.6rem]', theme === 'dark' ? 'bg-zinc-800/80' : 'bg-zinc-200/90')} />
        <div className={cls('mb-4 h-4 w-32 rounded-full', theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200')} />
        <div className={cls('h-5 w-4/5 rounded-full', theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200')} />
        <div className={cls('mt-3 h-5 w-full rounded-full', theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200')} />
        <div className={cls('mt-3 h-5 w-3/4 rounded-full', theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200')} />
        <div className="mt-6 flex gap-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className={cls('h-8 w-16 rounded-full', theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200')} />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <main className={cls('min-h-screen pb-44 font-sans transition-colors duration-500 bottom-safe sm:pb-20', colors.bgApp)}>
      <header className={cls('sticky top-0 z-50 w-full border-b transition-colors duration-500', colors.glass)}>
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-xl shadow-lg shadow-indigo-500/20">
              <span role="img" aria-label="olhos">👀</span>
            </div>
            <div className="min-w-0">
              <p className={cls('text-[10px] font-bold uppercase tracking-[0.28em]', colors.textMuted)}>bbb 26</p>
              <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">EspIAdinha BBB</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className={cls('hidden rounded-full border p-1 sm:flex', theme === 'dark' ? 'border-zinc-800 bg-zinc-950/60' : 'border-zinc-200 bg-zinc-100/70')}>
              {[
                { key: 'feed', label: 'Feed', icon: MessageSquare },
                { key: 'dashboard', label: 'Resumo', icon: BarChart3 },
                { key: 'favorites', label: 'Salvos', icon: Bookmark },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key as ActiveTab)}
                    className={cls(
                      'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all',
                      active ? colors.primary : `${colors.textMuted} hover:text-indigo-500`,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={cls('inline-flex h-11 w-11 items-center justify-center rounded-full border transition', colors.card)}
              aria-label="Alternar tema"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-500" />}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto mt-8 max-w-6xl px-4 pb-6 sm:px-6 sm:pb-0">
        <div className="mb-5 text-center">
          <div className={cls('mx-auto max-w-4xl text-[11px] leading-5 sm:text-xs', colors.textMuted)}>
            <p>
              Agregador independente de posts públicos do canal{' '}
              <a
                href="https://t.me/espiadinha"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline decoration-dotted underline-offset-4"
              >
                Espiadinha - BBB 26
              </a>
              . Última sincronização automática: <span className="font-semibold">{formatLastSyncLabel(dataMeta.syncedAt)}</span>.
            </p>
            <p className="mt-1">
              Esta página é apenas um agregador visual de publicações públicas do Telegram. Não possui vínculo com o canal, com o programa BBB ou com os titulares da marca Big Brother Brasil. O desenvolvedor não se responsabiliza pelo teor, precisão ou atualizações do conteúdo publicado por terceiros.
            </p>
          </div>
        </div>

        {activeTab === 'feed' ? (
          <div className="mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <section className={cls('mb-6 overflow-hidden rounded-[2.2rem] border p-5 sm:p-6', colors.soft)}>
              <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-400">
                    <TrendingUp className="h-3.5 w-3.5" />
                    termômetro da casa
                  </div>
                  <h2 className="headline-glow max-w-2xl text-2xl font-black tracking-tight sm:text-4xl">{headlineText}</h2>
                  <p className={cls('mt-3 max-w-2xl text-sm leading-7 sm:text-base', colors.textMuted)}>
                    Acompanhe os momentos mais comentados, filtre por participante e descubra o que o público está repercutindo agora.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {(summaryCards.length > 0 ? summaryCards : [
                    { label: 'Nome do momento', value: '—', accent: 'text-indigo-400', helper: 'Analisando menções...' },
                    { label: 'Hora mais agitada', value: '—', accent: 'text-rose-400', helper: 'Lendo horários do feed...' },
                    { label: 'Emoji do momento', value: '—', accent: 'text-emerald-400', helper: 'Conferindo reações...' },
                  ]).map((item) => (
                    <div key={item.label} className={cls('rounded-[1.5rem] border p-4', theme === 'dark' ? 'border-zinc-800 bg-zinc-950/70' : 'border-zinc-200 bg-white')}>
                      <p className={cls('text-[11px] font-bold uppercase tracking-[0.18em]', colors.textMuted)}>{item.label}</p>
                      <p className={cls('mt-2 text-base font-black leading-tight sm:text-lg', item.accent)}>{item.value}</p>
                      {'helper' in item && item.helper ? <p className={cls('mt-2 text-xs leading-5', colors.textMuted)}>{item.helper}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className={cls('relative mb-8 rounded-[2rem] border p-4 shadow-2xl', colors.glass)}>
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className={cls('flex flex-1 items-center gap-3 rounded-[1.4rem] border px-4 py-3', colors.input)}>
                    <Search className={cls('h-5 w-5', colors.textMuted)} />
                    <input
                      type="text"
                      placeholder="Busque uma frase, um nome ou um momento da casa"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-zinc-500"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className={cls('inline-flex h-8 w-8 items-center justify-center rounded-full', colors.secondary)}
                        aria-label="Limpar busca"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </label>

                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen((current) => !current)}
                    className={cls('inline-flex items-center justify-center gap-2 rounded-[1.3rem] border px-4 py-3 text-sm font-bold sm:hidden', colors.card)}
                  >
                    <Filter className="h-4 w-4" />
                    {mobileFiltersOpen ? 'Ocultar filtros' : `Mais filtros${activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}`}
                  </button>

                  {activeFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className={cls('inline-flex items-center justify-center gap-2 rounded-[1.3rem] border px-4 py-3 text-sm font-bold transition', theme === 'dark' ? 'border-zinc-800 bg-zinc-950/70 text-zinc-200 hover:border-indigo-500/25 hover:text-indigo-300' : 'border-zinc-200 bg-white text-zinc-700 hover:border-indigo-200 hover:text-indigo-700')}
                    >
                      <RefreshCcw className="h-4 w-4" />
                      Limpar filtros
                    </button>
                  ) : null}
                </div>

                <div className={cls('min-w-0 rounded-[1.5rem] border p-4', theme === 'dark' ? 'border-zinc-800 bg-zinc-950/50' : 'border-zinc-200 bg-zinc-50')}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={cls('text-xs font-bold uppercase tracking-[0.18em]', colors.textMuted)}>filtrar por participante</p>
                      <p className={cls('text-sm', colors.textMuted)}>No mobile e no navegador, você pode expandir para ver todo mundo ou recolher para deixar o feed mais limpo.</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedParticipant ? (
                        <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-400">
                          {getFirstName(selectedParticipant)} em foco
                        </span>
                      ) : (
                        <span className={cls('rounded-full px-3 py-1 text-xs font-bold', theme === 'dark' ? 'bg-zinc-900 text-zinc-400' : 'bg-white text-zinc-500')}>
                          {participantsForFilter.length} participantes
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => setParticipantsExpanded((current) => !current)}
                        className={cls('inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold transition', colors.secondary)}
                      >
                        {participantsExpanded ? (
                          <>
                            <ChevronUp className="h-4 w-4" />
                            Recolher
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4" />
                            Ver todos
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    <button
                      type="button"
                      onClick={() => setSelectedParticipant(null)}
                      className={cls(
                        'min-w-0 rounded-[1.2rem] border px-3 py-3 text-center transition hover:-translate-y-0.5',
                        !selectedParticipant
                          ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.16)]'
                          : theme === 'dark'
                            ? 'border-zinc-800 bg-zinc-950 hover:border-indigo-400/40'
                            : 'border-zinc-200 bg-white hover:border-indigo-300',
                      )}
                    >
                      <div className={cls('mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border-2 text-sm font-black', !selectedParticipant ? 'border-indigo-500 text-indigo-400' : theme === 'dark' ? 'border-zinc-700 text-zinc-300' : 'border-zinc-300 text-zinc-500')}>
                        Todos
                      </div>
                      <p className="truncate text-xs font-black">Sem filtro</p>
                      <p className={cls('mt-1 text-[11px]', colors.textMuted)}>feed geral</p>
                    </button>

                    {visibleParticipants.map((participant) => {
                      const active = selectedParticipant === participant.name;
                      const mentionCount = participantMentionsMap[participant.name] || 0;
                      return (
                        <button
                          key={participant.name}
                          type="button"
                          onClick={() => setSelectedParticipant(active ? null : participant.name)}
                          className={cls(
                            'min-w-0 rounded-[1.2rem] border px-3 py-3 text-center transition hover:-translate-y-0.5',
                            active
                              ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.16)]'
                              : theme === 'dark'
                                ? 'border-zinc-800 bg-zinc-950 hover:border-indigo-400/40'
                                : 'border-zinc-200 bg-white hover:border-indigo-300',
                          )}
                        >
                          <div className={cls('mx-auto mb-2 h-14 w-14 overflow-hidden rounded-full border-2', active ? 'border-indigo-500' : theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300')}>
                            <img
                              src={participant.image}
                              alt={participant.name}
                              className={cls('h-full w-full object-cover', participant.eliminated && 'grayscale opacity-70')}
                              loading="lazy"
                            />
                          </div>
                          <p className="truncate text-xs font-black">{getFirstName(participant.name)}</p>
                          <p className={cls('mt-1 text-[11px]', colors.textMuted)}>{mentionCount} menções</p>
                        </button>
                      );
                    })}
                  </div>

                  {!participantsExpanded && participantsForFilter.length > visibleParticipants.length ? (
                    <div className="mt-3 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setParticipantsExpanded(true)}
                        className={cls('inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition', colors.secondary)}
                      >
                        <ChevronDown className="h-4 w-4" />
                        Mostrar os demais participantes
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className={cls('space-y-4', mobileFiltersOpen ? 'block' : 'hidden sm:block')}>
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={cls('flex items-center gap-3 rounded-[1.3rem] border px-4 py-3', colors.input)}>
                        <CalendarDays className={cls('h-4 w-4', colors.textMuted)} />
                        <input
                          aria-label="Data inicial"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          style={{ colorScheme: theme === 'dark' ? 'dark' : 'light' }}
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      </label>

                      <label className={cls('flex items-center gap-3 rounded-[1.3rem] border px-4 py-3', colors.input)}>
                        <CalendarDays className={cls('h-4 w-4', colors.textMuted)} />
                        <input
                          aria-label="Data final"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          style={{ colorScheme: theme === 'dark' ? 'dark' : 'light' }}
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      </label>
                    </div>

                    <div className={cls('flex flex-wrap gap-2 rounded-[1.3rem] border p-2', theme === 'dark' ? 'border-zinc-800 bg-zinc-950/60' : 'border-zinc-200 bg-zinc-50')}>
                      {[
                        { value: 'latest', label: 'Últimos' },
                        { value: 'hot', label: 'Em alta' },
                        { value: 'oldest', label: 'Primeiros' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSortBy(option.value as SortBy)}
                          className={cls(
                            'rounded-full px-4 py-2 text-sm font-bold transition',
                            sortBy === option.value
                              ? option.value === 'hot'
                                ? 'bg-orange-500 text-white'
                                : colors.primary
                              : colors.secondary,
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <div className={cls('flex flex-wrap gap-2 rounded-[1.3rem] border p-2', theme === 'dark' ? 'border-zinc-800 bg-zinc-950/60' : 'border-zinc-200 bg-zinc-50')}>
                      <button
                        type="button"
                        onClick={() => setLayout('timeline')}
                        className={cls(
                          'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition',
                          layout === 'timeline' ? 'bg-violet-500 text-white' : colors.secondary,
                        )}
                      >
                        <List className="h-4 w-4" />
                        Lista
                      </button>
                      <button
                        type="button"
                        onClick={() => setLayout('grid')}
                        className={cls(
                          'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition',
                          layout === 'grid' ? 'bg-violet-500 text-white' : colors.secondary,
                        )}
                      >
                        <LayoutGrid className="h-4 w-4" />
                        Grade
                      </button>
                    </div>
                  </div>

                  <div className="px-1 py-1 text-center">
                    {isFiltering ? (
                      <span className={cls('inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold', theme === 'dark' ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300' : 'border-indigo-200 bg-indigo-50 text-indigo-700')}>
                        <Sparkles className="h-4 w-4 animate-pulse" />
                        Atualizando o recorte...
                      </span>
                    ) : (
                      <p className={cls('text-sm leading-6', colors.textMuted)}>
                        Refine a timeline com busca, datas e participantes para destacar os momentos que mais importam.
                      </p>
                    )}
                  </div>
                </div>

                <div className={cls('flex flex-wrap items-center gap-2 rounded-[1.3rem] border px-4 py-3 text-sm', theme === 'dark' ? 'border-zinc-800 bg-zinc-950/40' : 'border-zinc-200 bg-zinc-50')}>
                  <span className="font-bold text-indigo-500">{messages.length}</span>
                  <span className={colors.textMuted}>posts visíveis agora</span>
                  {insights ? (
                    <>
                      <span className={cls('hidden h-1 w-1 rounded-full sm:inline-block', theme === 'dark' ? 'bg-zinc-600' : 'bg-zinc-300')} />
                      <span className={colors.textMuted}>{insights.totalMessages} no recorte completo</span>
                      <span className={cls('hidden h-1 w-1 rounded-full sm:inline-block', theme === 'dark' ? 'bg-zinc-600' : 'bg-zinc-300')} />
                      <span className={colors.textMuted}>{topReaction ? `${topReaction.emoji} foi a reação que mais apareceu` : 'Sem reação dominante no recorte'}</span>
                      <span className={cls('hidden h-1 w-1 rounded-full sm:inline-block', theme === 'dark' ? 'bg-zinc-600' : 'bg-zinc-300')} />
                      <span className={colors.textMuted}>{formatCompactNumber(insights.uniqueReactionCount)} emojis distintos contados</span>
                      <span className={cls('hidden h-1 w-1 rounded-full sm:inline-block', theme === 'dark' ? 'bg-zinc-600' : 'bg-zinc-300')} />
                      <span className={colors.textMuted}>histórico {dataMeta.backfillComplete ? 'completo' : `parcial até o post ${dataMeta.earliestId ?? '...'}`}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </section>

            {timelineJumps.length > 0 ? (
              <section className={cls('mb-6 rounded-[1.8rem] border p-4 shadow-xl', colors.glass)}>
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className={cls('text-[10px] font-black uppercase tracking-[0.24em]', colors.textMuted)}>mini mapa temporal</p>
                    <h3 className="mt-1 text-sm font-black sm:text-base">Escolha um dia e veja só a timeline dele</h3>
                  </div>
                  <p className={cls('text-xs', colors.textMuted)}>
                    {timelineJumps.length} dias no recorte atual.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scrollTimelineMap('left')}
                    className={cls(
                      'hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border transition sm:inline-flex',
                      theme === 'dark'
                        ? 'border-zinc-800 bg-zinc-950/80 text-zinc-200 hover:border-indigo-500/30 hover:text-indigo-300'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:border-indigo-200 hover:text-indigo-700',
                    )}
                    aria-label="Rolar dias para a esquerda"
                    title="Dias anteriores"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <div ref={timelineScrollerRef} className="no-scrollbar -mx-1 flex flex-1 gap-2 overflow-x-auto px-1 pb-1">
                    {timelineJumps.map((item) => {
                      const isDayShortcutActive = shortcutDayKey === item.key;
                      return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => applyDayShortcut(item.key)}
                        className={cls(
                          'shrink-0 rounded-full border px-3 py-2 text-left transition hover:-translate-y-0.5',
                          isDayShortcutActive
                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500 shadow-[0_0_18px_rgba(99,102,241,0.18)]'
                            : theme === 'dark'
                              ? 'border-zinc-800 bg-zinc-950/80 text-zinc-100 hover:border-indigo-500/30 hover:bg-zinc-900'
                              : 'border-zinc-200 bg-white text-zinc-800 hover:border-indigo-200 hover:bg-indigo-50/70',
                        )}
                        title={`Filtrar timeline para ${item.fullLabel}`}
                      >
                        <span className="block text-sm font-black">{item.label}</span>
                        <span className={cls('mt-0.5 block text-[11px] font-semibold', colors.textMuted)}>
                          {formatCompactNumber(item.count)} posts
                        </span>
                      </button>
                    );})}
                  </div>

                  <button
                    type="button"
                    onClick={() => scrollTimelineMap('right')}
                    className={cls(
                      'hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border transition sm:inline-flex',
                      theme === 'dark'
                        ? 'border-zinc-800 bg-zinc-950/80 text-zinc-200 hover:border-indigo-500/30 hover:text-indigo-300'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:border-indigo-200 hover:text-indigo-700',
                    )}
                    aria-label="Rolar dias para a direita"
                    title="Dias seguintes"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {shortcutDayKey ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className={cls('inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold', theme === 'dark' ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300' : 'border-indigo-200 bg-indigo-50 text-indigo-700')}>
                      <CalendarDays className="h-4 w-4" />
                      Mostrando apenas {formatDayHeading(shortcutDayKey)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShortcutDayKey(null)}
                      className={cls('inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold transition', colors.secondary)}
                    >
                      <X className="h-4 w-4" />
                      Remover filtro do dia
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}

            {invalidDateRange ? (
              <div className={cls('mb-6 rounded-[1.6rem] border px-4 py-3 text-sm font-medium', theme === 'dark' ? 'border-red-500/20 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-700')}>
                A data inicial está depois da data final. Ajuste o intervalo para continuar.
              </div>
            ) : null}

            {error ? (
              <div className={cls('mb-6 rounded-[1.6rem] border px-4 py-3 text-sm font-medium', theme === 'dark' ? 'border-red-500/20 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-700')}>
                Não consegui carregar o feed agora: {error}
              </div>
            ) : null}

            {!hasLoadedOnce && loading ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {['a', 'b', 'c', 'd'].map(renderSkeletonCard)}
              </div>
            ) : messages.length === 0 && !loading && !invalidDateRange ? (
              <div className="py-24 text-center">
                <div className={cls('mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border', colors.card)}>
                  <Search className={cls('h-8 w-8', colors.textMuted)} />
                </div>
                <h3 className="mb-2 text-xl font-bold">{allMessages.length === 0 ? 'Feed pronto para a primeira sincronização' : 'Nada apareceu nesse recorte'}</h3>
                <p className={colors.textMuted}>
                  {allMessages.length === 0
                    ? 'Rode npm run sync para buscar os posts do canal público e popular o posts.json.'
                    : 'Tente limpar as datas, trocar o nome pesquisado ou voltar para a ordenação mais recente.'}
                </p>
              </div>
            ) : layout === 'grid' ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {messages.map((message, index) => {
                  const dayKey = getDayKey(message.date);
                  const previousDayKey = index > 0 ? getDayKey(messages[index - 1].date) : null;
                  const nextDayKey = index < messages.length - 1 ? getDayKey(messages[index + 1].date) : null;
                  const showMarker = dayKey !== previousDayKey;
                  const showDayEndAnchor = dayKey !== nextDayKey;

                  return (
                    <Fragment key={message.id}>
                      {showMarker ? <div className="md:col-span-2">{renderDayMarker(dayKey)}</div> : null}
                      <div id={`message-anchor-${message.id}`} className="scroll-mt-28">{renderMessageCard(message)}</div>
                      {showDayEndAnchor ? <div id={`day-end-anchor-${dayKey}`} className="md:col-span-2 scroll-mt-28" /> : null}
                    </Fragment>
                  );
                })}
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-1/2 hidden h-full w-1 -translate-x-1/2 rounded-full bg-zinc-200 dark:bg-zinc-800 lg:block" />
                {messages.map((message, index) => {
                  const isLeft = index % 2 === 0;
                  const dayKey = getDayKey(message.date);
                  const previousDayKey = index > 0 ? getDayKey(messages[index - 1].date) : null;
                  const nextDayKey = index < messages.length - 1 ? getDayKey(messages[index + 1].date) : null;
                  const showMarker = dayKey !== previousDayKey;
                  const showDayEndAnchor = dayKey !== nextDayKey;

                  return (
                    <div key={message.id} id={`message-anchor-${message.id}`} className="scroll-mt-28">
                      {showMarker ? <div className="relative z-10">{renderDayMarker(dayKey)}</div> : null}
                      <div className={cls('group mb-10 flex w-full items-center justify-between', isLeft ? 'lg:flex-row-reverse' : '')}>
                        <div className="hidden w-5/12 lg:block" />
                        <div className="absolute left-1/2 z-20 hidden h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-[5px] border-indigo-500 bg-white shadow-lg transition-transform duration-300 group-hover:scale-125 dark:bg-zinc-950 lg:flex" />
                        <div className="w-full lg:w-5/12">{renderMessageCard(message)}</div>
                      </div>
                      {showDayEndAnchor ? <div id={`day-end-anchor-${dayKey}`} className="scroll-mt-28" /> : null}
                    </div>
                  );
                })}
              </div>
            )}

            <div ref={observerTarget} className="mt-6 flex min-h-20 items-center justify-center">
              {loading && hasLoadedOnce ? (
                <div className={cls('relative overflow-hidden rounded-full border px-6 py-3 shadow-lg', colors.card)}>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent animate-pulse" />
                  <div className="relative flex items-center gap-3">
                    <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/10">
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                      <div className="absolute inset-0 rounded-full bg-indigo-400/10 blur-lg" />
                    </div>
                    <span className="text-sm font-bold">Puxando mais assunto da casa...</span>
                  </div>
                </div>
              ) : null}
            </div>

            {!loading && hasMore && messages.length > 0 ? (
              <div className="mt-2 flex justify-center">
                <button type="button" onClick={() => setPage((prev) => prev + 1)} className={cls('rounded-full px-5 py-3 text-sm font-bold transition', colors.primary)}>
                  Carregar mais posts
                </button>
              </div>
            ) : null}

            {!loading && !hasMore && messages.length > 0 ? (
              <p className={cls('mt-8 text-center text-sm font-medium', colors.textMuted)}>Você chegou ao fim do recorte atual.</p>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'dashboard' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 sm:pb-0">
            {insights ? (
              <div className="space-y-6">
                <div className="mb-2 flex flex-col gap-4 px-1 md:flex-row md:items-end md:justify-between">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="h-8 w-8 text-indigo-500" />
                    <div>
                      <h2 className="text-3xl font-black leading-none">Resumo da casa</h2>
                      <p className={cls('mt-1 text-sm font-medium', colors.textMuted)}>Uma visão rápida do que mais movimentou o recorte atual.</p>
                    </div>
                  </div>

                  <div className={cls('flex flex-wrap items-center gap-2 rounded-2xl border p-2', colors.card)}>
                    <CalendarDays className={cls('ml-2 h-4 w-4', colors.textMuted)} />
                    <span className="px-2 py-1.5 text-xs font-bold">
                      {formatRangeDate(insights.earliestMessageDate)} até {formatRangeDate(insights.latestMessageDate)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-5">
                  <div className={cls('rounded-3xl border p-6 text-center', colors.card)}>
                    <Users className="mx-auto mb-3 h-6 w-6 text-indigo-500" />
                    <p className="text-4xl font-black text-indigo-500" title={`${formatFullNumber(insights.totalMessages)} posts`}>{formatCompactNumber(insights.totalMessages)}</p>
                    <p className={cls('mt-2 text-xs font-bold uppercase tracking-widest', colors.textMuted)}>Posts no recorte</p>
                  </div>
                  <div className={cls('rounded-3xl border p-6 text-center', colors.card)}>
                    <Zap className="mx-auto mb-3 h-6 w-6 text-amber-500" />
                    <p className="text-4xl font-black text-amber-500" title={`${formatFullNumber(insights.totalReactions)} reações`}>{formatCompactNumber(insights.totalReactions)}</p>
                    <p className={cls('mt-2 text-xs font-bold uppercase tracking-widest', colors.textMuted)}>Reações somadas</p>
                  </div>
                  <div className={cls('rounded-3xl border p-6 text-center', colors.card)}>
                    <Activity className="mx-auto mb-3 h-6 w-6 text-rose-500" />
                    <p className="text-4xl font-black text-rose-500">{insights.peakHour}h</p>
                    <p className={cls('mt-2 text-xs font-bold uppercase tracking-widest', colors.textMuted)}>Hora mais agitada</p>
                  </div>
                  <div className={cls('rounded-3xl border p-6 text-center', colors.card)}>
                    <TrendingUp className="mx-auto mb-3 h-6 w-6 text-emerald-500" />
                    <p className="text-4xl font-black text-emerald-500">{topReaction ? topReaction.emoji : '—'}</p>
                    <p className={cls('mt-2 text-xs font-bold uppercase tracking-widest', colors.textMuted)}>
                      {topReaction ? `${formatCompactNumber(topReaction.count)} reações` : 'Emoji campeão'}
                    </p>
                  </div>
                  <div className={cls('overflow-hidden rounded-3xl border p-6 text-center', colors.card)}>
                    <MessageSquare className="mx-auto mb-3 h-6 w-6 text-fuchsia-500" />
                    <p className="truncate text-2xl font-black text-fuchsia-500">{insights.topParticipantName}</p>
                    <p className={cls('mt-2 text-[10px] font-bold uppercase tracking-widest', colors.textMuted)} title={`${formatFullNumber(insights.topParticipantCount)} menções`}>Mais citado ({formatCompactNumber(insights.topParticipantCount)})</p>
                  </div>
                </div>

                <div className={cls('rounded-[2rem] border p-5 shadow-lg sm:p-6', colors.card)}>
                  <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className={cls('text-[10px] font-black uppercase tracking-[0.24em]', colors.textMuted)}>recorte do dia atual</p>
                      <h3 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Panorama de hoje</h3>
                    </div>
                    <span className={cls('rounded-full px-3 py-1 text-xs font-bold', theme === 'dark' ? 'bg-zinc-950 text-zinc-400' : 'bg-zinc-100 text-zinc-500')}>
                      {todayInsights ? `${formatFullNumber(todayInsights.totalMessages)} posts hoje` : 'Sem posts hoje'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {(todaySummaryCards.length > 0 ? todaySummaryCards : [
                      { label: 'Nome do dia', value: 'Sem destaque', accent: 'text-indigo-400', helper: 'Ainda sem posts no dia atual.' },
                      { label: 'Hora mais agitada hoje', value: '—', accent: 'text-rose-400', helper: 'Sem atividade suficiente hoje.' },
                      { label: 'Emoji do dia', value: '—', accent: 'text-emerald-400', helper: 'Sem reações suficientes hoje.' },
                    ]).map((item) => (
                      <div key={item.label} className={cls('rounded-[1.6rem] border p-4 sm:p-5', theme === 'dark' ? 'border-zinc-800 bg-zinc-950/55' : 'border-zinc-200 bg-zinc-50')}>
                        <p className={cls('text-[11px] font-bold uppercase tracking-[0.18em]', colors.textMuted)}>{item.label}</p>
                        <p className={cls('mt-2 text-lg font-black leading-tight sm:text-xl', item.accent)}>{item.value}</p>
                        <p className={cls('mt-2 text-xs leading-5', colors.textMuted)}>{item.helper}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={cls('rounded-[2rem] border p-5 shadow-lg sm:p-6', colors.card)}>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className={cls('flex items-center gap-2 text-sm font-bold uppercase tracking-widest', colors.textMuted)}>
                        <TrendingUp className="h-5 w-5 text-indigo-500" />
                        Reações que dominaram o período
                      </h3>
                      <p className={cls('mt-2 text-sm', colors.textMuted)}>Os emojis mais fortes do recorte, com ranking e participação relativa.</p>
                    </div>
                    <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-[10px] font-bold text-indigo-500 sm:text-xs">{formatCompactNumber(insights.uniqueReactionCount)} emojis únicos</span>
                  </div>
                  {insights.topReactions.length > 0 ? (
                    <div className="space-y-3">
                      {insights.topReactions.slice(0, 5).map((reaction, index) => {
                        const maxCount = insights.topReactions[0].count || 1;
                        const barWidth = Math.max((reaction.count / maxCount) * 100, 10);
                        const share = totalReactionsAcrossPeriod > 0 ? Math.round((reaction.count / totalReactionsAcrossPeriod) * 100) : 0;
                        return (
                          <div
                            key={`${reaction.emoji}-${index}`}
                            className={cls(
                              'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[1.35rem] border px-3 py-3 sm:px-4',
                              theme === 'dark' ? 'border-zinc-800 bg-zinc-950/40' : 'border-zinc-200 bg-zinc-50/90',
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className={cls('inline-flex h-8 w-8 items-center justify-center rounded-full text-lg font-black', index === 0 ? 'bg-indigo-500/15 text-indigo-500' : theme === 'dark' ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-100 text-zinc-700')}>
                                {reaction.emoji}
                              </span>
                              <span className={cls('text-xs font-black', index === 0 ? 'text-indigo-500' : colors.textMuted)}>{index + 1}º</span>
                            </div>
                            <div className="min-w-0">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <span className="truncate text-sm font-black">{formatCompactNumber(reaction.count)}</span>
                                <span className={cls('shrink-0 text-[11px] font-bold uppercase tracking-[0.16em]', colors.textMuted)}>{share}% do total</span>
                              </div>
                              <div className={cls('h-2.5 w-full overflow-hidden rounded-full', theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-100')}>
                                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" style={{ width: `${barWidth}%` }} />
                              </div>
                            </div>
                            <div className={cls('text-right text-[11px] font-bold uppercase tracking-[0.16em]', colors.textMuted)}>
                              {formatFullNumber(reaction.count)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={cls('text-sm', colors.textMuted)}>Poucos dados nesse período.</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className={cls('flex flex-col overflow-hidden rounded-[2rem] border shadow-lg', colors.card)}>
                    <div className="relative overflow-hidden border-b border-white/6 p-5 sm:p-6">
                      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-orange-500/18 via-amber-500/8 to-transparent" />
                      <div className="relative flex items-start justify-between gap-4">
                        <div>
                          <h3 className={cls('flex items-center gap-2 text-sm font-bold uppercase tracking-widest', colors.textMuted)}>
                            <Flame className="h-5 w-5 text-orange-500" />
                            Post mais quente do período
                          </h3>
                          <p className="mt-3 text-2xl font-black tracking-tight text-orange-400 sm:text-[2rem]">
                            {insights.topMessage ? formatCompactNumber(topMessageReactionTotal) : '—'}
                            <span className="ml-2 text-sm font-semibold text-orange-300/90">🔥 em alta</span>
                          </p>
                          <p className={cls('mt-2 max-w-sm text-sm leading-6', colors.textMuted)}>
                            O maior pico de reações dentro de todo o recorte filtrado.
                          </p>
                        </div>
                        {insights.topMessage?.date ? (
                          <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-bold text-orange-300">
                            {formatDate(insights.topMessage.date)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="p-4 sm:p-5">
                      {insights.topMessage ? (
                        <div className="origin-top">{renderHotSummaryCard(insights.topMessage)}</div>
                      ) : (
                        <div className="flex min-h-56 flex-1 items-center justify-center">
                          <p className={colors.textMuted}>Nenhum destaque.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={cls('flex flex-col overflow-hidden rounded-[2rem] border shadow-lg', colors.card)}>
                    <div className="relative overflow-hidden border-b border-white/6 p-5 sm:p-6">
                      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-fuchsia-500/18 via-indigo-500/8 to-transparent" />
                      <div className="relative flex items-start justify-between gap-4">
                        <div>
                          <h3 className={cls('flex items-center gap-2 text-sm font-bold uppercase tracking-widest', colors.textMuted)}>
                            <Flame className="h-5 w-5 text-fuchsia-500" />
                            Post mais quente de hoje
                          </h3>
                          <p className="mt-3 text-2xl font-black tracking-tight text-fuchsia-400 sm:text-[2rem]">
                            {todayInsights?.topMessage ? formatCompactNumber(todayTopMessageReactionTotal) : '—'}
                            <span className="ml-2 text-sm font-semibold text-fuchsia-300/90">🔥 hoje</span>
                          </p>
                          <p className={cls('mt-2 max-w-sm text-sm leading-6', colors.textMuted)}>
                            O post que mais concentrou reações no dia atual em horário de Brasília.
                          </p>
                        </div>
                        {todayInsights?.topMessage?.date ? (
                          <span className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-3 py-1 text-xs font-bold text-fuchsia-300">
                            {formatDate(todayInsights.topMessage.date)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="p-4 sm:p-5">
                      {todayInsights?.topMessage ? (
                        <div className="origin-top">{renderHotSummaryCard(todayInsights.topMessage)}</div>
                      ) : (
                        <div className="flex min-h-56 flex-1 items-center justify-center">
                          <p className={colors.textMuted}>Ainda sem um destaque claro hoje.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className={cls('rounded-[2rem] border p-8 shadow-lg', colors.card)}>
                    <h3 className={cls('mb-8 flex items-center gap-2 text-sm font-bold uppercase tracking-widest', colors.textMuted)}>
                      <Users className="h-5 w-5 text-indigo-500" />
                      Quem mais rendeu assunto
                    </h3>
                    <div className="space-y-5">
                      {topNames.length > 0 ? (
                        topNames.map((item, index) => {
                          const maxMentions = topNames[0]?.count || 1;
                          const barWidth = Math.max((item.count / maxMentions) * 100, 5);
                          const participantInfo = participants.find((participant) => participant.name === item.fullName);

                          return (
                            <div key={`${item.name}-${index}`} className="flex items-center gap-4">
                              <span className={cls('w-4 text-right text-sm font-black', index < 3 ? 'text-indigo-500' : colors.textMuted)}>{index + 1}º</span>
                              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-800 shadow-sm">
                                {participantInfo ? <img src={participantInfo.image} className="h-full w-full object-cover" alt={item.name} loading="lazy" /> : null}
                              </div>
                              <div className="flex-1">
                                <div className="mb-1 flex justify-between gap-3">
                                  <span className="text-sm font-bold">{item.name}</span>
                                  <span className={cls('text-xs font-bold', colors.textMuted)} title={`${formatFullNumber(item.count)} menções`}>{formatCompactNumber(item.count)} menções</span>
                                </div>
                                <div className={cls('h-2 w-full overflow-hidden rounded-full', theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-100')}>
                                  <div
                                    className={cls('h-full rounded-full transition-all duration-1000', index === 0 ? 'bg-indigo-500' : index === 1 ? 'bg-indigo-400' : 'bg-zinc-500')}
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className={colors.textMuted}>Sem dados.</p>
                      )}
                    </div>
                  </div>

                  <div className={cls('min-w-0 overflow-hidden rounded-[2rem] border p-5 pb-8 sm:p-8 sm:pb-10 shadow-lg', colors.card)}>
                    <div className="mb-6 flex items-center justify-between gap-3">
                      <h3 className={cls('flex items-center gap-2 text-sm font-bold uppercase tracking-widest', colors.textMuted)}>
                        <Activity className="h-5 w-5 text-indigo-500" />
                        Movimento ao longo do dia
                      </h3>
                      <span className={cls('rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]', theme === 'dark' ? 'bg-zinc-900 text-zinc-400' : 'bg-zinc-100 text-zinc-500')}>
                        pico às {insights.peakHour}h
                      </span>
                    </div>

                    <div className="min-w-0 overflow-hidden">
                      <div
                        className="grid items-end gap-1 sm:gap-1.5"
                        style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
                      >
                        {insights.activityByHour.map((count, hour) => {
                          const height = maxActivityCount > 0 ? Math.max((count / maxActivityCount) * 100, count > 0 ? 8 : 0) : 0;
                          const showLabelMobile = hour % 6 === 0 || hour === 23;
                          const showLabelDesktop = hour % 3 === 0 || hour === 23;

                          return (
                            <div key={hour} className="group min-w-0">
                              <div className="relative flex h-36 w-full items-end justify-center rounded-2xl sm:h-44">
                                <div className={cls('absolute inset-x-0 bottom-0 top-0 rounded-2xl', theme === 'dark' ? 'bg-zinc-950/45' : 'bg-zinc-100/80')} />
                                <div className={cls('absolute inset-x-0 top-1/4 border-t', theme === 'dark' ? 'border-zinc-800/70' : 'border-zinc-200')} />
                                <div className={cls('absolute inset-x-0 top-2/4 border-t', theme === 'dark' ? 'border-zinc-800/70' : 'border-zinc-200')} />
                                <div className={cls('absolute inset-x-0 top-3/4 border-t', theme === 'dark' ? 'border-zinc-800/70' : 'border-zinc-200')} />
                                <div
                                  className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-800 px-2 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 sm:text-xs"
                                >
                                  {formatFullNumber(count)} posts
                                </div>
                                <div
                                  className={cls(
                                    'relative z-10 w-full max-w-[10px] rounded-t-[8px] transition-all duration-700 sm:max-w-[14px]',
                                    hour === insights.peakHour ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.45)]' : 'bg-indigo-500/80',
                                  )}
                                  style={{
                                    height: `${height}%`,
                                    minHeight: count > 0 ? '12px' : '0px',
                                  }}
                                  title={`${formatFullNumber(count)} posts às ${hour}h`}
                                />
                              </div>
                              <span className={cls('mt-2 block text-center text-[9px] font-bold sm:hidden', showLabelMobile ? colors.textMuted : 'text-transparent')}>
                                {hour}h
                              </span>
                              <span className={cls('mt-2 hidden text-center text-[10px] font-bold sm:block', showLabelDesktop ? colors.textMuted : 'text-transparent')}>
                                {hour}h
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-center py-20">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
              </div>
            )}
          </div>
        ) : null}

        {activeTab === 'favorites' ? (
          <div className="mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <section className={cls('mb-8 rounded-[2rem] border p-5 sm:p-6', colors.soft)}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className={cls('text-xs font-bold uppercase tracking-[0.2em]', colors.textMuted)}>seus salvos</p>
                  <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Momentos guardados</h2>
                </div>
                <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-500">
                  {favoriteList.length} salvos
                </span>
              </div>
              <p className={cls('mt-3 text-sm leading-7 sm:text-base', colors.textMuted)}>
                Salve seus posts favoritos para revisar depois sem depender do filtro atual.
              </p>
            </section>

            {favoriteList.length === 0 ? (
              <div className="py-24 text-center">
                <div className={cls('mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border', colors.card)}>
                  <Bookmark className={cls('h-8 w-8', colors.textMuted)} />
                </div>
                <h3 className="mb-2 text-xl font-bold">Você ainda não salvou nenhum post</h3>
                <p className={colors.textMuted}>Toque no ícone de marcador em qualquer card para montar sua seleção favorita.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {favoriteList.map((message) => (
                  <div key={message.id}>{renderMessageCard(message)}</div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

        <footer className={cls('mx-auto mt-10 max-w-6xl px-4 pb-28 sm:px-6 sm:pb-2')}>
          <div className={cls('flex items-center justify-center rounded-full border px-4 py-3 text-center text-xs sm:text-sm', theme === 'dark' ? 'border-zinc-800 bg-zinc-950/70 text-zinc-400' : 'border-zinc-200 bg-white/80 text-zinc-500')}>
            <span>
              Feito com <span role="img">🔮</span> por Tilap.io
            </span>
          </div>
        </footer>

      {showBackToTop ? (
        <button
          type="button"
          onClick={scrollToTop}
          className={cls(
            'fixed bottom-24 right-4 z-50 inline-flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-bold shadow-2xl transition hover:-translate-y-0.5 sm:bottom-6 sm:right-6',
            theme === 'dark'
              ? 'border-indigo-500/20 bg-zinc-950/90 text-indigo-300 backdrop-blur-xl'
              : 'border-indigo-200 bg-white/90 text-indigo-700 backdrop-blur-xl',
          )}
          aria-label="Voltar ao topo"
        >
          <MoveUpRight className="h-4 w-4 -rotate-45" />
          Voltar ao topo
        </button>
      ) : null}

      <nav className={cls('fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between rounded-full border px-3 py-2 backdrop-blur-xl sm:hidden', colors.glass)}>
        {[
          { key: 'feed', label: 'Feed', icon: MessageSquare },
          { key: 'dashboard', label: 'Resumo', icon: BarChart3 },
          { key: 'favorites', label: 'Salvos', icon: Bookmark },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as ActiveTab)}
              className={cls('flex flex-1 flex-col items-center gap-1 rounded-full px-3 py-2 text-[11px] font-bold', active ? 'text-indigo-500' : colors.textMuted)}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </main>
  );
}