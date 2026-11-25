
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

// Role kurator dari smart contract
const CURATOR_ROLE = ethers.id("CURATOR_ROLE");

// Gateway IPFS
const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

// ==========================================
// 2. ELEMEN HTML
// ==========================================

const connectButton = document.getElementById("connectWallet");
const walletAddress = document.getElementById("walletAddress");
const networkStatus = document.getElementById("networkStatus");

const curatorMessage = document.getElementById("curatorMessage");

const totalPending = document.getElementById("totalPending");
const waitingReview = document.getElementById("waitingReview");
const curatorRole = document.getElementById("curatorRole");

const refreshButton = document.getElementById("refreshPending");
const pendingInfo = document.getElementById("pendingInfo");
const pendingGrid = document.getElementById("pendingGrid");

// ==========================================
// 3. VARIABEL BLOCKCHAIN
// ==========================================

let provider;
let signer;
let account;
let contract;

let isCurator = false;

// ==========================================
// 4. UTILITAS
// ==========================================

function showMessage(message, type = "success") {
  curatorMessage.textContent = message;
  curatorMessage.className = `message ${type}`;
}

function hideMessage() {
  curatorMessage.textContent = "";
  curatorMessage.className = "message hidden";
}

function shortAddress(address) {
  if (!address) return "-";

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function ipfsToHttp(uri) {
  if (!uri) return "";

  if (uri.startsWith("ipfs://")) {
    const cid = uri.replace("ipfs://", "");
    return `${IPFS_GATEWAY}${cid}`;
  }

  return uri;
}

async function checkNetwork() {
  if (!provider) {
    throw new Error("Hubungkan MetaMask terlebih dahulu.");
  }

  await checkWalletNetwork(provider);
}

// ==========================================
// 5. CUSTOM MODAL
// ==========================================

function showCuratorModal({
  eyebrow,
  title,
  description,
  confirmText,
  isReject = false
}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("curatorModal");
    const modalEyebrow = document.getElementById("modalEyebrow");
    const modalTitle = document.getElementById("modalTitle");
    const modalDescription = document.getElementById("modalDescription");
    const inputGroup = document.getElementById("modalInputGroup");
    const reasonInput = document.getElementById("rejectReasonInput");
    const inputError = document.getElementById("modalInputError");
    const cancelBtn = document.getElementById("modalCancelBtn");
    const confirmBtn = document.getElementById("modalConfirmBtn");

    modalEyebrow.textContent = eyebrow;
    modalTitle.textContent = title;
    modalDescription.textContent = description;
    confirmBtn.textContent = confirmText;

    // Reset input
    reasonInput.value = "";
    inputError.classList.add("hidden");

    if (isReject) {
      inputGroup.classList.remove("hidden");
      confirmBtn.className = "btn btn-danger";
    } else {
      inputGroup.classList.add("hidden");
      confirmBtn.className = "btn btn-primary";
    }

    modal.classList.remove("hidden");

    if (isReject) {
      reasonInput.focus();
    }

    const cleanup = () => {
      modal.classList.add("hidden");

      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);

      modal.removeEventListener("click", onBackdropClick);
      document.removeEventListener("keydown", onKeyDown);
    };

    const onConfirm = () => {
      if (isReject) {
        const reason = reasonInput.value.trim();

        if (!reason) {
          inputError.classList.remove("hidden");
          reasonInput.focus();
          return;
        }

        cleanup();

        resolve({
          confirmed: true,
          reason
        });

      } else {
        cleanup();

        resolve({
          confirmed: true
        });
      }
    };

    const onCancel = () => {
      cleanup();

      resolve({
        confirmed: false
      });
    };

    const onBackdropClick = (event) => {
      if (event.target === modal) {
        onCancel();
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);

    modal.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onKeyDown);
  });
}

// ==========================================
// 6. KONEKSI WALLET BERSAMA
// ==========================================

