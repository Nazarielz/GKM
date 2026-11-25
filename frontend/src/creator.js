
import {
  CHAIN_MODE,
  getWallet,
  checkNetwork as checkWalletNetwork,
  getContract,
  setupWalletListeners
} from "./wallet.js";

// ==============================
// 1. KONFIGURASI
// ==============================

const API_URL = import.meta.env.VITE_BACKEND_URL;

// ==============================
// 2. ELEMEN HTML
// ==============================

const connectButton = document.getElementById("connectWallet");
const networkStatus = document.getElementById("networkStatus");
const walletAddress = document.getElementById("walletAddress");
const creatorAddress = document.getElementById("creatorAddress");
const creatorInput = document.getElementById("creator");

const artworkForm = document.getElementById("artworkForm");
const submitButton = document.getElementById("submitArtwork");
const messageBox = document.getElementById("message");

const fileInput = document.getElementById("artworkFile");
const imagePreview = document.getElementById("imagePreview");
const previewImage = document.getElementById("previewImage");

// Elemen klasifikasi AI
const aiRecommendation = document.getElementById("aiRecommendation");
const aiStatus = document.getElementById("aiStatus");
const aiCategory = document.getElementById("aiCategory");
const aiConfidence = document.getElementById("aiConfidence");
const aiProbabilities = document.getElementById("aiProbabilities");
const useAiCategoryButton = document.getElementById("useAiCategory");

let recommendedCategory = "";
let aiRequestId = 0;
let previewObjectUrl = null;

const refreshButton = document.getElementById("refreshCreator");
const worksInfo = document.getElementById("creatorWorksInfo");
const worksGrid = document.getElementById("creatorWorksGrid");

// Statistik
const totalWorks = document.getElementById("totalWorks");
const pendingWorks = document.getElementById("pendingWorks");
const mintedWorks = document.getElementById("mintedWorks");
const rejectedWorks = document.getElementById("rejectedWorks");

// ==============================
// 3. VARIABEL BLOCKCHAIN
// ==============================

let provider;
let signer;
let account;
let contract;
let creatorUsername = "";

// ==============================
// 4. UTILITAS
// ==============================

function showMessage(message, type = "success") {
  messageBox.textContent = message;
  messageBox.className = `message ${type}`;
}

function ipfsToHttp(uri) {
  if (!uri) return "";

  if (uri.startsWith("ipfs://")) {
    const cid = uri.replace("ipfs://", "");
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }

  return uri;
}

async function checkNetwork() {
  if (!provider) {
    throw new Error("Hubungkan wallet terlebih dahulu.");
  }

  await checkWalletNetwork(provider);
}

// ==============================
// MENGAMBIL USERNAME KREATOR
// ==============================

async function loadCreatorProfile() {
  try {
    if (!account) {
      throw new Error("Wallet belum terhubung.");
    }

    creatorInput.value = "";
    creatorUsername = "";

    const response = await fetch(
      `${API_URL}/api/creators/registration-status?wallet_address=${encodeURIComponent(account)}`
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.detail || "Gagal mengambil data kreator."
      );
    }

    if (!result.registered || !result.registration) {
      throw new Error(
        "Wallet ini belum terdaftar sebagai kreator."
      );
    }

    const registration = result.registration;

    if (registration.status !== "approved") {
      throw new Error(
        `Pendaftaran kreator belum disetujui. Status: ${registration.status}`
      );
    }

    if (
      registration.wallet_address.toLowerCase() !== account.toLowerCase()
    ) {
      throw new Error(
        "Data kreator tidak cocok dengan wallet yang terhubung."
      );
    }

    if (!registration.username) {
      throw new Error(
        "Username kreator tidak ditemukan."
      );
    }

    creatorUsername = registration.username;

    // Tampilkan username pada form.
    creatorInput.value = `@${creatorUsername}`;

    creatorInput.readOnly = true;

    creatorInput.title =
      "Username otomatis berdasarkan akun registrasi kreator.";

    return true;

  } catch (error) {
    console.error("Creator profile error:", error);

    creatorUsername = "";
    creatorInput.value = "";

    creatorInput.readOnly = true;

    showMessage(
      error.message || "Gagal mengambil username kreator.",
      "error"
    );

    return false;
  }
}

