/**
 * Thin wrapper around @stellar/freighter-api (v6) that normalises its
 * `{ value, error }` responses into plain values / thrown errors.
 */
import {
  isConnected,
  isAllowed,
  requestAccess,
  getAddress,
  getNetworkDetails,
  signTransaction,
} from '@stellar/freighter-api';
import { NETWORK_PASSPHRASE } from './stellar';

/** True when the Freighter extension is installed and reachable. */
export async function isFreighterInstalled(): Promise<boolean> {
  try {
    const r = await isConnected();
    return !!r.isConnected;
  } catch {
    return false;
  }
}

/** Prompt the user to grant this dApp access; returns the chosen public key. */
export async function connectWallet(): Promise<string> {
  const r = await requestAccess();
  if (r.error) throw new Error(r.error.message ?? 'Freighter access was denied.');
  if (!r.address) throw new Error('No account returned from Freighter.');
  return r.address;
}

/** Returns the already-authorised address, or null if the dApp is not yet allowed. */
export async function getConnectedAddress(): Promise<string | null> {
  try {
    const allowed = await isAllowed();
    if (!allowed.isAllowed) return null;
    const r = await getAddress();
    if (r.error || !r.address) return null;
    return r.address;
  } catch {
    return null;
  }
}

export interface NetworkInfo {
  network: string;
  passphrase: string;
  isTestnet: boolean;
}

/** Report which network Freighter is currently pointed at. */
export async function getWalletNetwork(): Promise<NetworkInfo | null> {
  try {
    const r = await getNetworkDetails();
    if (r.error) return null;
    return {
      network: r.network,
      passphrase: r.networkPassphrase,
      isTestnet: r.networkPassphrase === NETWORK_PASSPHRASE,
    };
  } catch {
    return null;
  }
}

/** Sign a base64 XDR transaction with Freighter on the testnet. */
export async function signWithFreighter(xdr: string, address: string): Promise<string> {
  const r = await signTransaction(xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address,
  });
  if (r.error) throw new Error(r.error.message ?? 'Transaction signing failed.');
  return r.signedTxXdr;
}
