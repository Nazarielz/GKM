
import { ethers } from "ethers";
import contractArtifact from "./abi/GaleriKarya.json";

// ========================================
// 1. KONFIGURASI
// ========================================

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const CHAIN_MODE = import.meta.env.VITE_CHAIN_MODE || "localhost";

const CHAIN_ID = BigInt(
  CHAIN_MODE === "sepolia"
    ? import.meta.env.VITE_SEPOLIA_CHAIN_ID || "11155111"
    : import.meta.env.VITE_LOCAL_CHAIN_ID || "31337"
);

const CONTRACT_ABI = contractArtifact.abi;

const RPC_URL =
  CHAIN_MODE === "sepolia"
    ? import.meta.env.VITE_SEPOLIA_RPC_URL
    : "http://127.0.0.1:8545";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  "http://127.0.0.1:8000";

// ========================================
// 2. ELEMEN HTML
// ========================================

const detailInfo = document.getElementById("detailInfo");
const artworkDetail = document.getElementById("artworkDetail");
const verificationSection = document.getElementById("verificationSection");
const networkStatus = document.getElementById("networkStatus");

const artworkImage = document.getElementById("artworkImage");
const artworkName = document.getElementById("artworkName");
const artworkDescription = document.getElementById("artworkDescription");
const artworkCategory = document.getElementById("artworkCategory");
const artworkCreator = document.getElementById("artworkCreator");
const artworkCreatorUsername = document.getElementById(
  "artworkCreatorUsername"
);
const artworkIdElement = document.getElementById("artworkId");
const artworkStatus = document.getElementById("artworkStatus");

const verificationBadge = document.getElementById("verificationBadge");
const verificationStatus = document.getElementById("verificationStatus");
const tokenIdElement = document.getElementById("tokenId");
const tokenOwner = document.getElementById("tokenOwner");
const blockchainNetwork = document.getElementById("blockchainNetwork");
const contractAddressElement = document.getElementById("contractAddress");
const contentHashElement = document.getElementById("contentHash");
const metadataURIElement = document.getElementById("metadataURI");
const ipfsCIDElement = document.getElementById("ipfsCID");
const curatorAddress = document.getElementById("curatorAddress");
const transactionHash = document.getElementById("transactionHash");

// Elemen Transfer NFT
const transferSection = document.getElementById("transferSection");
const transferWallet = document.getElementById("transferWallet");
const transferEligibility = document.getElementById("transferEligibility");
const recipientAddress = document.getElementById("recipientAddress");
const connectTransferWallet = document.getElementById("connectTransferWallet");
const transferNFTButton = document.getElementById("transferNFTButton");
const transferMessage = document.getElementById("transferMessage");

// ========================================
// 3. STATE BLOCKCHAIN
// ========================================

let currentArtworkId = null;
let currentTokenId = null;
let currentOwner = null;

let readOnlyContract = null;
let connectedSigner = null;

// ========================================
// 4. UTILITAS
// ========================================

function setText(element, value) {
  if (element) {
    element.textContent = value ?? "-";
  }
}

function ipfsToHttp(uri) {
  if (!uri) return "";

  if (uri.startsWith("ipfs://")) {
    const cid = uri.slice("ipfs://".length);
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }

  return uri;
}

function getCID(uri) {
  if (!uri || !uri.startsWith("ipfs://")) {
    return "-";
  }

  return uri.slice("ipfs://".length).split("/")[0] || "-";
}

function getArtworkStatus(status) {
  const statuses = {
    0: "Pending",
    1: "Minted",
    2: "Rejected"
  };

  return statuses[status] || "Tidak diketahui";
}

function showError(message) {
  if (detailInfo) {
    detailInfo.textContent = message;
    detailInfo.classList.add("error");
  }
}

function setTransferMessage(message, type = "") {
  if (!transferMessage) return;

  transferMessage.textContent = message;
  transferMessage.className = "transfer-message";

  if (type) {
    transferMessage.classList.add(type);
  }
}

// ========================================
// 5. VALIDASI KONFIGURASI
// ========================================

function validateConfig() {
  if (!CONTRACT_ADDRESS) {
    throw new Error(
      "Alamat smart contract belum dikonfigurasi."
    );
  }

  if (!ethers.isAddress(CONTRACT_ADDRESS)) {
    throw new Error(
      "Alamat smart contract tidak valid."
    );
  }

  if (!RPC_URL) {
    throw new Error(
      "RPC Sepolia belum dikonfigurasi. Isi VITE_SEPOLIA_RPC_URL."
    );
  }
}

