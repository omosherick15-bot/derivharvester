import React from 'react';
import { AccountInfo } from '@/lib/trading-types';

interface Props {
  account: AccountInfo | null;
}

export const AccountPanel: React.FC<Props> = ({ account }) => {
  if (!account) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4 space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account</h2>
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Name</span>
          <span className="font-medium truncate ml-2">{account.name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">ID</span>
          <span className="font-mono text-xs">{account.loginid}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Currency</span>
          <span>{account.currency}</span>
        </div>
        <div className="flex justify-between items-baseline pt-1 border-t border-border">
          <span className="text-muted-foreground text-sm">Balance</span>
          <span className="text-lg font-bold font-mono text-profit">
            {account.currency} {account.balance.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};
