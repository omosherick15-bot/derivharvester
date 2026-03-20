import { useEffect, useRef, useState } from 'react';
import { ALL_SYMBOLS, SYMBOL_DECIMALS, SymbolData } from '@/lib/trading-types';
import { createSymbolData, updateSymbolData } from '@/lib/trading-engine';

const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3?app_id=1089';
const RECONNECT_DELAY_MS = 800;
const STALE_THRESHOLD_MS = 2500;
const STALE_CHECK_INTERVAL_MS = 1000;
const SUBSCRIPTION_STAGGER_MS = 35;
const PRICE_TICKS_WINDOW = 50;

const symbolMeta = new Map(ALL_SYMBOLS.map((symbol) => [symbol.symbol, symbol]));

const createInitialPriceMap = (fallbackData?: Map<string, SymbolData>) => {
  const initial = new Map<string, SymbolData>();

  ALL_SYMBOLS.forEach((symbol) => {
    initial.set(
      symbol.symbol,
      fallbackData?.get(symbol.symbol) ?? createSymbolData(symbol.symbol, symbol.name),
    );
  });

  return initial;
};

export function useDerivLivePrices(fallbackData?: Map<string, SymbolData>) {
  const [priceData, setPriceData] = useState<Map<string, SymbolData>>(() => createInitialPriceMap(fallbackData));
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const staleCheckIntervalRef = useRef<number | null>(null);
  const subscriptionTimersRef = useRef<number[]>([]);
  const lastTickAtRef = useRef<Map<string, number>>(new Map());
  const expectedCloseRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const clearSubscriptionTimers = () => {
      subscriptionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      subscriptionTimersRef.current = [];
    };

    const closeSocket = (expected = false) => {
      expectedCloseRef.current = expected;
      clearSubscriptionTimers();

      const socket = socketRef.current;
      if (!socket) return;

      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
      socketRef.current = null;
    };

    const updatePrice = (symbol: string, quote: number) => {
      const meta = symbolMeta.get(symbol);
      if (!meta) return;

      lastTickAtRef.current.set(symbol, Date.now());

      setPriceData((prev) => {
        const next = new Map(prev);
        const existing = next.get(symbol) ?? createSymbolData(meta.symbol, meta.name);
        const decimals = SYMBOL_DECIMALS[symbol] ?? 2;

        next.set(symbol, updateSymbolData(existing, quote, decimals, PRICE_TICKS_WINDOW));
        return next;
      });
    };

    const scheduleReconnect = (delay = RECONNECT_DELAY_MS) => {
      if (!isMountedRef.current || reconnectTimerRef.current !== null) return;

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connectFeed();
      }, delay);
    };

    const subscribeAllSymbols = (socket: WebSocket) => {
      clearSubscriptionTimers();

      subscriptionTimersRef.current = ALL_SYMBOLS.map(({ symbol }, index) => (
        window.setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
        }, index * SUBSCRIPTION_STAGGER_MS)
      ));
    };

    const connectFeed = () => {
      if (!isMountedRef.current) return;

      clearReconnectTimer();
      closeSocket(true);
      expectedCloseRef.current = false;

      const socket = new WebSocket(DERIV_WS_URL);
      socketRef.current = socket;

      socket.onopen = () => {
        const now = Date.now();
        ALL_SYMBOLS.forEach(({ symbol }) => lastTickAtRef.current.set(symbol, now));
        subscribeAllSymbols(socket);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.error) {
            console.error('Dedicated live price feed error:', data.error);
            closeSocket();
            scheduleReconnect();
            return;
          }

          if (data.msg_type === 'tick' && data.tick?.symbol && typeof data.tick.quote === 'number') {
            updatePrice(data.tick.symbol, data.tick.quote);
          }
        } catch (error) {
          console.error('Dedicated live price parse error:', error);
        }
      };

      socket.onerror = () => {
        closeSocket();
        scheduleReconnect(250);
      };

      socket.onclose = () => {
        socketRef.current = null;
        clearSubscriptionTimers();

        if (expectedCloseRef.current) {
          expectedCloseRef.current = false;
          return;
        }

        scheduleReconnect(250);
      };
    };

    connectFeed();

    staleCheckIntervalRef.current = window.setInterval(() => {
      const socket = socketRef.current;
      const now = Date.now();

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        scheduleReconnect(250);
        return;
      }

      const hasStaleFeed = ALL_SYMBOLS.some(({ symbol }) => {
        const lastTickAt = lastTickAtRef.current.get(symbol);
        return !lastTickAt || now - lastTickAt > STALE_THRESHOLD_MS;
      });

      if (hasStaleFeed) {
        closeSocket();
        scheduleReconnect(250);
      }
    }, STALE_CHECK_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      clearReconnectTimer();
      clearSubscriptionTimers();

      if (staleCheckIntervalRef.current !== null) {
        window.clearInterval(staleCheckIntervalRef.current);
        staleCheckIntervalRef.current = null;
      }

      closeSocket(true);
    };
  }, []);

  return priceData;
}