// ========================================
// 6. KONEKSI BLOCKCHAIN
// ========================================

async function connectBlockchain() {
  validateConfig();

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const network = await provider.getNetwork();

  if (network.chainId !== CHAIN_ID) {
    throw new Error(
      `Chain ID tidak sesuai. Diperlukan ${CHAIN_ID}, ` +
      `tetapi RPC terhubung ke ${network.chainId}.`
    );
  }

  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    CONTRACT_ABI,
    provider
  );

  const networkName =
    CHAIN_MODE === "sepolia"
      ? "Sepolia"
      : "Hardhat Local";

  setText(networkStatus, `${networkName} • Connected`);

  if (networkStatus) {
    networkStatus.classList.add("connected");
  }

  return {
    provider,
    contract,
    networkName
  };
}

// ========================================
// 7. MEMBACA METADATA IPFS
// ========================================

async function getArtworkMetadata(metadataURI) {
  if (!metadataURI) {
    throw new Error("Metadata URI kosong.");
  }

  const cid = metadataURI
    .replace(/^ipfs:\/\//, "")
    .split("/")[0];

  if (!cid) {
    throw new Error("CID metadata tidak ditemukan.");
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 10000);

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/ipfs/metadata/${encodeURIComponent(cid)}`,
      {
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(
        `Metadata IPFS tidak dapat diakses: HTTP ${response.status}`
      );
    }

    const metadata = await response.json();

    if (!metadata || typeof metadata !== "object") {
      throw new Error("Format metadata tidak valid.");
    }

    return metadata;

  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "Waktu pengambilan metadata IPFS habis."
      );
    }

    throw error;

  } finally {
    clearTimeout(timeout);
  }
}

// ========================================
// 8. MENGAMBIL INFORMASI CREATOR
// ========================================

async function getCreatorInfo(walletAddress) {
  if (!walletAddress || !ethers.isAddress(walletAddress)) {
    throw new Error("Wallet Creator tidak valid.");
  }

  const params = new URLSearchParams({
    wallet_address: walletAddress
  });

  const response = await fetch(
    `${BACKEND_URL}/api/creators/registration-status?${params}`
  );

  if (!response.ok) {
    throw new Error(
      `Gagal mengambil informasi Creator: HTTP ${response.status}`
    );
  }

  const result = await response.json();

  if (!result.registered || !result.registration) {
    throw new Error(
      "Informasi registrasi Creator tidak ditemukan."
    );
  }

  return result.registration;
}

// ========================================
// 9. MENAMPILKAN INFORMASI KARYA
// ========================================

function displayArtwork(artwork, metadata, artworkId) {
  setText(
    artworkName,
    metadata?.name || `Karya #${artworkId}`
  );

  setText(
    artworkDescription,
    metadata?.description || "Tidak ada deskripsi karya."
  );

  setText(artworkCategory, artwork.category);
  setText(artworkCreator, artwork.creator);
  setText(artworkIdElement, artworkId);
  setText(artworkStatus, getArtworkStatus(artwork.status));

  if (artworkImage) {
    if (metadata?.image) {
      artworkImage.src = ipfsToHttp(metadata.image);
      artworkImage.alt = metadata.name || "Karya digital";

      artworkImage.onerror = () => {
        artworkImage.removeAttribute("src");
        artworkImage.alt =
          "Gambar tidak dapat dimuat dari IPFS";
      };

    } else {
      artworkImage.removeAttribute("src");
      artworkImage.alt =
        "Metadata tidak menyediakan gambar";
    }
  }

  if (artworkDetail) {
    artworkDetail.classList.remove("hidden");
  }
}

// ========================================
// 10. MENAMPILKAN USERNAME CREATOR
// ========================================

async function displayCreatorInfo(walletAddress) {
  setText(artworkCreatorUsername, "Memuat...");

  try {
    const creatorInfo = await getCreatorInfo(walletAddress);

    setText(
      artworkCreatorUsername,
      creatorInfo.username
        ? `@${creatorInfo.username}`
        : "-"
    );

  } catch (error) {
    console.warn(
      "Gagal mengambil informasi Creator:",
      error
    );

    setText(
      artworkCreatorUsername,
      "Tidak tersedia"
    );
  }
}

// ========================================
// 11. MENCARI EVENT ARTWORK MINTED
// ========================================

async function getMintEvent(contract, provider, artworkId) {
  const filter = contract.filters.ArtworkMinted(artworkId);

  const events = await contract.queryFilter(
    filter,
    0,
    "latest"
  );

  if (events.length === 0) {
    return null;
  }

  const event = events[events.length - 1];

  const receipt = await provider.getTransactionReceipt(
    event.transactionHash
  );

  return {
    event,
    receipt
  };
}

