
import { ethers } from "ethers";

import {
  CHAIN_MODE,
  getWallet,
  checkNetwork as checkWalletNetwork,
  getContract,
  setupWalletListeners
} from "./wallet.js";


// ==========================================
// 1. KONFIGURASI
// ==========================================

const API_URL = "http://127.0.0.1:8000/api";

const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

const CREATOR_ROLE = ethers.id("CREATOR_ROLE");

const SESSION_TOKEN_KEY = "galeri_admin_token";
const SESSION_WALLET_KEY = "galeri_admin_wallet";


// ==========================================
// 2. ELEMEN HTML
// ==========================================

const connectButton = document.getElementById("connectWallet");
const walletAddress = document.getElementById("walletAddress");
const networkStatus = document.getElementById("networkStatus");

const adminAddress = document.getElementById("adminAddress");
const adminRole = document.getElementById("adminRole");

const adminMessage = document.getElementById("adminMessage");

const totalCreators = document.getElementById("totalCreators");
const pendingCreators = document.getElementById("pendingCreators");
const approvedCreators = document.getElementById("approvedCreators");
const rejectedCreators = document.getElementById("rejectedCreators");

const refreshButton = document.getElementById("refreshCreators");
const creatorInfo = document.getElementById("creatorInfo");
const creatorGrid = document.getElementById("creatorGrid");

const filterButtons = document.querySelectorAll(".admin-filter-btn");


// ==========================================
// 3. VARIABEL
// ==========================================

let provider = null;
let signer = null;
let account = null;
let contract = null;

let isAdmin = false;

let adminToken = null;
let adminSessionWallet = null;

let creators = [];
let activeFilter = "pending";


// ==========================================
// 4. UTILITAS
// ==========================================

function showMessage(message, type = "success") {

  adminMessage.textContent = message;
  adminMessage.className = `message ${type}`;
}


function hideMessage() {

  adminMessage.textContent = "";
  adminMessage.className = "message hidden";
}


function shortAddress(address) {

  if (!address) return "-";

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}


