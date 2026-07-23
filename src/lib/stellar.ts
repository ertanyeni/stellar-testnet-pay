/**
 * Stellar testnet helpers built on @stellar/stellar-sdk (Horizon).
 * All operations target the Stellar Test Network.
 */
import {
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  BASE_FEE,
  StrKey,
  Memo,
} from '@stellar/stellar-sdk';

export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';

export const server = new Horizon.Server(HORIZON_URL);

export function isValidPublicKey(address: string): boolean {
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}

export function shorten(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export interface AccountState {
  funded: boolean;
  xlmBalance: string;
}

/**
 * Fetch the account's native (XLM) balance from Horizon.
 * An unfunded testnet account returns a 404 — we surface that as `funded: false`.
 */
export async function getAccountState(publicKey: string): Promise<AccountState> {
  try {
    const account = await server.loadAccount(publicKey);
    const native = account.balances.find((b) => b.asset_type === 'native');
    return { funded: true, xlmBalance: native ? native.balance : '0' };
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 404 || (e as { name?: string })?.name === 'NotFoundError') {
      return { funded: false, xlmBalance: '0' };
    }
    throw e;
  }
}

/** Ask Friendbot to create + fund the account with test XLM (testnet only). */
export async function fundWithFriendbot(publicKey: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Friendbot funding failed (${res.status}). ${body.slice(0, 140)}`);
  }
}

/** Build an unsigned XLM payment transaction and return it as base64 XDR. */
export async function buildPaymentXDR(params: {
  source: string;
  destination: string;
  amount: string;
  memo?: string;
}): Promise<string> {
  const account = await server.loadAccount(params.source);
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  }).addOperation(
    Operation.payment({
      destination: params.destination,
      asset: Asset.native(),
      amount: params.amount,
    }),
  );

  const memo = params.memo?.trim();
  if (memo) {
    // Stellar text memos are limited to 28 bytes.
    builder.addMemo(Memo.text(memo.slice(0, 28)));
  }

  return builder.setTimeout(180).build().toXDR();
}

export interface SubmitResult {
  hash: string;
}

/** Submit a signed transaction (base64 XDR) to Horizon testnet. */
export async function submitSignedXDR(signedXdr: string): Promise<SubmitResult> {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const res = await server.submitTransaction(tx);
  return { hash: res.hash };
}

/** Pull a human-readable reason out of a Horizon submission error, if present. */
export function describeHorizonError(e: unknown): string {
  const codes = (
    e as {
      response?: {
        data?: { extras?: { result_codes?: { operations?: string[]; transaction?: string } } };
      };
    }
  )?.response?.data?.extras?.result_codes;
  if (codes) {
    if (codes.operations?.length) return `Operation failed: ${codes.operations.join(', ')}`;
    if (codes.transaction) return `Transaction failed: ${codes.transaction}`;
  }
  if (e instanceof Error) return e.message;
  return 'Unknown error submitting transaction.';
}

export const explorerTxUrl = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const explorerAccountUrl = (pk: string) =>
  `https://stellar.expert/explorer/testnet/account/${pk}`;
