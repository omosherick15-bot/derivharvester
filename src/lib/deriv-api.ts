import { AccountInfo, TradeLog } from './trading-types';

type MessageHandler = (data: any) => void;

class DerivAPI {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reqId = 0;
  private pendingRequests: Map<number, { resolve: (data: any) => void; reject: (err: any) => void }> = new Map();
  private tickSubscriptions: Map<string, string> = new Map();
  private _isConnected = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private token: string = '';

  get isConnected() { return this._isConnected; }

  connect(token: string): Promise<void> {
    this.token = token;
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
        this.ws.onopen = () => {
          this._isConnected = true;
          this.emit('connection', { status: 'connected' });
          resolve();
        };
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.req_id && this.pendingRequests.has(data.req_id)) {
              const pending = this.pendingRequests.get(data.req_id)!;
              this.pendingRequests.delete(data.req_id);
              if (data.error) {
                pending.reject(data.error);
              } else {
                pending.resolve(data);
              }
            }
            if (data.msg_type === 'tick') {
              this.emit('tick', data.tick);
            }
            if (data.msg_type === 'proposal_open_contract') {
              this.emit('contract_update', data.proposal_open_contract);
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        };
        this.ws.onclose = () => {
          this._isConnected = false;
          this.emit('connection', { status: 'disconnected' });
        };
        this.ws.onerror = (err) => {
          reject(err);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.tickSubscriptions.clear();
    this.pendingRequests.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
  }

  private send(data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket not connected'));
      }
      const reqId = ++this.reqId;
      this.pendingRequests.set(reqId, { resolve, reject });
      this.ws.send(JSON.stringify({ ...data, req_id: reqId }));
      setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async authorize(): Promise<AccountInfo> {
    const resp = await this.send({ authorize: this.token });
    const auth = resp.authorize;
    return {
      name: auth.fullname || auth.loginid,
      loginid: auth.loginid,
      currency: auth.currency,
      balance: auth.balance,
      email: auth.email || '',
    };
  }

  async getBalance(): Promise<number> {
    const resp = await this.send({ balance: 1, subscribe: 1 });
    return resp.balance.balance;
  }

  async subscribeTicks(symbol: string): Promise<void> {
    // Allow retry — don't skip if previously attempted but failed
    if (this.tickSubscriptions.has(symbol)) return;
    const resp = await this.send({ ticks: symbol, subscribe: 1 });
    if (resp.subscription) {
      this.tickSubscriptions.set(symbol, resp.subscription.id);
    }
  }

  async unsubscribeAll(): Promise<void> {
    try {
      await this.send({ forget_all: 'ticks' });
      this.tickSubscriptions.clear();
    } catch (e) {
      console.error('Unsubscribe error:', e);
    }
  }

  async buyContract(params: {
    contractType: string;
    symbol: string;
    duration: number;
    durationUnit: string;
    barrier?: string;
    amount: number;
    currency: string;
  }): Promise<any> {
    const proposalPayload: any = {
      proposal: 1,
      amount: params.amount,
      basis: 'stake',
      contract_type: params.contractType,
      currency: params.currency,
      duration: params.duration,
      duration_unit: params.durationUnit,
      symbol: params.symbol,
    };
    if (params.barrier) {
      proposalPayload.barrier = params.barrier;
    }
    const proposal = await this.send(proposalPayload);

    if (proposal.error) throw proposal.error;

    // Buy the proposal
    const buy = await this.send({
      buy: proposal.proposal.id,
      price: params.amount,
    });

    return buy.buy;
  }

  async waitForContractSettlement(contractId: number): Promise<any> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let retryCount = 0;
      const maxRetries = 3;

      const resolveOnce = (contract: any) => {
        if (settled) return;
        settled = true;
        resolve(contract);
      };

      const pollContract = async () => {
        if (settled) return;
        try {
          const resp = await this.send({
            proposal_open_contract: 1,
            contract_id: contractId,
            subscribe: 1,
          });

          const contract = resp.proposal_open_contract;
          if (contract && (contract.is_sold || (contract.status && contract.status !== 'open'))) {
            resolveOnce(contract);
            return;
          }

          // Listen for updates via subscription
          const handler = (update: any) => {
            if (update.contract_id === contractId && (update.is_sold || (update.status && update.status !== 'open'))) {
              this.off('contract_update', handler);
              resolveOnce(update);
            }
          };
          this.on('contract_update', handler);

          // Safety: if no update after 30s, poll again instead of giving up
          setTimeout(() => {
            if (settled) return;
            this.off('contract_update', handler);
            retryCount++;
            if (retryCount < maxRetries) {
              console.log(`Contract ${contractId} still open, polling again (${retryCount}/${maxRetries})...`);
              pollContract();
            } else {
              // Final attempt: one last direct query without subscribe
              this.send({ proposal_open_contract: 1, contract_id: contractId }).then(finalResp => {
                resolveOnce(finalResp.proposal_open_contract || contract);
              }).catch(() => {
                resolveOnce(contract);
              });
            }
          }, 30000);
        } catch (err) {
          reject(err);
        }
      };
      pollContract();
    });
  }

  on(event: string, handler: MessageHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
  }

  off(event: string, handler: MessageHandler) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  }

  private emit(event: string, data: any) {
    const handlers = this.handlers.get(event);
    if (handlers) handlers.forEach(h => h(data));
  }
}

export const derivApi = new DerivAPI();
