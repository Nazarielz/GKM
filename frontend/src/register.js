
import { getWallet } from "./wallet.js";

// ========================================
// 1. KONFIGURASI
// ========================================

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// ========================================
// 2. ELEMENT HTML
// ========================================

const registerForm = document.getElementById("registerForm");
const fullNameInput = document.getElementById("fullName");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const descriptionInput = document.getElementById("description");
const walletAddressInput = document.getElementById("walletAddress");

const connectWalletButton =
  document.getElementById("connectWalletButton");

const submitButton = document.getElementById("submitButton");
const registerMessage = document.getElementById("registerMessage");

let connectedWallet = null;

// ========================================
// 3. MENAMPILKAN PESAN
// ========================================

function showMessage(message, type = "info") {
  registerMessage.textContent = message;
  registerMessage.className = `message ${type}`;
}

function clearMessage() {
  registerMessage.textContent = "";
  registerMessage.className = "message";
}

// ========================================
// 4. HUBUNGKAN METAMASK
// ========================================

connectWalletButton.addEventListener("click", async () => {
  clearMessage();

  try {
    connectWalletButton.disabled = true;
    connectWalletButton.textContent = "Menghubungkan...";

    const wallet = await getWallet(true);

    if (!wallet) {
      throw new Error("Tidak ada akun MetaMask yang dipilih.");
    }

    connectedWallet = wallet;

    walletAddressInput.value = wallet.account;

    connectWalletButton.textContent = "Terhubung";

    showMessage(
      "Wallet berhasil dihubungkan. Silakan lengkapi formulir pendaftaran.",
      "success"
    );
  } catch (error) {
    console.error("Wallet error:", error);

    showMessage(
      error.code === 4001
        ? "Koneksi wallet dibatalkan."
        : error.message || "Gagal menghubungkan MetaMask.",
      "error"
    );

    connectWalletButton.textContent = "Hubungkan";
  } finally {
    connectWalletButton.disabled = false;
  }
});

// ========================================
// 5. MENGAMBIL NONCE DARI BACKEND
// ========================================

async function requestNonce(walletAddress) {
  const response = await fetch(
    `${API_BASE_URL}/api/creators/nonce?wallet_address=${encodeURIComponent(walletAddress)}`
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.detail || "Gagal mendapatkan nonce dari backend."
    );
  }

  return result;
}

// ========================================
// 6. MENGIRIM PENDAFTARAN
// ========================================

async function submitRegistration(data) {
  const response = await fetch(
    `${API_BASE_URL}/api/creators/register`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.detail || "Pendaftaran kreator gagal."
    );
  }

  return result;
}

// ========================================
// 7. PROSES REGISTRASI KREATOR
// ========================================

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  if (!connectedWallet) {
    showMessage(
      "Silakan hubungkan MetaMask terlebih dahulu.",
      "error"
    );
    return;
  }

  const fullName = fullNameInput.value.trim();
  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const description = descriptionInput.value.trim();

  if (!fullName || !username || !email) {
    showMessage(
      "Nama lengkap, username, dan email wajib diisi.",
      "error"
    );
    return;
  }

  try {
    submitButton.disabled = true;
    submitButton.textContent = "Memproses pendaftaran...";

    // Pastikan wallet yang digunakan masih sama.
    const accounts = await connectedWallet.provider.send(
      "eth_accounts",
      []
    );

    if (
      !accounts.length ||
      accounts[0].toLowerCase() !== connectedWallet.account.toLowerCase()
    ) {
      throw new Error(
        "Akun MetaMask berubah. Silakan hubungkan wallet kembali."
      );
    }

    // Ambil nonce dari backend.
    showMessage("Meminta kode verifikasi dari backend...", "info");

    const nonceResult = await requestNonce(
      connectedWallet.account
    );

    // Minta pengguna menandatangani pesan.
    showMessage(
      "Silakan konfirmasi permintaan tanda tangan di MetaMask. Ini bukan transaksi.",
      "info"
    );

    const signature = await connectedWallet.signer.signMessage(
      nonceResult.message
    );

    // Siapkan data pendaftaran.
    const registrationData = {
      full_name: fullName,
      username: username,
      email: email,
      description: description,
      wallet_address: connectedWallet.account,
      nonce: nonceResult.nonce,
      signature: signature
    };

    // Kirim ke backend.
    showMessage("Mengirim data pendaftaran...", "info");

    const result = await submitRegistration(registrationData);

    const registrationStatus =
        result.status ||
        result.registration_status ||
        result.data?.status;

        if (registrationStatus) {
        showMessage(
            `Pendaftaran berhasil! Status akun kamu: ${registrationStatus.toUpperCase()}. Silakan menunggu persetujuan administrator.`,
            "success"
        );
        } else {    
        console.log("Respons backend registrasi:", result);

        showMessage(
            "Pendaftaran berhasil dikirim. Silakan menunggu persetujuan administrator.",
            "success"
        );
        }

    // Form tidak perlu dikirim ulang.
    registerForm.reset();

    walletAddressInput.value = connectedWallet.account;
    connectWalletButton.textContent = "Terhubung";

    submitButton.textContent = "Pendaftaran Terkirim";

  } catch (error) {
    console.error("Registration error:", error);

    let errorMessage = error.message || "Terjadi kesalahan.";

    if (error.code === 4001) {
      errorMessage = "Kamu membatalkan permintaan tanda tangan MetaMask.";
    }

    showMessage(errorMessage, "error");

    submitButton.disabled = false;
    submitButton.textContent = "Daftar sebagai Kreator";
  }
});