// ========================================
// 12. MEMERIKSA HAK TRANSFER
// ========================================

function updateTransferEligibility(owner) {
  currentOwner = owner;

  if (!transferSection || !transferNFTButton) {
    return;
  }

  if (!owner) {
    transferNFTButton.disabled = true;

    setText(
      transferEligibility,
      "Menunggu data NFT..."
    );

    return;
  }

  transferSection.classList.remove("hidden");

  if (!connectedSigner) {
    setText(
      transferWallet,
      "Belum terhubung"
    );

    setText(
      transferEligibility,
      "Hubungkan wallet untuk memeriksa"
    );

    transferNFTButton.disabled = true;

    setTransferMessage(
      "Hubungkan MetaMask menggunakan wallet pemilik NFT."
    );

    return;
  }

  const signerAddress = connectedSigner.address;

  setText(transferWallet, signerAddress);

  const isOwner =
    ethers.getAddress(signerAddress) ===
    ethers.getAddress(owner);

  if (isOwner) {
    setText(
      transferEligibility,
      "Anda adalah pemilik NFT"
    );

    transferNFTButton.disabled = false;

    setTransferMessage(
      "Wallet Anda memiliki NFT ini dan dapat melakukan transfer.",
      "success"
    );

  } else {
    setText(
      transferEligibility,
      "Anda bukan pemilik NFT"
    );

    transferNFTButton.disabled = true;

    setTransferMessage(
      "Hanya pemilik NFT saat ini yang dapat melakukan transfer.",
      "error"
    );
  }
}

// ========================================
// 13. VERIFIKASI NFT
// ========================================

async function verifyNFT(
  provider,
  contract,
  artwork,
  artworkId,
  networkName
) {
  if (verificationSection) {
    verificationSection.classList.remove("hidden");
  }

  setText(blockchainNetwork, networkName);
  setText(contractAddressElement, CONTRACT_ADDRESS);
  setText(contentHashElement, artwork.contentHash);
  setText(metadataURIElement, artwork.metadataURI);
  setText(ipfsCIDElement, getCID(artwork.metadataURI));

  // Periksa status karya
  if (Number(artwork.status) !== 1) {
    if (transferSection) {
      transferSection.classList.add("hidden");
    }

    setText(
      verificationStatus,
      "Belum diterbitkan sebagai NFT"
    );

    setText(tokenIdElement, "-");
    setText(tokenOwner, "-");
    setText(curatorAddress, "-");
    setText(transactionHash, "-");

    if (verificationBadge) {
      verificationBadge.textContent = "Belum Minted";
      verificationBadge.classList.add("error");
    }

    updateTransferEligibility(null);

    return;
  }

  const tokenId = BigInt(artwork.tokenId);

  setText(tokenIdElement, tokenId.toString());

  // Cari event mint
  const mintEventTask = getMintEvent(
    contract,
    provider,
    artworkId
  ).catch((error) => {
    console.error(
      "Gagal membaca event mint:",
      error
    );

    return null;
  });

  let owner;
  let blockchainTokenURI;

  try {
    [owner, blockchainTokenURI] = await Promise.all([
      contract.ownerOf(tokenId),
      contract.tokenURI(tokenId)
    ]);

  } catch (error) {
    console.error(
      "NFT verification error:",
      error
    );

    throw new Error(
      "Data NFT tidak dapat diverifikasi melalui smart contract."
    );
  }

  setText(tokenOwner, owner);

  currentArtworkId = artworkId;
  currentTokenId = tokenId;

  updateTransferEligibility(owner);

  // Validasi tokenURI
  const tokenURIValid =
    blockchainTokenURI === artwork.metadataURI;

  // Tunggu event mint
  const mintEvent = await mintEventTask;

  let eventValid = false;

  if (mintEvent?.event && mintEvent.receipt) {
    const args = mintEvent.event.args;

    const eventArtworkId = BigInt(args.artworkId);
    const eventTokenId = BigInt(args.tokenId);

    const eventCreator = ethers.getAddress(
      args.creator
    );

    const storedCreator = ethers.getAddress(
      artwork.creator
    );

    const receiptSuccessful =
      mintEvent.receipt.status === 1;

    eventValid =
      eventArtworkId === BigInt(artworkId) &&
      eventTokenId === tokenId &&
      eventCreator === storedCreator &&
      receiptSuccessful;

    setText(curatorAddress, args.curator);

    setText(
      transactionHash,
      mintEvent.event.transactionHash
    );

  } else {
    setText(
      curatorAddress,
      "Event mint tidak ditemukan"
    );

    setText(
      transactionHash,
      "Tidak tersedia"
    );
  }

  // Hasil akhir verifikasi
  const isVerified =
    tokenURIValid &&
    eventValid;

  if (isVerified) {
    setText(
      verificationStatus,
      "NFT berhasil diverifikasi"
    );

    if (verificationBadge) {
      verificationBadge.textContent =
        "NFT Terverifikasi";

      verificationBadge.classList.remove("error");
    }

  } else {
    setText(
      verificationStatus,
      "Verifikasi tidak lengkap atau data tidak cocok"
    );

    if (verificationBadge) {
      verificationBadge.textContent =
        "Perlu Pemeriksaan";

      verificationBadge.classList.add("error");
    }
  }
}

