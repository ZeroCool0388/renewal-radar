'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';

// Visit any page with ?notrack=1 to stop counting visits from this browser,
// or ?notrack=0 to start again. The choice is kept in localStorage only.
const OPT_OUT_KEY = 'va-disable';

function isOptedOut(): boolean {
  try {
    const choice = new URLSearchParams(window.location.search).get('notrack');
    if (choice === '1') window.localStorage.setItem(OPT_OUT_KEY, '1');
    if (choice === '0') window.localStorage.removeItem(OPT_OUT_KEY);
    return window.localStorage.getItem(OPT_OUT_KEY) !== null;
  } catch {
    return false;
  }
}

function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  return isOptedOut() ? null : event;
}

export function SiteAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
