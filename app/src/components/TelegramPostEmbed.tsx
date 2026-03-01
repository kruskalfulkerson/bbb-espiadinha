'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

type Props = {
  postUrl: string;
  className?: string;
  compact?: boolean;
};

const parsePostRef = (postUrl: string) => {
  const match = postUrl.match(/t\.me\/([^/?#]+)\/(\d+)/i);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
};

let widgetPromise: Promise<void> | null = null;

const ensureTelegramWidget = () => {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as Window & { TelegramWidget?: unknown }).TelegramWidget) return Promise.resolve();
  if (widgetPromise) return widgetPromise;

  widgetPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-telegram-widget-loader="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar widget do Telegram.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.dataset.telegramWidgetLoader = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar widget do Telegram.'));
    document.head.appendChild(script);
  });

  return widgetPromise;
};

function TelegramPostEmbedInner({ postUrl, className, compact = false }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const postRef = useMemo(() => parsePostRef(postUrl), [postUrl]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !postRef) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '700px 0px',
        threshold: 0.01,
      },
    );

    observer.observe(shell);
    return () => observer.disconnect();
  }, [postRef]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !postRef || !isVisible) return;

    let cancelled = false;
    setIsLoaded(false);

    ensureTelegramWidget()
      .then(() => {
        if (cancelled || !mountRef.current) return;

        const mountNode = mountRef.current;
        mountNode.replaceChildren();

        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.setAttribute('data-telegram-post', postRef);
        script.setAttribute('data-width', '100%');
        script.setAttribute('data-userpic', 'false');
        script.setAttribute('data-color', '4f46e5');
        mountNode.appendChild(script);

        window.setTimeout(() => {
          if (!cancelled) setIsLoaded(true);
        }, 180);
      })
      .catch(() => {
        if (!cancelled) setIsLoaded(true);
      });

    return () => {
      cancelled = true;
      mountRef.current?.replaceChildren();
    };
  }, [isVisible, postRef]);

  if (!postRef) return null;

  return (
    <div className={className}>
      <div
        ref={shellRef}
        className="telegram-embed-shell relative overflow-hidden rounded-[1.5rem] bg-transparent"
        style={{ minHeight: compact ? 280 : 340 }}
      >
        <div ref={mountRef} className="h-full w-full" />

        {!isLoaded ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[1.5rem] border border-white/8 bg-[linear-gradient(135deg,rgba(17,24,39,0.92),rgba(24,24,27,0.74))]">
            <div className="flex flex-col items-center gap-3 text-center text-white/80">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-300" />
                <div className="absolute inset-0 rounded-full bg-indigo-400/10 blur-xl" />
              </div>
              <div>
                <p className="text-sm font-semibold">Carregando embed</p>
                <p className="mt-1 text-xs text-white/50">O post entra em cena quando chega perto da tela.</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

    </div>
  );
}

export const TelegramPostEmbed = memo(TelegramPostEmbedInner);
