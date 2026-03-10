// ===== Deriv WebSocket Connector =====

type MessageHandler = (data: any) => void;

export class DerivWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reqId = 0;
  private appId: number;
  private pendingRequests: Map<number, { resolve: (data: any) => void; reject: (err: Error) => void }> = new Map();

  constructor(appId: number) {
    this.appId = appId;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error('WebSocket connection failed'));
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Handle request-response
        if (data.req_id && this.pendingRequests.has(data.req_id)) {
          const pending = this.pendingRequests.get(data.req_id)!;
          this.pendingRequests.delete(data.req_id);
          if (data.error) {
            pending.reject(new Error(data.error.message));
          } else {
            pending.resolve(data);
          }
        }

        // Handle subscriptions
        if (data.msg_type) {
          const handlers = this.handlers.get(data.msg_type) || [];
          handlers.forEach(h => h(data));
        }
      };
      this.ws.onclose = () => {
        const handlers = this.handlers.get('connection_closed') || [];
        handlers.forEach(h => h({}));
      };
    });
  }

  send(msg: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      const reqId = ++this.reqId;
      this.pendingRequests.set(reqId, { resolve, reject });
      this.ws.send(JSON.stringify({ ...msg, req_id: reqId }));
      
      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  sendNoWait(msg: Record<string, any>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const reqId = ++this.reqId;
    this.ws.send(JSON.stringify({ ...msg, req_id: reqId }));
  }

  on(msgType: string, handler: MessageHandler): void {
    const existing = this.handlers.get(msgType) || [];
    this.handlers.set(msgType, [...existing, handler]);
  }

  off(msgType: string, handler: MessageHandler): void {
    const existing = this.handlers.get(msgType) || [];
    this.handlers.set(msgType, existing.filter(h => h !== handler));
  }

  async authorize(token: string): Promise<any> {
    return this.send({ authorize: token });
  }

  async subscribeTicks(symbol: string): Promise<void> {
    this.sendNoWait({ ticks: symbol, subscribe: 1 });
  }

  async buyContract(params: {
    amount: number;
    basis: string;
    contract_type: string;
    currency: string;
    duration: number;
    duration_unit: string;
    symbol: string;
    barrier?: string;
  }): Promise<any> {
    // First get proposal
    const proposal = await this.send({
      proposal: 1,
      ...params,
    });

    if (proposal.error) throw new Error(proposal.error.message);

    // Buy the proposal
    const buy = await this.send({
      buy: proposal.proposal.id,
      price: params.amount,
    });

    return buy;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingRequests.clear();
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