async function getArtworkMetadata(uri) {
  if (!uri) {
    throw new Error("Metadata URI kosong.");
  }

  const url = ipfsToHttp(uri);

  console.log("Metadata URI:", uri);
  console.log("Metadata Gateway URL:", url);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Gateway IPFS gagal. HTTP ${response.status}: ${response.statusText}`
    );
  }

  const metadata = await response.json();

  console.log("Metadata berhasil dimuat:", metadata);

  return metadata;
}

// ==============================
// KLASIFIKASI AI MOBILENETV2
// ==============================

async function classifyArtwork(file) {
  const requestId = ++aiRequestId;

  recommendedCategory = "";

  aiRecommendation.classList.remove("hidden");
  aiStatus.textContent = "AI sedang menganalisis gambar...";
  aiCategory.textContent = "-";
  aiConfidence.textContent = "-";
  aiProbabilities.replaceChildren();

  useAiCategoryButton.disabled = true;

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(
      `${API_URL}/api/ai/predict`,
      {
        method: "POST",
        body: formData
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.detail || result.message || "Klasifikasi AI gagal."
      );
    }

    // Abaikan hasil dari permintaan gambar yang sudah diganti.
    if (requestId !== aiRequestId) return;

    const recommendation = result.recommendation;

    if (!recommendation) {
      throw new Error("Hasil rekomendasi AI tidak ditemukan.");
    }

    recommendedCategory = recommendation.predicted_category;

    aiStatus.textContent = "Gambar berhasil dianalisis.";
    aiCategory.textContent = recommendedCategory;
    aiConfidence.textContent =
      `${recommendation.confidence}%`;

    // Menampilkan probabilitas setiap kategori.
    for (const [category, probability] of Object.entries(
      recommendation.probabilities
    )) {
      const item = document.createElement("p");
      item.textContent = `${category}: ${probability}%`;

      aiProbabilities.appendChild(item);
    }

    useAiCategoryButton.disabled = false;

  } catch (error) {
    console.error("AI classification error:", error);

    if (requestId !== aiRequestId) return;

    aiStatus.textContent =
      `Klasifikasi tidak berhasil: ${error.message}`;

    aiCategory.textContent = "Tidak tersedia";
    aiConfidence.textContent = "-";

    // Creator masih dapat memilih kategori secara manual.
    useAiCategoryButton.disabled = true;
  }
}

// Menggunakan rekomendasi AI setelah disetujui Creator.
useAiCategoryButton.addEventListener("click", () => {
  const validCategories = ["Foto", "Ilustrasi", "Poster"];

  if (!validCategories.includes(recommendedCategory)) {
    showMessage("Rekomendasi AI tidak valid.", "error");
    return;
  }

  document.getElementById("category").value = recommendedCategory;

  showMessage(
    `Kategori ${recommendedCategory} dipilih berdasarkan rekomendasi AI.`,
    "success"
  );
});

// ==============================
// 5. KONEKSI WALLET
// ==============================

// ==============================
// 5. KONEKSI WALLET BERSAMA
// ==============================

async function initializeWallet(request = false) {
  try {
    const wallet = await getWallet(request);

    if (!wallet) {
      provider = null;
      signer = null;
      account = null;
      contract = null;

      if (walletAddress) {
        walletAddress.textContent = "";
      }

      if (creatorAddress) {
        creatorAddress.textContent = "Wallet Creator: belum terhubung";
      }

      if (connectButton) {
        connectButton.textContent = "Hubungkan Wallet";
      }

      if (networkStatus) {
        networkStatus.textContent = "Belum terhubung";
        networkStatus.classList.remove("connected");
      }

      creatorUsername = "";

      if (creatorInput) {
        creatorInput.value = "";
        creatorInput.readOnly = true;
      }

      if (worksInfo) {
        worksInfo.textContent =
          "Hubungkan wallet untuk melihat karya.";
      }

      if (worksGrid) {
        worksGrid.replaceChildren();
      }

      return false;
    }

    provider = wallet.provider;
    signer = wallet.signer;
    account = wallet.account;

    await checkWalletNetwork(provider);

    contract = getContract(signer);

    if (walletAddress) {
      walletAddress.textContent = account;
    }

    if (creatorAddress) {
      creatorAddress.textContent = `Wallet Creator: ${account}`;
    }

    if (connectButton) {
      connectButton.textContent = "Wallet Terhubung";
    }

    if (networkStatus) {
      networkStatus.textContent =
        `${CHAIN_MODE === "sepolia" ? "Sepolia" : "Hardhat Local"} • Connected`;

      networkStatus.classList.add("connected");
    }

    // Ambil username berdasarkan wallet yang terhubung.
    const profileLoaded = await loadCreatorProfile();

    if (!profileLoaded) {
      if (worksInfo) {
        worksInfo.textContent =
          "Profil kreator tidak tersedia atau belum disetujui.";
      }

      if (worksGrid) {
        worksGrid.replaceChildren();
      }

      return false;
    }

    if (request) {
      showMessage(
        `Wallet terhubung sebagai @${creatorUsername}.`,
        "success"
      );
    }

    await loadCreatorWorks();

    return true;

  } catch (error) {
    console.error("Wallet initialization error:", error);

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

    await initializeWallet(true);

    connectButton.disabled = false;
  });
}

// Listener perubahan akun dan jaringan
setupWalletListeners();

// ==============================
// 6. PREVIEW GAMBAR
// ==============================

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];

  // Reset rekomendasi sebelumnya.
  aiRequestId++;
  recommendedCategory = "";
  aiRecommendation.classList.add("hidden");

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  if (!file) {
    imagePreview.classList.add("hidden");
    return;
  }

  if (!file.type.startsWith("image/")) {
    showMessage("File harus berupa gambar.", "error");

    fileInput.value = "";
    imagePreview.classList.add("hidden");

    return;
  }

  previewObjectUrl = URL.createObjectURL(file);

  previewImage.src = previewObjectUrl;
  imagePreview.classList.remove("hidden");

  // Jalankan klasifikasi MobileNetV2.
  await classifyArtwork(file);
});

// ==============================
// 7. UPLOAD DAN PENGAJUAN KARYA
// ==============================

artworkForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    if (!signer || !contract) {
      throw new Error("Hubungkan MetaMask terlebih dahulu.");
    }

    await checkNetwork();

    const file = fileInput.files[0];

    if (!file) {
      throw new Error("Pilih gambar karya terlebih dahulu.");
    }

    const category = document.getElementById("category").value;

    if (!["Foto", "Ilustrasi", "Poster"].includes(category)) {
      throw new Error("Pilih kategori karya yang valid.");
    }
    
    const formData = new FormData();

    formData.append("title", document.getElementById("title").value);
    formData.append("description", document.getElementById("description").value);
    formData.append("category", category);
    if (!creatorUsername) {
      throw new Error(
        "Username kreator belum berhasil dimuat."
      );
    }

    formData.append("creator", `@${creatorUsername}`);
    formData.append("file", file);

    submitButton.disabled = true;
    submitButton.textContent = "Mengunggah ke IPFS...";

    showMessage("Mengunggah gambar dan metadata ke Pinata...");

    const response = await fetch(
      `${API_URL}/api/artworks/upload`,
      {
        method: "POST",
        body: formData
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.detail || result.message || "Upload IPFS gagal."
      );
    }

    const metadataURI = result.metadata.uri;
    const contentHash = result.contentHash;

    if (!metadataURI || !contentHash) {
      throw new Error("Metadata URI atau contentHash tidak tersedia.");
    }

    submitButton.textContent = "Menunggu konfirmasi MetaMask...";

    const transaction = await contract.submitArtwork(
      category,
      metadataURI,
      contentHash
    );

    submitButton.textContent = "Menunggu transaksi blockchain...";

    const receipt = await transaction.wait();

    if (receipt.status !== 1) {
      throw new Error("Transaksi pengajuan gagal.");
    }

    const submittedEvent = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((item) => item?.name === "ArtworkSubmitted");

    const artworkId = submittedEvent
      ? submittedEvent.args.artworkId.toString()
      : "Tidak ditemukan";

    showMessage(
      `Pengajuan berhasil!\nArtwork ID: ${artworkId}\nStatus: Menunggu persetujuan kurator.`,
      "success"
    );

    artworkForm.reset();

    creatorInput.value = `@${creatorUsername}`;
    creatorInput.readOnly = true;

    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }

    previewImage.src = "";
    imagePreview.classList.add("hidden");
    aiRecommendation.classList.add("hidden");

    recommendedCategory = "";
    aiRequestId++;

    await loadCreatorWorks();

  } catch (error) {
    console.error(error);

    let message =
      error.shortMessage ||
      error.reason ||
      error.message ||
      "Terjadi kesalahan.";

    if (error.code === 4001) {
      message = "Transaksi dibatalkan melalui MetaMask.";
    }

    showMessage(message, "error");

  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Upload dan Ajukan Karya";
  }
});

// ==============================
// 8. KARTU KARYA CREATOR
// ==============================

function createCreatorCard(artwork, metadata) {
  const card = document.createElement("article");
  card.className = "artwork-card";

  const image = document.createElement("img");
  image.className = "artwork-image";
  image.src = metadata.image ? ipfsToHttp(metadata.image) : "";
  image.alt = metadata.name || "Karya digital";
  image.loading = "lazy";

  const content = document.createElement("div");
  content.className = "artwork-content";

  const category = document.createElement("span");
  category.className = "artwork-category";
  category.textContent = artwork.category;

  const title = document.createElement("h3");
  title.textContent = metadata.name || `Karya #${artwork.artworkId}`;

  const description = document.createElement("p");
  description.textContent = metadata.description || "Tidak ada deskripsi.";

  const status = document.createElement("span");
  status.className = "artwork-token";

  const statusLabels = {
    0: "Pending",
    1: `Minted • NFT #${artwork.tokenId}`,
    2: "Rejected"
  };

  status.textContent = statusLabels[artwork.status];

  content.append(category, title, description, status);

  if (artwork.status === 2 && artwork.rejectionReason) {
    const reason = document.createElement("p");
    reason.textContent = `Alasan penolakan: ${artwork.rejectionReason}`;
    content.appendChild(reason);
  }

  card.append(image, content);

  return card;
}