// ========================================
// 14. PROSES UTAMA DETAIL KARYA
// ========================================

async function loadArtworkDetail() {
  try {
    const params = new URLSearchParams(
      window.location.search
    );

    const artworkId = Number(
      params.get("id")
    );

    if (
      !Number.isSafeInteger(artworkId) ||
      artworkId <= 0
    ) {
      throw new Error(
        "ID karya tidak valid."
      );
    }

    setText(
      detailInfo,
      "Sedang mengambil data blockchain..."
    );

    const {
      provider,
      contract,
      networkName
    } = await connectBlockchain();

    readOnlyContract = contract;
    currentArtworkId = artworkId;

    // Ambil data karya dari smart contract
    const data = await contract.getArtwork(
      artworkId
    );

    const artwork = {
      creator: data.creator,
      category: data.category,
      contentHash: data.contentHash,
      metadataURI: data.metadataURI,
      status: Number(data.status),
      tokenId: BigInt(data.tokenId)
    };

    // Tampilkan data blockchain
    displayArtwork(
      artwork,
      null,
      artworkId
    );

    // Ambil informasi Creator berdasarkan wallet asli
    displayCreatorInfo(artwork.creator);

    setText(
      detailInfo,
      "Data blockchain berhasil dimuat. Metadata sedang diambil..."
    );

    // Ambil metadata IPFS
    getArtworkMetadata(artwork.metadataURI)
      .then((metadata) => {
        displayArtwork(
          artwork,
          metadata,
          artworkId
        );

        setText(
          detailInfo,
          "Informasi karya dan metadata berhasil dimuat."
        );

        if (detailInfo) {
          detailInfo.classList.remove("error");
        }
      })
      .catch((error) => {
        console.warn(
          "Metadata IPFS:",
          error
        );

        setText(
          detailInfo,
          "Data blockchain berhasil dimuat, tetapi metadata IPFS tidak tersedia."
        );
      });

    // Verifikasi NFT
    await verifyNFT(
      provider,
      contract,
      artwork,
      artworkId,
      networkName
    );

  } catch (error) {
    console.error(
      "Artwork detail error:",
      error
    );

    showError(
      error.shortMessage ||
      error.message ||
      "Gagal memuat informasi karya."
    );
  }
}

// ========================================
// 15. MENGHUBUNGKAN METAMASK
// ========================================

async function connectTransferWalletHandler() {
  try {
    if (!window.ethereum) {
      throw new Error(
        "MetaMask belum terpasang."
      );
    }

    const browserProvider =
      new ethers.BrowserProvider(
        window.ethereum
      );

    await browserProvider.send(
      "eth_requestAccounts",
      []
    );

    const network = await browserProvider.getNetwork();

    if (network.chainId !== CHAIN_ID) {
      throw new Error(
        `Jaringan MetaMask salah. Gunakan Chain ID ${CHAIN_ID}.`
      );
    }

    const signer = await browserProvider.getSigner();

    connectedSigner = {
      signer,
      address: await signer.getAddress()
    };

    setText(
      transferWallet,
      connectedSigner.address
    );

    updateTransferEligibility(currentOwner);

    if (connectTransferWallet) {
      connectTransferWallet.textContent =
        "Wallet Terhubung";
    }

  } catch (error) {
    console.error(
      "Connect wallet error:",
      error
    );

    setTransferMessage(
      error.shortMessage ||
      error.message ||
      "Gagal menghubungkan MetaMask.",
      "error"
    );
  }
}

// ========================================
// 16. MELAKUKAN TRANSFER NFT
// ========================================

