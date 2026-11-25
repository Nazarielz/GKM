import { ethers } from "ethers";
import contractArtifact from "./abi/GaleriKarya.json";

// ========================================
// KONFIGURASI WALLET BERSAMA
// ========================================

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS;

export const CHAIN_MODE =
  import.meta.env.VITE_CHAIN_MODE || "localhost";

export const CHAIN_ID = BigInt(
  CHAIN_MODE === "sepolia"
    ? import.meta.env.VITE_SEPOLIA_CHAIN_ID || "11155111"
    : import.meta.env.VITE_LOCAL_CHAIN_ID || "31337"
);

export const CONTRACT_ABI = contractArtifact.abi;

// ========================================
// PROVIDER
// ========================================

let provider = null;

export function getProvider() {
  if (!window.ethereum) {
    throw new Error("MetaMask tidak ditemukan.");
  }

  if (!provider) {
    provider = new ethers.BrowserProvider(window.ethereum);
  }

  return provider;
}

// ========================================
// VALIDASI KONFIGURASI
// ========================================

export function validateConfig() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("VITE_CONTRACT_ADDRESS belum dikonfigurasi.");
  }

  if (!ethers.isAddress(CONTRACT_ADDRESS)) {
    throw new Error("Alamat smart contract tidak valid.");
  }
}

// ========================================
// MENGAMBIL WALLET
// ========================================

export async function getWallet(request = false) {
  const currentProvider = getProvider();

  const accounts = await currentProvider.send(
    request ? "eth_requestAccounts" : "eth_accounts",
    []
  );

  if (!accounts || accounts.length === 0) {
    return null;
  }

  const signer = await currentProvider.getSigner(accounts[0]);
  const account = await signer.getAddress();

  return {
    provider: currentProvider,
    signer,
    account
  };
}

// ========================================
// VALIDASI NETWORK
// ========================================

export async function checkNetwork(currentProvider = getProvider()) {
  const network = await currentProvider.getNetwork();

  if (network.chainId !== CHAIN_ID) {
    throw new Error(
      `Jaringan MetaMask salah. Gunakan ${
        CHAIN_MODE === "sepolia"
          ? "Sepolia"
          : "Hardhat Local"
      } dengan Chain ID ${CHAIN_ID}.`
    );
  }

  return network;
}

// ========================================
// MEMBUAT SMART CONTRACT
// ========================================

export function getContract(connection) {
  validateConfig();

  return new ethers.Contract(
    CONTRACT_ADDRESS,
    CONTRACT_ABI,
    connection
  );
}

// ========================================
// EVENT METAMASK
// ========================================

export function setupWalletListeners() {
  if (!window.ethereum) return;

  window.ethereum.on("accountsChanged", () => {
    window.location.reload();
  });

  window.ethereum.on("chainChanged", () => {
    window.location.reload();
  });
}