// ==============================
// 9. MEMUAT KARYA MILIK CREATOR
// ==============================

async function loadCreatorWorks() {
  try {
    if (!contract || !account) {
      worksInfo.textContent = "Hubungkan wallet untuk melihat karya.";
      worksGrid.replaceChildren();
      return;
    }

    await checkNetwork();

    worksInfo.textContent = "Memuat karya milikmu...";
    worksGrid.replaceChildren();

    const total = Number(await contract.nextArtworkId()) - 1;

    let mine = [];
    let pending = 0;
    let minted = 0;
    let rejected = 0;

    for (let i = 1; i <= total; i++) {
      const data = await contract.getArtwork(i);

      if (data.creator.toLowerCase() !== account.toLowerCase()) {
        continue;
      }

      const artwork = {
        artworkId: i,
        creator: data.creator,
        category: data.category,
        metadataURI: data.metadataURI,
        status: Number(data.status),
        tokenId: Number(data.tokenId),
        rejectionReason: data.rejectionReason
      };

      mine.push(artwork);

      if (artwork.status === 0) pending++;
      if (artwork.status === 1) minted++;
      if (artwork.status === 2) rejected++;
    }

    totalWorks.textContent = mine.length;
    pendingWorks.textContent = pending;
    mintedWorks.textContent = minted;
    rejectedWorks.textContent = rejected;

    if (mine.length === 0) {
      worksInfo.textContent = "Kamu belum mengajukan karya.";
      return;
    }

    for (const artwork of mine) {
      let metadata = {};

      try {
        metadata = await getArtworkMetadata(artwork.metadataURI);
      } catch (error) {
        console.error(
          `Metadata karya #${artwork.artworkId} gagal dimuat:`,
          error
        );
      }

      worksGrid.appendChild(
        createCreatorCard(artwork, metadata)
      );
    }

    worksInfo.textContent =
      `${mine.length} karya ditemukan pada wallet ini.`;

  } catch (error) {
    console.error("Creator dashboard error:", error);

    worksInfo.textContent =
      error.shortMessage || error.message || "Gagal memuat karya.";
  }
}

// ==============================
// 10. REFRESH DASHBOARD
// ==============================

if (refreshButton) {
  refreshButton.addEventListener("click", loadCreatorWorks);
}

// ==============================
// 11. AUTO CONNECT WALLET
// ==============================

initializeWallet(false);