async function transferNFT() {
  try {
    if (!connectedSigner) {
      throw new Error(
        "Hubungkan MetaMask terlebih dahulu."
      );
    }

    if (
      !currentArtworkId ||
      currentTokenId === null
    ) {
      throw new Error(
        "Data NFT belum tersedia."
      );
    }

    if (!recipientAddress) {
      throw new Error(
        "Kolom alamat penerima tidak ditemukan."
      );
    }

    const recipient =
      recipientAddress.value.trim();

    if (!ethers.isAddress(recipient)) {
      throw new Error(
        "Alamat wallet penerima tidak valid."
      );
    }

    const normalizedRecipient =
      ethers.getAddress(recipient);

    if (
      normalizedRecipient === ethers.ZeroAddress
    ) {
      throw new Error(
        "Alamat penerima tidak boleh zero address."
      );
    }

    if (
      normalizedRecipient ===
      ethers.getAddress(currentOwner)
    ) {
      throw new Error(
        "Alamat penerima sama dengan pemilik NFT saat ini."
      );
    }

    if (transferNFTButton) {
      transferNFTButton.disabled = true;
    }

    setTransferMessage(
      "Memeriksa kepemilikan NFT..."
    );

    const signerAddress =
      await connectedSigner.signer.getAddress();

    // Periksa pemilik langsung dari blockchain
    const actualOwner =
      await readOnlyContract.ownerOf(
        currentTokenId
      );

    if (
      ethers.getAddress(actualOwner) !==
      ethers.getAddress(signerAddress)
    ) {
      throw new Error(
        "Wallet Anda bukan pemilik NFT saat ini."
      );
    }

    // Periksa jaringan MetaMask
    const browserProvider =
      new ethers.BrowserProvider(
        window.ethereum
      );

    const network = await browserProvider.getNetwork();

    if (network.chainId !== CHAIN_ID) {
      throw new Error(
        `Jaringan salah. Gunakan Chain ID ${CHAIN_ID}.`
      );
    }

    setTransferMessage(
      "Menunggu konfirmasi transaksi di MetaMask..."
    );

    const contractWithSigner =
      new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        connectedSigner.signer
      );

    // Transfer NFT menggunakan ERC-721
    const tx = await contractWithSigner[
      "safeTransferFrom(address,address,uint256)"
    ](
      signerAddress,
      normalizedRecipient,
      currentTokenId
    );

    setTransferMessage(
      "Transaksi dikirim. Menunggu konfirmasi blockchain..."
    );

    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error(
        "Transaksi transfer gagal."
      );
    }

    // Periksa kepemilikan terbaru
    const updatedOwner =
      await readOnlyContract.ownerOf(
        currentTokenId
      );

    if (
      ethers.getAddress(updatedOwner) !==
      normalizedRecipient
    ) {
      throw new Error(
        "Transaksi tercatat, tetapi pemilik NFT belum sesuai."
      );
    }

    currentOwner = updatedOwner;

    // Perbarui tampilan pemilik NFT
    setText(
      tokenOwner,
      updatedOwner
    );

    updateTransferEligibility(
      updatedOwner
    );

    recipientAddress.value = "";

    setTransferMessage(
      `Transfer berhasil! NFT sekarang dimiliki oleh ${updatedOwner}. Transaction Hash: ${tx.hash}`,
      "success"
    );

    console.log(
      "Transfer receipt:",
      receipt
    );

  } catch (error) {
    console.error(
      "Transfer NFT error:",
      error
    );

    setTransferMessage(
      error.shortMessage ||
      error.reason ||
      error.message ||
      "Transfer NFT gagal.",
      "error"
    );

  } finally {
    if (transferNFTButton) {
      const isCurrentOwner =
        connectedSigner &&
        currentOwner &&
        ethers.getAddress(connectedSigner.address) ===
        ethers.getAddress(currentOwner);

      transferNFTButton.disabled = !isCurrentOwner;
    }
  }
}

// ========================================
// 17. EVENT LISTENER TRANSFER NFT
// ========================================

if (connectTransferWallet) {
  connectTransferWallet.addEventListener(
    "click",
    connectTransferWalletHandler
  );
} else {
  console.warn(
    "Elemen connectTransferWallet tidak ditemukan di HTML."
  );
}

if (transferNFTButton) {
  transferNFTButton.addEventListener(
    "click",
    transferNFT
  );
} else {
  console.warn(
    "Elemen transferNFTButton tidak ditemukan di HTML."
  );
}

// ========================================
// 18. MENJALANKAN HALAMAN
// ========================================

loadArtworkDetail();