async function initializeWallet(request = false) {
  try {
    const wallet = await getWallet(request);

    // Belum ada akun yang terhubung
    if (!wallet) {
      provider = null;
      signer = null;
      account = null;
      contract = null;
      isCurator = false;

      walletAddress.textContent = "-";

      networkStatus.textContent = "Belum terhubung";
      networkStatus.classList.remove("connected");

      connectButton.textContent = "Hubungkan Wallet";

      curatorRole.textContent = "Belum terhubung";

      pendingInfo.textContent =
        "Hubungkan wallet dengan hak akses kurator.";

      pendingGrid.replaceChildren();

      totalPending.textContent = "0";
      waitingReview.textContent = "0";

      return false;
    }

    // Ambil provider, signer, dan account
    provider = wallet.provider;
    signer = wallet.signer;
    account = wallet.account;

    walletAddress.textContent = shortAddress(account);

    connectButton.textContent = "Wallet Terhubung";

    // Periksa jaringan blockchain
    await checkWalletNetwork(provider);

    // Hubungkan smart contract
    contract = getContract(signer);

    networkStatus.textContent =
      `${CHAIN_MODE === "sepolia" ? "Sepolia" : "Hardhat Local"} • Connected`;

    networkStatus.classList.add("connected");

    // Periksa hak akses kurator
    isCurator = await contract.hasRole(
      CURATOR_ROLE,
      account
    );

    curatorRole.textContent = isCurator
      ? "Aktif"
      : "Tidak Memiliki Akses";

    // Jika bukan kurator
    if (!isCurator) {
      showMessage(
        "Wallet terhubung, tetapi tidak memiliki hak akses kurator.",
        "error"
      );

      pendingInfo.textContent =
        "Akun ini tidak memiliki CURATOR_ROLE.";

      pendingGrid.replaceChildren();

      totalPending.textContent = "0";
      waitingReview.textContent = "0";

      return false;
    }

    // Wallet memiliki hak akses kurator
    hideMessage();

    if (request) {
      showMessage(
        "Wallet berhasil terhubung sebagai kurator.",
        "success"
      );
    }

    // Muat pengajuan pending
    await loadPendingArtworks();

    return true;

  } catch (error) {
    console.error("Wallet initialization error:", error);

    isCurator = false;
    contract = null;

    networkStatus.textContent = "Jaringan tidak sesuai";
    networkStatus.classList.remove("connected");

    curatorRole.textContent = "Belum diverifikasi";

    pendingGrid.replaceChildren();

    totalPending.textContent = "0";
    waitingReview.textContent = "0";

    pendingInfo.textContent =
      "Periksa koneksi wallet dan jaringan blockchain.";

    showMessage(
      error.shortMessage ||
      error.message ||
      "Gagal menghubungkan wallet.",
      "error"
    );

    return false;
  }
}

// Tombol Connect Wallet
if (connectButton) {
  connectButton.addEventListener("click", async () => {
    connectButton.disabled = true;

    try {
      await initializeWallet(true);
    } finally {
      connectButton.disabled = false;
    }
  });
}

// Listener perubahan akun dan jaringan
setupWalletListeners();


 // ==========================================
 // 7. MEMBACA METADATA IPFS MELALUI BACKEND
 // ==========================================