function escapeHTML(value) {

  return String(value ?? "").replace(/[&<>"']/g, (character) => {

    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}


function formatDate(value) {

  if (!value) return "-";

  const date = new Date(
    value.replace(" ", "T")
  );

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}


async function checkNetwork() {

  if (!provider) {
    throw new Error("Hubungkan MetaMask terlebih dahulu.");
  }

  await checkWalletNetwork(provider);
}


function clearAdminSession() {

  adminToken = null;
  adminSessionWallet = null;

  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_WALLET_KEY);
}


function restoreAdminSession() {

  const savedToken = sessionStorage.getItem(
    SESSION_TOKEN_KEY
  );

  const savedWallet = sessionStorage.getItem(
    SESSION_WALLET_KEY
  );

  if (
    !savedToken ||
    !savedWallet ||
    !account ||
    savedWallet !== account.toLowerCase()
  ) {

    clearAdminSession();

    return false;
  }

  adminToken = savedToken;
  adminSessionWallet = savedWallet;

  return true;
}


// ==========================================
// 5. API REQUEST
// ==========================================

async function apiRequest(url, options = {}) {

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  // Endpoint admin menggunakan token sesi.
  if (adminToken && url.includes("/admin/")) {

    headers.Authorization = `Bearer ${adminToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  let result;

  try {

    result = await response.json();

  } catch {

    throw new Error("Respons backend tidak valid.");
  }

  if (!response.ok) {

    if (
      response.status === 401 &&
      url.includes("/admin/")
    ) {

      clearAdminSession();
    }

    throw new Error(
      result.detail ||
      result.message ||
      "Permintaan ke backend gagal."
    );
  }

  return result;
}


// ==========================================
// 6. LOGIN ADMIN
// ==========================================

async function loginAdminSession() {

  if (!signer || !account || !isAdmin) {

    throw new Error(
      "Wallet bukan administrator."
    );
  }

  // Meminta nonce login
  const nonceResult = await apiRequest(
    `${API_URL}/admin/session/nonce?wallet_address=${encodeURIComponent(account)}`
  );

  // Signature satu kali untuk login.
  const signature = await signer.signMessage(
    nonceResult.message
  );

  // Verifikasi signature di backend.
  const loginResult = await apiRequest(
    `${API_URL}/admin/session/login`,
    {
      method: "POST",

      body: JSON.stringify({
        wallet_address: account,
        nonce: nonceResult.nonce,
        signature
      })
    }
  );

  adminToken = loginResult.token;

  adminSessionWallet = account.toLowerCase();

  sessionStorage.setItem(
    SESSION_TOKEN_KEY,
    adminToken
  );

  sessionStorage.setItem(
    SESSION_WALLET_KEY,
    adminSessionWallet
  );

  return true;
}


// ==========================================
// 7. KONEKSI WALLET
// ==========================================

async function initializeWallet(request = false) {

  try {

    const wallet = await getWallet(request);

    if (!wallet) {

      provider = null;
      signer = null;
      account = null;
      contract = null;

      isAdmin = false;

      clearAdminSession();

      walletAddress.textContent = "-";

      adminAddress.textContent = "Belum terhubung";

      adminRole.textContent = "Belum diverifikasi";

      networkStatus.textContent = "Belum terhubung";

      networkStatus.classList.remove("connected");

      connectButton.textContent = "Hubungkan Wallet";

      creatorGrid.replaceChildren();

      creatorInfo.textContent =
        "Hubungkan wallet administrator untuk melihat pendaftaran.";

      resetStatistics();

      return false;
    }

    provider = wallet.provider;
    signer = wallet.signer;
    account = wallet.account;

    walletAddress.textContent = shortAddress(account);

    adminAddress.textContent = account;

    connectButton.textContent = "Wallet Terhubung";

    await checkWalletNetwork(provider);

    contract = getContract(signer);

    networkStatus.textContent =
      `${CHAIN_MODE === "sepolia" ? "Sepolia" : "Hardhat Local"} • Connected`;

    networkStatus.classList.add("connected");

    // Pemeriksaan role langsung dari smart contract.
    isAdmin = await contract.hasRole(
      DEFAULT_ADMIN_ROLE,
      account
    );

    adminRole.textContent = isAdmin
      ? "Administrator Aktif"
      : "Tidak Memiliki Akses";

    if (!isAdmin) {

      clearAdminSession();

      creatorGrid.replaceChildren();

      creatorInfo.textContent =
        "Wallet ini tidak memiliki DEFAULT_ADMIN_ROLE.";

      resetStatistics();

      showMessage(
        "Wallet terhubung, tetapi bukan administrator smart contract.",
        "error"
      );

      return false;
    }

    hideMessage();

    // Jika tombol ditekan:
    // Login baru hanya dilakukan jika sesi belum tersedia.
    if (request) {

      const sessionRestored = restoreAdminSession();

      if (!sessionRestored) {

        await loginAdminSession();

        showMessage(
          "Login administrator berhasil.",
          "success"
        );

      } else {

        showMessage(
          "Sesi administrator masih aktif.",
          "success"
        );
      }

    } else {

      // Auto-connect saat halaman dibuka.
      const sessionRestored = restoreAdminSession();

      if (!sessionRestored) {

        creatorGrid.replaceChildren();

        creatorInfo.textContent =
          "Wallet terhubung. Klik Hubungkan Wallet untuk login administrator.";

        resetStatistics();

        return true;
      }
    }

    await loadCreators();

    return true;

  } catch (error) {

    console.error("Admin wallet error:", error);

    provider = null;
    signer = null;
    account = null;
    contract = null;

    isAdmin = false;

    clearAdminSession();

    adminRole.textContent = "Belum diverifikasi";

    networkStatus.textContent = "Jaringan tidak sesuai";

    networkStatus.classList.remove("connected");

    creatorGrid.replaceChildren();

    creatorInfo.textContent =
      "Periksa koneksi MetaMask dan jaringan blockchain.";

    resetStatistics();

    let message =
      error.shortMessage ||
      error.message ||
      "Gagal menghubungkan wallet administrator.";

    if (error.code === 4001) {

      message = "Login dibatalkan melalui MetaMask.";
    }

    showMessage(message, "error");

    return false;
  }
}


// Tombol koneksi wallet
connectButton.addEventListener("click", async () => {

  connectButton.disabled = true;

  try {

    await initializeWallet(true);

  } finally {

    connectButton.disabled = false;
  }
});


// ==========================================
// 8. STATISTIK
// ==========================================

function resetStatistics() {

  totalCreators.textContent = "0";
  pendingCreators.textContent = "0";
  approvedCreators.textContent = "0";
  rejectedCreators.textContent = "0";
}


function updateStatistics() {

  totalCreators.textContent = creators.length;

  pendingCreators.textContent = creators.filter(
    item => item.status === "pending"
  ).length;

  approvedCreators.textContent = creators.filter(
    item => item.status === "approved"
  ).length;

  rejectedCreators.textContent = creators.filter(
    item => item.status === "rejected"
  ).length;
}


// ==========================================
// 9. MEMUAT DATA PENDAFTAR
// ==========================================

async function loadCreators() {

  try {

    if (
      !isAdmin ||
      !signer ||
      !adminToken
    ) {

      throw new Error(
        "Silakan login sebagai administrator terlebih dahulu."
      );
    }

    await checkNetwork();

    creatorInfo.textContent = "Memuat data pendaftar...";

    creatorGrid.replaceChildren();

    // Tidak ada Signature di sini.
    // Backend memeriksa token sesi.
    const result = await apiRequest(
      `${API_URL}/admin/creators`
    );

    creators = result.creators || [];

    updateStatistics();

    renderCreators();

  } catch (error) {

    console.error("Load creators error:", error);

    creatorInfo.textContent =
      error.message || "Gagal memuat data pendaftar.";

    showMessage(
      error.message || "Gagal memuat data pendaftar.",
      "error"
    );
  }
}


// ==========================================
// 10. MENAMPILKAN KARTU PENDAFTAR
// ==========================================

function createCreatorCard(creator) {

  const card = document.createElement("article");

  card.className = "admin-creator-card";

  const initials = String(creator.full_name || "K")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join("");

  const status = creator.status || "pending";

  card.innerHTML = `
    <div class="admin-card-top">

      <div class="creator-avatar">
        ${escapeHTML(initials)}
      </div>

      <span class="admin-status ${escapeHTML(status)}">
        ${escapeHTML(status)}
      </span>

    </div>

    <div class="admin-card-content">

      <h3>${escapeHTML(creator.full_name)}</h3>

      <p class="admin-username">
        @${escapeHTML(creator.username)}
      </p>

      <div class="admin-detail-row">
        <span>Email</span>
        <strong>${escapeHTML(creator.email)}</strong>
      </div>

      <div class="admin-detail-row">
        <span>Wallet</span>
        <strong>
          ${escapeHTML(shortAddress(creator.wallet_address))}
        </strong>
      </div>

      <div class="admin-detail-row">
        <span>Tanggal daftar</span>
        <strong>
          ${escapeHTML(formatDate(creator.created_at))}
        </strong>
      </div>

      <div class="admin-description">
        ${escapeHTML(
          creator.description ||
          "Tidak ada deskripsi profil."
        )}
      </div>

    </div>

    <div class="admin-card-actions"></div>
  `;

  const actions = card.querySelector(
    ".admin-card-actions"
  );

  if (status === "pending") {

    const approveButton = document.createElement("button");

    approveButton.className = "btn btn-primary";

    approveButton.textContent = "Setujui Kreator";

    const rejectButton = document.createElement("button");

    rejectButton.className = "btn btn-wallet admin-reject";

    rejectButton.textContent = "Tolak Pendaftaran";

    approveButton.addEventListener("click", () => {

      approveCreator(
        creator,
        approveButton,
        rejectButton
      );
    });

    rejectButton.addEventListener("click", () => {

      rejectCreator(
        creator,
        approveButton,
        rejectButton
      );
    });

    actions.append(
      approveButton,
      rejectButton
    );

  } else {

    const statusText = document.createElement("p");

    statusText.className = "admin-completed-text";

    statusText.textContent =
      status === "approved"
        ? "Kreator telah memperoleh akses."
        : "Pendaftaran telah ditolak.";

    actions.append(statusText);
  }

  return card;
}


// ==========================================
// 11. RENDER DAFTAR
// ==========================================

function renderCreators() {

  creatorGrid.replaceChildren();

  const filtered = activeFilter === "all"
    ? creators
    : creators.filter(
        item => item.status === activeFilter
      );

  if (filtered.length === 0) {

    creatorInfo.textContent =
      activeFilter === "pending"
        ? "Tidak ada pendaftaran kreator yang menunggu persetujuan."
        : "Tidak ada data untuk kategori ini.";

    return;
  }

  creatorInfo.textContent =
    `${filtered.length} data kreator ditemukan.`;

  filtered.forEach(creator => {

    creatorGrid.appendChild(
      createCreatorCard(creator)
    );
  });
}


// ==========================================
// 12. FILTER
// ==========================================

filterButtons.forEach(button => {

  button.addEventListener("click", () => {

    filterButtons.forEach(item => {

      item.classList.remove("active");
    });

    button.classList.add("active");

    activeFilter = button.dataset.filter;

    renderCreators();
  });
});


// ==========================================
// 13. MENYETUJUI KREATOR
// ==========================================

async function approveCreator(
  creator,
  approveButton,
  rejectButton
) {

  try {

    if (
      !isAdmin ||
      !contract ||
      !adminToken
    ) {

      throw new Error(
        "Wallet tidak memiliki hak administrator atau sesi berakhir."
      );
    }

    await checkNetwork();

    const confirmed = window.confirm(
      `Setujui pendaftaran ${creator.full_name}?\n\n` +
      `Wallet: ${creator.wallet_address}\n\n` +
      "MetaMask akan meminta konfirmasi transaksi blockchain."
    );

    if (!confirmed) return;

    approveButton.disabled = true;
    rejectButton.disabled = true;

    approveButton.textContent = "Memeriksa role...";

    // Memeriksa role kreator.
    const alreadyHasRole = await contract.hasRole(
      CREATOR_ROLE,
      creator.wallet_address
    );

    if (alreadyHasRole) {

      throw new Error(
        "Wallet ini sudah memiliki CREATOR_ROLE. Periksa status database dan transaksi sebelumnya."
      );
    }

    approveButton.textContent = "Menunggu MetaMask...";

    // Transaksi blockchain.
    const transaction = await contract.grantRole(
      CREATOR_ROLE,
      creator.wallet_address
    );

    approveButton.textContent = "Menunggu konfirmasi...";

    const receipt = await transaction.wait();

    if (!receipt || receipt.status !== 1) {

      throw new Error(
        "Transaksi pemberian role gagal."
      );
    }

    const transactionHash = receipt.hash;

    // Verifikasi ulang role.
    const roleGranted = await contract.hasRole(
      CREATOR_ROLE,
      creator.wallet_address
    );

    if (!roleGranted) {

      throw new Error(
        "Transaksi berhasil, tetapi CREATOR_ROLE belum terdeteksi."
      );
    }

    // Update status backend menggunakan token sesi.
    await apiRequest(
      `${API_URL}/admin/creators/${creator.id}/approve`,
      {
        method: "POST",

        body: JSON.stringify({
          wallet_address: creator.wallet_address,
          transaction_hash: transactionHash
        })
      }
    );

    showMessage(
      `Pendaftaran ${creator.full_name} berhasil disetujui dan CREATOR_ROLE telah diberikan.`,
      "success"
    );

    await loadCreators();

  } catch (error) {

    console.error("Approve creator error:", error);

    let message =
      error.shortMessage ||
      error.reason ||
      error.message ||
      "Gagal menyetujui kreator.";

    if (error.code === 4001) {

      message = "Transaksi dibatalkan melalui MetaMask.";
    }

    showMessage(message, "error");

    approveButton.disabled = false;
    rejectButton.disabled = false;

    approveButton.textContent = "Setujui Kreator";
  }
}


// ==========================================
// 14. MENOLAK PENDAFTARAN
// ==========================================

async function rejectCreator(
  creator,
  approveButton,
  rejectButton
) {

  try {

    if (!isAdmin || !adminToken) {

      throw new Error(
        "Sesi administrator tidak ditemukan."
      );
    }

    await checkNetwork();

    const reason = window.prompt(
      `Alasan penolakan pendaftaran ${creator.full_name}:`
    );

    if (reason === null) return;

    const cleanReason = reason.trim();

    if (cleanReason.length < 3) {

      throw new Error(
        "Alasan penolakan minimal 3 karakter."
      );
    }

    const confirmed = window.confirm(
      `Yakin menolak pendaftaran ${creator.full_name}?\n\n` +
      `Alasan: ${cleanReason}`
    );

    if (!confirmed) return;

    approveButton.disabled = true;
    rejectButton.disabled = true;

    rejectButton.textContent = "Memproses...";

    // Tidak meminta Signature lagi.
    await apiRequest(
      `${API_URL}/admin/creators/${creator.id}/reject`,
      {
        method: "POST",

        body: JSON.stringify({
          wallet_address: creator.wallet_address,
          reason: cleanReason
        })
      }
    );

    showMessage(
      `Pendaftaran ${creator.full_name} berhasil ditolak.`,
      "success"
    );

    await loadCreators();

  } catch (error) {

    console.error("Reject creator error:", error);

    showMessage(
      error.message || "Gagal menolak kreator.",
      "error"
    );

    approveButton.disabled = false;
    rejectButton.disabled = false;

    rejectButton.textContent = "Tolak Pendaftaran";
  }
}


// ==========================================
// 15. REFRESH
// ==========================================

refreshButton.addEventListener("click", async () => {

  refreshButton.disabled = true;

  refreshButton.textContent = "Memuat...";

  try {

    await loadCreators();

  } finally {

    refreshButton.disabled = false;

    refreshButton.textContent = "↻ Refresh";
  }
});


// ==========================================
// 16. AUTO CONNECT
// ==========================================

setupWalletListeners();

initializeWallet(false);
