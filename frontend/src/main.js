
import { ethers } from "ethers";

import {
  CHAIN_MODE,
  getWallet,
  checkNetwork,
  getContract,
  setupWalletListeners
} from "./wallet.js";

// ========================================
// 1. ELEMEN HTML
// ========================================

const connectButton = document.getElementById("connectWallet");
const walletAddress = document.getElementById("walletAddress");
const networkStatus = document.getElementById("networkStatus");

const galleryGrid = document.getElementById("galleryGrid");
const galleryInfo = document.getElementById("galleryInfo");
const refreshGalleryButton = document.getElementById("refreshGallery");

// ========================================
// 2. VARIABEL
// ========================================

let provider;
let contract;
let account;

let creatorRegistration = null;

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

// ========================================
// 3. UTILITAS
// ========================================

function showInfo(message) {
  if (galleryInfo) {
    galleryInfo.textContent = message;
  }
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function ipfsToHttp(uri) {
  if (!uri) return "";

  if (uri.startsWith("ipfs://")) {
    return `https://gateway.pinata.cloud/ipfs/${uri.replace(
      "ipfs://",
      ""
    )}`;
  }

  return uri;
}

// ========================================
// 3A. PEMERIKSAAN STATUS CREATOR
// ========================================

async function checkCreatorRegistration(address) {
  const response = await fetch(
    `${BACKEND_URL}/api/creators/registration-status?wallet_address=${encodeURIComponent(address)}`
  );

  if (!response.ok) {
    throw new Error(
      "Gagal memeriksa status pendaftaran Creator."
    );
  }

  creatorRegistration = await response.json();

  return creatorRegistration;
}

// Memeriksa apakah wallet sudah disetujui
function isApprovedCreator() {
  return (
    creatorRegistration?.registered === true &&
    creatorRegistration?.registration?.status?.toLowerCase() === "approved"
  );
}

// Mengarahkan pengguna ke halaman pendaftaran
function redirectToRegister() {
  window.location.href = "/register.html";
}

// ========================================
// 4. UI WALLET
// ========================================

function updateWalletUI(address) {
  if (walletAddress) {
    walletAddress.textContent = address
      ? shortAddress(address)
      : "";
  }

  if (connectButton) {
    if (!address) {
      connectButton.textContent = "Hubungkan Wallet";
    } else if (isApprovedCreator()) {
      connectButton.textContent = shortAddress(address);
    } else {
      connectButton.textContent = "Hubungkan Wallet";
    }
  }

  if (networkStatus) {
    networkStatus.textContent = address
      ? `${CHAIN_MODE === "sepolia" ? "Sepolia" : "Hardhat Local"} • Connected`
      : "Belum terhubung";

    networkStatus.classList.toggle(
      "connected",
      Boolean(address)
    );
  }
}

// ========================================
// 5. INISIALISASI WALLET
// ========================================

async function initializeWallet(request = false) {
  try {
    const wallet = await getWallet(request);

    if (!wallet) {
      account = null;
      provider = null;
      contract = null;
      creatorRegistration = null;

      updateWalletUI(null);

      showInfo(
        "Hubungkan wallet untuk melihat koleksi karya."
      );

      return false;
    }

    provider = wallet.provider;
    account = wallet.account;

    // Memastikan jaringan blockchain sesuai
    await checkNetwork(provider);

    // Mengambil smart contract
    contract = getContract(provider);

    // Memeriksa status pendaftaran Creator
    await checkCreatorRegistration(account);

    // Memperbarui tampilan wallet
    updateWalletUI(account);

    showInfo(
      "Wallet terhubung. Memuat koleksi karya..."
    );

    // Memuat Explore Gallery
    await loadGallery();

    return true;

  } catch (error) {
    console.error(
      "Wallet initialization error:",
      error
    );

    updateWalletUI(account);

    showInfo(
      error.shortMessage ||
      error.message ||
      "Gagal menghubungkan wallet."
    );

    return false;
  }
}

// ========================================
// 5A. TOMBOL WALLET DAN REGISTER CREATOR
// ========================================

if (connectButton) {
  connectButton.addEventListener("click", async () => {
    connectButton.disabled = true;

    try {

      // ==================================
      // KONDISI 1:
      // WALLET SUDAH TERHUBUNG
      // ==================================

      if (account) {

        // Periksa status pendaftaran terbaru
        await checkCreatorRegistration(account);

        updateWalletUI(account);

        // Jika belum approved, arahkan ke register
        if (!isApprovedCreator()) {
          redirectToRegister();
          return;
        }

        // Jika sudah approved, tidak perlu diarahkan
        return;
      }

      // ==================================
      // KONDISI 2:
      // WALLET BELUM TERHUBUNG
      // ==================================

      const connected = await initializeWallet(true);

      if (!connected) {
        return;
      }

      // ==================================
      // KONDISI 3:
      // PEMERIKSAAN STATUS CREATOR
      // ==================================

      if (!isApprovedCreator()) {
        redirectToRegister();
        return;
      }

    } catch (error) {
      console.error(
        "Registration check error:",
        error
      );

      showInfo(
        error.message ||
        "Gagal memeriksa status pendaftaran."
      );

    } finally {
      connectButton.disabled = false;
    }
  });
}

// ========================================
// 6. EVENT WALLET
// ========================================

setupWalletListeners();

// ========================================
// 7. MEMBACA METADATA IPFS
// ========================================

async function getArtworkMetadata(uri) {
  if (!uri) {
    throw new Error("Metadata URI kosong.");
  }

  const cid = uri
    .replace(/^ipfs:\/\/\/?/, "")
    .split("/")[0];

  const response = await fetch(
    `${BACKEND_URL}/api/ipfs/metadata/${encodeURIComponent(cid)}`
  );

  if (!response.ok) {
    throw new Error(
      `Gagal mengambil metadata dari backend: HTTP ${response.status}`
    );
  }

  const metadata = await response.json();

  console.log(
    "Metadata Explore berhasil dimuat:",
    metadata
  );

  return metadata;
}

// ========================================
// 8. MEMBUAT KARTU KARYA
// ========================================

function createArtworkCard(artwork, metadata) {
  const card = document.createElement("article");

  card.className = "artwork-card";
  card.tabIndex = 0;

  card.setAttribute("role", "link");

  card.setAttribute(
    "aria-label",
    `Lihat detail ${
      metadata.name || `Karya #${artwork.tokenId}`
    }`
  );

  const openDetail = () => {
    window.location.href =
      `/artwork-detail.html?id=${artwork.artworkId}`;
  };

  card.addEventListener("click", openDetail);

  card.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      openDetail();
    }
  });

  // Gambar karya
  const image = document.createElement("img");

  image.className = "artwork-image";
  image.src = ipfsToHttp(metadata.image);
  image.alt = metadata.name || "Karya digital";
  image.loading = "lazy";

  image.onerror = () => {
    image.alt = "Gambar tidak dapat dimuat";
  };

  // Konten kartu
  const content = document.createElement("div");

  content.className = "artwork-content";

  // Kategori
  const category = document.createElement("span");

  category.className = "artwork-category";
  category.textContent = artwork.category;

  // Judul
  const title = document.createElement("h3");

  title.textContent =
    metadata.name || `Karya #${artwork.tokenId}`;

  // Deskripsi
  const description = document.createElement("p");

  description.textContent =
    metadata.description || "Tidak ada deskripsi.";

  // Creator
  const creator = document.createElement("p");

  creator.className = "artwork-creator";

  creator.textContent =
    `Creator: ${metadata.creator || artwork.creator}`;

  // Token ID
  const token = document.createElement("span");

  token.className = "artwork-token";
  token.textContent = `NFT #${artwork.tokenId}`;

  // Detail
  const detailLink = document.createElement("span");

  detailLink.className = "artwork-detail-link";
  detailLink.textContent = "Lihat Detail Karya →";

  content.append(
    category,
    title,
    description,
    creator,
    token,
    detailLink
  );

  card.append(image, content);

  return card;
}

// ========================================
// 9. MEMUAT EXPLORE GALLERY
// OPTIMASI: PARALLEL + BATCH
// ========================================

async function loadGallery() {
  try {
    if (!contract) {
      showInfo(
        "Hubungkan wallet untuk melihat koleksi karya."
      );

      return;
    }

    await checkNetwork(provider);

    showInfo("Sedang memuat karya...");

    galleryGrid.replaceChildren();

    const totalArtwork =
      Number(await contract.nextArtworkId()) - 1;

    if (totalArtwork <= 0) {
      showInfo("Belum ada karya di galeri.");
      return;
    }

    let displayedCount = 0;
    let failedCount = 0;

    // Maksimal 2 NFT diproses bersamaan
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

      showInfo(
        `Memuat karya ${start}–${end} dari ${totalArtwork}...`
      );

      // Membaca beberapa NFT secara bersamaan
      const results = await Promise.all(
        Array.from(
          {
            length: end - start + 1
          },
          (_, index) => start + index
        ).map(async (i) => {

          try {
            const data = await contract.getArtwork(i);

            const artwork = {
              artworkId: i,
              creator: data.creator,
              category: data.category,
              metadataURI: data.metadataURI,
              status: Number(data.status),
              tokenId: Number(data.tokenId)
            };

            // Hanya NFT yang sudah Minted
            if (artwork.status !== 1) {
              return {
                skipped: true
              };
            }

            // Mengambil metadata melalui backend
            const metadata = await getArtworkMetadata(
              artwork.metadataURI
            );

            return {
              card: createArtworkCard(
                artwork,
                metadata
              )
            };

          } catch (error) {
            console.error(
              `Gagal memuat karya #${i}:`,
              error
            );

            return {
              error: true,
              artworkId: i
            };
          }
        })
      );

      // Menampilkan hasil batch
      for (const result of results) {

        if (result.error) {
          failedCount++;
          continue;
        }

        if (result.skipped) {
          continue;
        }

        if (result.card) {
          galleryGrid.appendChild(result.card);
          displayedCount++;
        }
      }

      // Jeda 500 ms sebelum batch berikutnya
      if (end < totalArtwork) {
        await new Promise(
          resolve => setTimeout(resolve, 500)
        );
      }
    }

    // Informasi hasil pemuatan
    if (
      displayedCount === 0 &&
      failedCount === 0
    ) {
      showInfo(
        "Belum ada karya NFT yang disetujui kurator."
      );

      return;
    }

    showInfo(
      `${displayedCount} karya NFT berhasil ditampilkan.` +
      (
        failedCount > 0
          ? ` ${failedCount} karya gagal dimuat.`
          : ""
      )
    );

  } catch (error) {
    console.error(
      "Gallery error:",
      error
    );

    showInfo(
      error.shortMessage ||
      error.message ||
      "Gagal memuat galeri."
    );
  }
}

// ========================================
// 10. REFRESH GALERI
// ========================================

if (refreshGalleryButton) {
  refreshGalleryButton.addEventListener(
    "click",
    loadGallery
  );
}

// ========================================
// 11. AUTO CONNECT WALLET
// ========================================

// Mengecek koneksi wallet tanpa popup MetaMask.
// Jika sebelumnya sudah diizinkan, wallet langsung dikenali.

showInfo("Memeriksa koneksi wallet...");

initializeWallet(false);