async function getArtworkMetadata(uri) {
  if (!uri) {
    throw new Error("Metadata URI kosong.");
  }

  const cid = uri
    .replace(/^ipfs:\/\//, "")
    .split("/")[0];

  if (!cid) {
    throw new Error("CID metadata tidak ditemukan.");
  }

  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL ||
    "http://127.0.0.1:8000";

  const response = await fetch(
    `${BACKEND_URL}/api/ipfs/metadata/${encodeURIComponent(cid)}`
  );

  if (!response.ok) {
    throw new Error(
      `Gagal mengambil metadata melalui backend: HTTP ${response.status}`
    );
  }

  const metadata = await response.json();

  console.log(
    `Metadata artwork ${cid} berhasil dimuat melalui backend.`
  );

  return metadata;
}


// ==========================================
// 8. MEMBUAT KARTU PENGAJUAN
// ==========================================

function createPendingCard(artwork, metadata) {
  const card = document.createElement("article");
  card.className = "artwork-card";

  // Gambar karya
  const image = document.createElement("img");

  image.className = "artwork-image";
  image.src = ipfsToHttp(metadata.image);
  image.alt = metadata.name || "Karya digital";
  image.loading = "lazy";

  image.onerror = () => {
    image.alt = "Gambar tidak dapat dimuat";
  };

  // Konten
  const content = document.createElement("div");
  content.className = "artwork-content";

  const category = document.createElement("span");
  category.className = "artwork-category";
  category.textContent = artwork.category;

  const title = document.createElement("h3");
  title.textContent =
    metadata.name || `Karya #${artwork.artworkId}`;

  const description = document.createElement("p");
  description.textContent =
    metadata.description || "Tidak ada deskripsi.";

  const creator = document.createElement("p");
  creator.className = "artwork-creator";

  creator.textContent =
    `Creator: ${metadata.creator || shortAddress(artwork.creator)}`;

  const artworkId = document.createElement("span");
  artworkId.className = "artwork-token";
  artworkId.textContent = `Artwork ID: ${artwork.artworkId}`;

  // Tombol aksi
  const actions = document.createElement("div");
  actions.className = "curator-actions";

  const approveButton = document.createElement("button");
  approveButton.className = "btn btn-primary";
  approveButton.textContent = "Setujui & Mint NFT";

  const rejectButton = document.createElement("button");
  rejectButton.className = "btn btn-wallet curator-reject";
  rejectButton.textContent = "Tolak Karya";

  approveButton.addEventListener("click", () => {
    approveArtwork(
      artwork.artworkId,
      approveButton,
      rejectButton
    );
  });

  rejectButton.addEventListener("click", () => {
    rejectArtwork(
      artwork.artworkId,
      approveButton,
      rejectButton
    );
  });

  actions.append(approveButton, rejectButton);

  content.append(
    category,
    title,
    description,
    creator,
    artworkId,
    actions
  );

  card.append(image, content);

  return card;
}


 // ==========================================
 // 9. MEMUAT PENGAJUAN PENDING
 // OPTIMASI: PARALLEL + BATCH + CACHE
 // ==========================================

async function loadPendingArtworks() {
  try {
    if (!contract || !isCurator) {
      pendingInfo.textContent =
        "Hubungkan wallet dengan hak akses kurator.";

      return;
    }

    await checkNetwork();

    hideMessage();

    pendingInfo.textContent = "Sedang memuat pengajuan...";
    pendingGrid.replaceChildren();

    const totalArtwork =
      Number(await contract.nextArtworkId()) - 1;

    if (totalArtwork <= 0) {
      totalPending.textContent = "0";
      waitingReview.textContent = "0";

      pendingInfo.textContent =
        "Belum ada pengajuan karya.";

      return;
    }

    let pendingCount = 0;
    let failedMetadataCount = 0;
    let failedReadCount = 0;

    // Maksimal 2 pengajuan diproses bersamaan
    const BATCH_SIZE = 2;

    for (
      let start = 1;
      start <= totalArtwork;
      start += BATCH_SIZE
    ) {
      const end = Math.min(
        start + BATCH_SIZE - 1,
        totalArtwork
      );

      pendingInfo.textContent =
        `Memeriksa pengajuan ${start}–${end} dari ${totalArtwork}...`;

      // 1. Membaca data blockchain secara bersamaan
      const blockchainResults = await Promise.all(
        Array.from(
          { length: end - start + 1 },
          (_, index) => start + index
        ).map(async (i) => {
          try {
            const data = await contract.getArtwork(i);

            return {
              artwork: {
                artworkId: i,
                creator: data.creator,
                category: data.category,
                metadataURI: data.metadataURI,
                status: Number(data.status),
                tokenId: Number(data.tokenId)
              }
            };

          } catch (error) {
            console.error(
              `Gagal membaca artwork #${i}:`,
              error
            );

            return {
              readError: true,
              artworkId: i
            };
          }
        })
      );

      // 2. Ambil hanya karya berstatus Pending
      const pendingArtworks = blockchainResults
        .filter(result => result.artwork)
        .map(result => result.artwork)
        .filter(artwork => artwork.status === 0);

      failedReadCount += blockchainResults
        .filter(result => result.readError).length;

      // Hitung total pengajuan
      pendingCount += pendingArtworks.length;

      // 3. Ambil metadata beberapa karya secara bersamaan
      const metadataResults = await Promise.all(
        pendingArtworks.map(async (artwork) => {
          try {
            const metadata = await getArtworkMetadata(
              artwork.metadataURI
            );

            return {
              artwork,
              metadata
            };

          } catch (error) {
            console.error(
              `Metadata artwork #${artwork.artworkId} gagal:`,
              error
            );

            return {
              artwork,
              metadataError: true
            };
          }
        })
      );

      // 4. Buat kartu sesuai urutan pengajuan
      for (const result of metadataResults) {
        let card;

        if (result.metadataError) {
          failedMetadataCount++;

          // Metadata gagal, tetapi pengajuan tetap ditampilkan
          card = document.createElement("article");
          card.className = "artwork-card";

          const content = document.createElement("div");
          content.className = "artwork-content";

          const title = document.createElement("h3");
          title.textContent =
            `Pengajuan #${result.artwork.artworkId}`;

          const warning = document.createElement("p");
          warning.textContent =
            "Metadata IPFS tidak dapat diakses. Pengajuan tetap tercatat di blockchain.";

          const creator = document.createElement("p");
          creator.className = "artwork-creator";
          creator.textContent =
            `Creator: ${shortAddress(result.artwork.creator)}`;

          const artworkId = document.createElement("span");
          artworkId.className = "artwork-token";
          artworkId.textContent =
            `Artwork ID: ${result.artwork.artworkId}`;

          content.append(
            title,
            warning,
            creator,
            artworkId
          );

          card.append(content);

        } else {
          card = createPendingCard(
            result.artwork,
            result.metadata
          );
        }

        pendingGrid.appendChild(card);

        
      }

      // Beri jeda 500 ms sebelum batch berikutnya
        if (end < totalArtwork) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }  
    }

    // 5. Perbarui statistik dashboard
    totalPending.textContent = String(pendingCount);
    waitingReview.textContent = String(pendingCount);

    if (pendingCount === 0 && failedReadCount === 0) {
      pendingInfo.textContent =
        "Tidak ada pengajuan yang menunggu review.";

      return;
    }

    let message =
      `${pendingCount} pengajuan menunggu keputusan kurator.`;

    if (failedMetadataCount > 0) {
      message +=
        ` ${failedMetadataCount} metadata gagal dimuat.`;
    }

    if (failedReadCount > 0) {
      message +=
        ` ${failedReadCount} data blockchain gagal dibaca.`;
    }

    pendingInfo.textContent = message;

  } catch (error) {
    console.error("Load pending error:", error);

    pendingInfo.textContent =
      error.shortMessage ||
      error.message ||
      "Gagal memuat pengajuan.";
  }
}


