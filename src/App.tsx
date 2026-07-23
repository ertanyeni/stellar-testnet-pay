import { useCallback, useEffect, useState } from 'react';
import './App.css';
import {
  getAccountState,
  fundWithFriendbot,
  buildPaymentXDR,
  submitSignedXDR,
  isValidPublicKey,
  describeHorizonError,
  shorten,
  explorerTxUrl,
  explorerAccountUrl,
  type AccountState,
} from './lib/stellar';
import {
  isFreighterInstalled,
  connectWallet,
  getConnectedAddress,
  getWalletNetwork,
  signWithFreighter,
  type NetworkInfo,
} from './lib/wallet';

type TxState = 'idle' | 'pending' | 'success' | 'error';
interface TxStatus {
  state: TxState;
  message?: string;
  hash?: string;
}

export default function App() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [account, setAccount] = useState<AccountState | null>(null);

  const [connecting, setConnecting] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [funding, setFunding] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [sending, setSending] = useState(false);
  const [tx, setTx] = useState<TxStatus>({ state: 'idle' });

  const refreshBalance = useCallback(async (pk: string) => {
    setLoadingBalance(true);
    try {
      setAccount(await getAccountState(pk));
    } catch {
      setAccount(null);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  const hydrate = useCallback(
    async (pk: string) => {
      setAddress(pk);
      setNetwork(await getWalletNetwork());
      await refreshBalance(pk);
    },
    [refreshBalance],
  );

  // On load: detect Freighter and restore an already-authorised session.
  useEffect(() => {
    (async () => {
      const ok = await isFreighterInstalled();
      setInstalled(ok);
      if (!ok) return;
      const existing = await getConnectedAddress();
      if (existing) await hydrate(existing);
    })();
  }, [hydrate]);

  const handleConnect = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const pk = await connectWallet();
      await hydrate(pk);
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Could not connect wallet.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setAddress(null);
    setAccount(null);
    setNetwork(null);
    setTx({ state: 'idle' });
    setConnectError(null);
  };

  const handleFund = async () => {
    if (!address) return;
    setFunding(true);
    try {
      await fundWithFriendbot(address);
      await refreshBalance(address);
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Friendbot funding failed.');
    } finally {
      setFunding(false);
    }
  };

  const amountNum = Number(amount);
  const destinationValid = isValidPublicKey(destination.trim());
  const amountValid = amount !== '' && Number.isFinite(amountNum) && amountNum > 0;
  const notSelf = destination.trim() !== address;
  const canSend =
    !!address && destinationValid && amountValid && notSelf && !sending && !!account?.funded;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !canSend) return;
    setSending(true);
    setTx({ state: 'pending', message: 'Building and signing transaction…' });
    try {
      const xdr = await buildPaymentXDR({
        source: address,
        destination: destination.trim(),
        amount: amountNum.toString(),
        memo,
      });
      const signed = await signWithFreighter(xdr, address);
      setTx({ state: 'pending', message: 'Submitting to the Stellar testnet…' });
      const { hash } = await submitSignedXDR(signed);
      setTx({ state: 'success', message: 'Payment confirmed on testnet.', hash });
      setDestination('');
      setAmount('');
      setMemo('');
      await refreshBalance(address);
    } catch (err) {
      setTx({ state: 'error', message: describeHorizonError(err) });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ✦
          </span>
          <div>
            <h1>Stellar Testnet Pay</h1>
            <p className="tagline">Send XLM on the Stellar Test Network</p>
          </div>
        </div>
        <span className="net-badge" data-testnet={network ? network.isTestnet : true}>
          {network ? network.network : 'TESTNET'}
        </span>
      </header>

      <main className="stack">
        {installed === false && (
          <section className="card warn">
            <h2>Freighter wallet required</h2>
            <p>
              This dApp signs transactions with the Freighter browser wallet. Install it, switch it
              to <strong>Testnet</strong>, then reload this page.
            </p>
            <a
              className="btn primary"
              href="https://www.freighter.app/"
              target="_blank"
              rel="noreferrer"
            >
              Get Freighter →
            </a>
          </section>
        )}

        {installed && !address && (
          <section className="card center">
            <h2>Connect your wallet</h2>
            <p className="muted">Authorise Freighter to view your balance and sign payments.</p>
            <button className="btn primary" onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect Freighter'}
            </button>
            {connectError && <p className="error-text">{connectError}</p>}
          </section>
        )}

        {address && (
          <>
            <section className="card account">
              <div className="row between">
                <div>
                  <span className="label">Connected account</span>
                  <a
                    className="mono addr"
                    href={explorerAccountUrl(address)}
                    target="_blank"
                    rel="noreferrer"
                    title={address}
                  >
                    {shorten(address, 6)}
                  </a>
                </div>
                <button className="btn ghost" onClick={handleDisconnect}>
                  Disconnect
                </button>
              </div>

              {network && !network.isTestnet && (
                <p className="error-text">
                  Freighter is on “{network.network}”. Switch it to Testnet to use this dApp.
                </p>
              )}

              <div className="balance">
                <span className="label">XLM balance</span>
                <div className="balance-value">
                  {loadingBalance ? (
                    <span className="muted">Loading…</span>
                  ) : account?.funded ? (
                    <>
                      <strong>
                        {Number(account.xlmBalance).toLocaleString(undefined, {
                          maximumFractionDigits: 7,
                        })}
                      </strong>
                      <span className="unit">XLM</span>
                    </>
                  ) : (
                    <span className="muted">Account not funded yet</span>
                  )}
                </div>
                <div className="row gap">
                  <button
                    className="btn ghost sm"
                    onClick={() => refreshBalance(address)}
                    disabled={loadingBalance}
                  >
                    ↻ Refresh
                  </button>
                  {account && !account.funded && (
                    <button className="btn primary sm" onClick={handleFund} disabled={funding}>
                      {funding ? 'Funding…' : 'Fund with Friendbot'}
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section className="card">
              <h2>Send a payment</h2>
              <form className="form" onSubmit={handleSend}>
                <label className="field">
                  <span>Destination address</span>
                  <input
                    className="mono"
                    placeholder="G…"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  {destination.trim() !== '' && !destinationValid && (
                    <small className="error-text">Not a valid Stellar public key.</small>
                  )}
                  {destination.trim() !== '' && destinationValid && !notSelf && (
                    <small className="error-text">You can’t send to your own account.</small>
                  )}
                </label>

                <label className="field">
                  <span>Amount (XLM)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.0000001"
                    placeholder="1.5"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>
                    Memo <em className="muted">(optional, ≤28 chars)</em>
                  </span>
                  <input
                    placeholder="Thanks!"
                    maxLength={28}
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </label>

                <button className="btn primary block" type="submit" disabled={!canSend}>
                  {sending ? 'Sending…' : 'Send XLM'}
                </button>
              </form>

              {tx.state !== 'idle' && (
                <div className={`tx-result ${tx.state}`}>
                  <span className="tx-dot" aria-hidden="true" />
                  <div>
                    <strong className="tx-title">
                      {tx.state === 'pending' && 'Processing'}
                      {tx.state === 'success' && 'Success'}
                      {tx.state === 'error' && 'Failed'}
                    </strong>
                    <p>{tx.message}</p>
                    {tx.hash && (
                      <a
                        href={explorerTxUrl(tx.hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mono"
                      >
                        {shorten(tx.hash, 8)} ↗
                      </a>
                    )}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="foot">
        <span>Stellar White Belt · Rise In</span>
        <a href="https://developers.stellar.org/" target="_blank" rel="noreferrer">
          Stellar docs
        </a>
      </footer>
    </div>
  );
}