// ==========================================
// 10. MENYETUJUI DAN MINT NFT
// ==========================================

async function approveArtwork(
  artworkId,
  approveButton,
  rejectButton
) {
  try {
    await checkNetwork();

    if (!isCurator) {
      throw new Error(
        "Wallet tidak memiliki hak akses kurator."
      );
    }

    const { confirmed } = await showCuratorModal({
      eyebrow: "APPROVE & MINT NFT",
      title: `Setujui Karya #${artworkId}?`,
      description:
        "Karya yang disetujui akan langsung dicetak (mint) menjadi token NFT ke wallet Creator melalui smart contract.",
      confirmText: "Ya, Setujui & Mint",
      isReject: false
    });

    if (!confirmed) return;

    approveButton.disabled = true;
    rejectButton.disabled = true;

    approveButton.textContent = "Menunggu MetaMask...";

    const transaction = await contract.approveAndMint(
      artworkId
    );

    approveButton.textContent = "Memproses transaksi...";

    const receipt = await transaction.wait();

    if (receipt.status !== 1) {
      throw new Error("Transaksi persetujuan gagal.");
    }

    showMessage(
      `Karya #${artworkId} berhasil disetujui dan di-mint sebagai NFT. Gas Used: ${receipt.gasUsed.toString()}`,
      "success"
    );

    await loadPendingArtworks();

  } catch (error) {
    console.error("Approve error:", error);

    let message =
      error.shortMessage ||
      error.reason ||
      error.message ||
      "Gagal menyetujui karya.";

    if (error.code === 4001) {
      message = "Transaksi dibatalkan melalui MetaMask.";
    }

    showMessage(message, "error");

    approveButton.disabled = false;
    rejectButton.disabled = false;

    approveButton.textContent = "Setujui & Mint NFT";
  }
}

// ==========================================
// 11. MENOLAK KARYA
// ==========================================

async function rejectArtwork(
  artworkId,
  approveButton,
  rejectButton
) {
  try {
    await checkNetwork();

    if (!isCurator) {
      throw new Error(
        "Wallet tidak memiliki hak akses kurator."
      );
    }

    const { confirmed, reason } = await showCuratorModal({
      eyebrow: "REJECT SUBMISSION",
      title: `Tolak Karya #${artworkId}?`,
      description:
        "Berikan alasan penolakan yang jelas agar Creator dapat mengetahui penyebab karya tidak disetujui.",
      confirmText: "Tolak Karya",
      isReject: true
    });

    if (!confirmed) return;

    approveButton.disabled = true;
    rejectButton.disabled = true;

    rejectButton.textContent = "Menunggu MetaMask...";

    const transaction = await contract.rejectArtwork(
      artworkId,
      reason
    );

    rejectButton.textContent = "Memproses transaksi...";

    const receipt = await transaction.wait();

    if (receipt.status !== 1) {
      throw new Error("Transaksi penolakan gagal.");
    }

    showMessage(
      `Pengajuan karya #${artworkId} berhasil ditolak. Gas Used: ${receipt.gasUsed.toString()}`,
      "success"
    );

    await loadPendingArtworks();

  } catch (error) {
    console.error("Reject error:", error);

    let message =
      error.shortMessage ||
      error.reason ||
      error.message ||
      "Gagal menolak karya.";

    if (error.code === 4001) {
      message = "Transaksi dibatalkan melalui MetaMask.";
    }

    showMessage(message, "error");

    approveButton.disabled = false;
    rejectButton.disabled = false;

    rejectButton.textContent = "Tolak Karya";
  }
}

// ==========================================
// 12. REFRESH PENGAJUAN
// ==========================================

if (refreshButton) {
  refreshButton.addEventListener("click", () => {
    loadPendingArtworks();
  });
}

// ==========================================
// 13. AUTO CONNECT WALLET
// ==========================================

initializeWallet(false);
